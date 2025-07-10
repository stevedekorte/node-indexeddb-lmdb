import { Transaction } from "lmdb";

export interface TransactionOperation {
    type: 'get' | 'set' | 'delete' | 'getRange';
    key?: string;
    value?: any;
    startKey?: string;
    endKey?: string;
    timestamp: number;
    noOverwrite?: boolean; // For add() operations that should not overwrite existing keys
}

export interface TransactionContext {
    id: string;
    readOnly: boolean;
    lmdbTxn?: Transaction; // Optional - lmdb package doesn't support explicit transactions
    startTime: number;
    operations: TransactionOperation[];
    state: 'active' | 'committed' | 'aborted';
    objectStoreNames: string[];
}

export class TransactionManager {
    private contexts: Map<string, TransactionContext> = new Map();
    private transactionCounter: number = 0;

    public createContext(readOnly: boolean = false, objectStoreNames: string[] = []): TransactionContext {
        const id = `txn_${++this.transactionCounter}_${Date.now()}`;
        const context: TransactionContext = {
            id,
            readOnly,
            startTime: Date.now(),
            operations: [],
            state: 'active',
            objectStoreNames,
        };
        
        this.contexts.set(id, context);
        return context;
    }

    public getContext(txnId: string): TransactionContext | undefined {
        return this.contexts.get(txnId);
    }

    public async commitContext(txnId: string): Promise<void> {
        const context = this.contexts.get(txnId);
        if (!context) {
            throw new Error(`Transaction context ${txnId} not found`);
        }
        if (context.state !== 'active') {
            throw new Error(`Transaction ${txnId} is not active (state: ${context.state})`);
        }

        context.state = 'committed';
        // Keep context for a short time to handle any pending operations
        setTimeout(() => {
            this.contexts.delete(txnId);
        }, 1000);
    }

    public async rollbackContext(txnId: string): Promise<void> {
        const context = this.contexts.get(txnId);
        if (!context) {
            // Transaction might already be cleaned up - silently ignore
            return;
        }
        if (context.state === 'aborted') {
            // Transaction is already aborted - silently ignore
            return;
        }
        if (context.state === 'committed') {
            // Cannot rollback a committed transaction
            throw new Error(`Cannot rollback transaction ${txnId} - already committed`);
        }

        context.state = 'aborted';
        // Keep context for a short time to handle any pending operations
        setTimeout(() => {
            this.contexts.delete(txnId);
        }, 1000);
    }

    public recordOperation(txnId: string, operation: Omit<TransactionOperation, 'timestamp'>): void {
        const context = this.contexts.get(txnId);
        if (!context) {
            // Transaction might have been aborted or committed - silently ignore
            return;
        }
        if (context.state !== 'active') {
            // Transaction is no longer active - silently ignore
            return;
        }

        context.operations.push({
            ...operation,
            timestamp: Date.now(),
        });
    }

    public getActiveTransactionCount(): number {
        let count = 0;
        for (const context of this.contexts.values()) {
            if (context.state === 'active') {
                count++;
            }
        }
        return count;
    }

    public getAllActiveTransactions(): TransactionContext[] {
        const active: TransactionContext[] = [];
        for (const context of this.contexts.values()) {
            if (context.state === 'active') {
                active.push(context);
            }
        }
        return active;
    }

    public cleanupStaleTransactions(maxAge: number = 5 * 60 * 1000): number {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [id, context] of this.contexts.entries()) {
            if (context.state === 'active' && (now - context.startTime) > maxAge) {
                context.state = 'aborted';
                this.contexts.delete(id);
                cleaned++;
            }
        }
        
        return cleaned;
    }
}