import FDBDatabase from "./FDBDatabase.js";
import FDBObjectStore from "./FDBObjectStore.js";
import FDBRequest from "./FDBRequest.js";
import {
    AbortError,
    InvalidStateError,
    NotFoundError,
    TransactionInactiveError,
} from "./lib/errors.js";
import FakeDOMStringList from "./lib/FakeDOMStringList.js";
import FakeEvent from "./lib/FakeEvent.js";
import FakeEventTarget from "./lib/FakeEventTarget.js";
import { queueTask } from "./lib/scheduling.js";
import {
    EventCallback,
    RequestObj,
    RollbackLog,
    TransactionMode,
} from "./lib/types.js";
import dbManager from "./lib/LMDBManager.js";

// http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#transaction
class FDBTransaction extends FakeEventTarget {
    public _state: "active" | "inactive" | "committing" | "finished" = "active";
    public _started = false;
    public _rollbackLog: RollbackLog = [];
    public _objectStoresCache: Map<string, FDBObjectStore> = new Map();
    private _lmdbTxnId: string;
    private _requestQueue: FDBRequest[] = [];
    private _currentRequestIndex = 0;
    private _requestResolvers: Map<FDBRequest, () => void> = new Map();
    private _autoCommitTimer: any = null;

    public objectStoreNames: FakeDOMStringList;
    public mode: TransactionMode;
    public db: FDBDatabase;
    public error: Error | null = null;
    public onabort: EventCallback | null = null;
    public oncomplete: EventCallback | null = null;
    public onerror: EventCallback | null = null;

    public _scope: Set<string>;
    private _requests: {
        operation: () => void;
        request: FDBRequest;
    }[] = [];

    constructor(storeNames: string[], mode: TransactionMode, db: FDBDatabase) {
        super();

        this._scope = new Set(storeNames);
        this.mode = mode;
        this.db = db;
        this.objectStoreNames = new FakeDOMStringList(
            ...Array.from(this._scope).sort(),
        );
        
        // Create LMDB transaction (read-only for 'readonly' mode)
        const readOnly = mode === 'readonly';
        this._lmdbTxnId = dbManager.beginTransaction(readOnly, storeNames);
    }

    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-aborting-a-transaction
    public async _abort(errName: string | null) {
        // Rollback LMDB transaction
        try {
            await dbManager.rollbackTransaction(this._lmdbTxnId);
        } catch (error) {
            console.error('Failed to rollback LMDB transaction:', error);
        }
        
        for (const f of this._rollbackLog.reverse()) {
            if (typeof f === 'function') {
                const result = f();
                if (result instanceof Promise) {
                    await result;
                }
            }
        }

        if (errName !== null) {
            const e = new DOMException(undefined, errName);
            this.error = e;
        }

        // Abort all pending requests
        for (const request of this._requestQueue) {
            if (request.readyState !== "done") {
                request.readyState = "done"; // This will cancel execution of this request's operation
                if (request.source) {
                    request.result = undefined;
                    request.error = new AbortError();

                    const event = new FakeEvent("error", {
                        bubbles: true,
                        cancelable: true,
                    });
                    event.eventPath = [this.db, this];
                    request.dispatchEvent(event);
                }
            }
        }

        queueTask(() => {
            const event = new FakeEvent("abort", {
                bubbles: true,
                cancelable: false,
            });
            event.eventPath = [this.db];
            this.dispatchEvent(event);
        });

        this._state = "finished";
        
        // Remove from database transactions list
        const index = this.db._rawDatabase.transactions.indexOf(this);
        if (index !== -1) {
            this.db._rawDatabase.transactions.splice(index, 1);
        }
        
        // Trigger database to process next transaction
        this.db._rawDatabase.processTransactions();
    }

    public abort() {
        if (this._state === "committing" || this._state === "finished") {
            throw new InvalidStateError();
        }
        this._state = "active";

        queueTask(async () => {
            await this._abort(null);
        });
    }

    // http://w3c.github.io/IndexedDB/#dom-idbtransaction-objectstore
    public objectStore(name: string) {
        if (this._state !== "active") {
            throw new InvalidStateError();
        }

        const objectStore = this._objectStoresCache.get(name);
        if (objectStore !== undefined) {
            return objectStore;
        }

        const rawObjectStore = this.db._rawDatabase.rawObjectStores.get(name);
        if (!this._scope.has(name) || rawObjectStore === undefined) {
            throw new NotFoundError();
        }

        const objectStore2 = new FDBObjectStore(this, rawObjectStore);
        this._objectStoresCache.set(name, objectStore2);

        return objectStore2;
    }

    private async _waitForTurn(request: FDBRequest): Promise<void> {
        return new Promise<void>((resolve) => {
            // Add request to queue
            this._requestQueue.push(request);
            this._requestResolvers.set(request, resolve);
            
            // Start processing if this is the first request and not a versionchange transaction
            // Versionchange transactions are started by Database.processTransactions
            if (!this._started && this.mode !== "versionchange") {
                queueTask(() => {
                    this._processNextRequest();
                });
            } else {
                // If transaction is already started, check if we need to resume processing
                if (this._started && this._currentRequestIndex >= this._requestQueue.length - 1) {
                    queueTask(() => {
                        this._processNextRequest();
                    });
                }
            }
        });
    }

    private _processNextRequest() {
        if (!this._started) {
            this._started = true;
            
            // Pass transaction ID to all object stores in scope
            for (const storeName of this._scope) {
                const rawObjectStore = this.db._rawDatabase.rawObjectStores.get(storeName);
                if (rawObjectStore) {
                    rawObjectStore._setTransactionId(this._lmdbTxnId);
                }
            }
        }
        
        if (process.env.DB_VERBOSE === "1") {
            console.log(`Processing next request. Queue length: ${this._requestQueue.length}, Current index: ${this._currentRequestIndex}`);
        }

        // Get the next request in the queue
        if (this._currentRequestIndex < this._requestQueue.length) {
            const request = this._requestQueue[this._currentRequestIndex];
            const resolver = this._requestResolvers.get(request);
            
            if (resolver && request.readyState !== "done") {
                this._currentRequestIndex++;
                resolver();
                
                // Process next request after current one completes
                queueTask(() => {
                    this._processNextRequest();
                    // Also check if we should auto-commit after this request
                    if (this.mode !== "versionchange") {
                        this._scheduleAutoCommit();
                    }
                });
            } else {
                // Skip this request and move to next
                this._currentRequestIndex++;
                this._processNextRequest();
            }
        } else {
            // No more requests in queue, but don't auto-commit yet
            // Transaction should stay active until explicitly committed or execution context ends
            if (this.mode === "versionchange" && this._requestQueue.length === 0) {
                // Version change transactions commit immediately when empty
                this._state = "committing";
                this._checkComplete();
            } else {
                // For regular transactions, schedule auto-commit check
                this._scheduleAutoCommit();
            }
        }
    }

    private _checkComplete() {
        // Only auto-commit if explicitly in committing state
        // Normal transactions should only commit when explicitly told to or when scope exits
        if (this._state === "committing" && this._state !== "finished") {
            this._state = "finished";

            if (!this.error) {
                queueTask(async () => {
                    try {
                        // Commit LMDB transaction
                        await dbManager.commitTransaction(this._lmdbTxnId);
                        
                        const event = new FakeEvent("complete");
                        this.dispatchEvent(event);
                        
                        // Remove from database transactions list
                        const index = this.db._rawDatabase.transactions.indexOf(this);
                        if (index !== -1) {
                            this.db._rawDatabase.transactions.splice(index, 1);
                        }
                        
                        // Trigger database to process next transaction
                        this.db._rawDatabase.processTransactions();
                    } catch (error) {
                        console.error('Failed to commit LMDB transaction:', error);
                        await this._abort('UnknownError');
                    }
                });
            }
        }
    }

    private _scheduleAutoCommit() {
        // Clear any existing timer
        if (this._autoCommitTimer) {
            clearTimeout(this._autoCommitTimer);
        }
        
        // Schedule auto-commit for next tick if no more operations are pending
        this._autoCommitTimer = setTimeout(() => {
            if (this._state === "active") {
                const allRequestsDone = this._requestQueue.every(req => req.readyState === "done");
                if (allRequestsDone && this._requestQueue.length > 0) {
                    this._state = "committing";
                    this._checkComplete();
                }
            }
        }, 0);
    }

    private _cancelAutoCommit() {
        if (this._autoCommitTimer) {
            clearTimeout(this._autoCommitTimer);
            this._autoCommitTimer = null;
        }
    }

    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-asynchronously-executing-a-request
    public _execRequestAsync(obj: RequestObj) {
        const source = obj.source;
        const operation = obj.operation;
        let request = Object.hasOwn(obj, "request") ? obj.request : null;

        if (this._state !== "active") {
            throw new TransactionInactiveError();
        }

        // Cancel auto-commit since we're adding a new request
        this._cancelAutoCommit();

        // Request should only be passed for cursors
        if (!request) {
            if (!source) {
                // Special requests like indexes that just need to run some code
                request = new FDBRequest();
            } else {
                request = new FDBRequest();
                request.source = source;
                request.transaction = (source as any).transaction;
            }
        }

        // Create a promise chain for the async operation
        const operationPromise = new Promise<any>((resolve, reject) => {
            // Wait for the transaction to be ready to process this request
            this._waitForTurn(request).then(async () => {
                try {
                    const result = await operation();
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            }).catch(reject);
        });

        // Handle the promise result asynchronously
        operationPromise
            .then((result) => {
                if (request.readyState !== "done") {
                    request.readyState = "done";
                    request.result = result;
                    request.error = undefined;

                    // Fire success event
                    queueTask(() => {
                        if (this._state === "inactive") {
                            this._state = "active";
                        }
                        const event = new FakeEvent("success", {
                            bubbles: false,
                            cancelable: false,
                        });
                        event.eventPath = [this.db, this];
                        request.dispatchEvent(event);
                        
                        // Check if transaction should complete
                        this._checkComplete();
                    });
                }
            })
            .catch((error) => {
                if (request.readyState !== "done") {
                    request.readyState = "done";
                    request.result = undefined;
                    request.error = error;

                    // Fire error event
                    queueTask(() => {
                        if (this._state === "inactive") {
                            this._state = "active";
                        }
                        const event = new FakeEvent("error", {
                            bubbles: true,
                            cancelable: true,
                        });
                        event.eventPath = [this.db, this];
                        request.dispatchEvent(event);

                        // Default action: abort transaction if not canceled
                        if (!event.canceled) {
                            queueTask(async () => {
                                await this._abort(error.name);
                            });
                        }
                    });
                }
            });

        return request;
    }

    // This method is now deprecated but kept for compatibility
    // The new promise-based approach handles transaction processing
    public async _start() {
        // Transaction processing is now handled automatically by _processNextRequest
        // This method is only called by Database.processTransactions for compatibility
        if (!this._started) {
            // For versionchange transactions, we need to start processing here
            if (this.mode === "versionchange") {
                this._processNextRequest();
            }
        }
    }

    public commit() {
        if (this._state !== "active") {
            throw new InvalidStateError();
        }

        this._state = "committing";
        
        // Trigger completion check which will handle the actual commit
        queueTask(() => {
            this._checkComplete();
        });
    }


    public toString() {
        return "[object IDBRequest]";
    }
}

export default FDBTransaction;
