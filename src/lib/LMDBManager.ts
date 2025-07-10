import * as path from "path";
import { open, Database as LMDBDatabase } from "lmdb";
import { Record, RecordValue, DatabaseStructure } from "./types.js";
import Database from "./Database.js";
import { RecordStoreType } from "./RecordStore.js";
import { SEPARATOR, PathUtils } from "./PathUtils.js";
import { TransactionManager, TransactionContext } from "./TransactionManager.js";
import { createEnvironmentLMDBConfig } from "./LMDBConfig.js";
import { serializeValue, deserializeValue } from "./SerializationUtils.js";
import { ConstraintError } from "./errors.js";

const DB_VERBOSE = process.env.DB_VERBOSE === "1";

class LMDBManager {
    private static instance: LMDBManager;
    private db: LMDBDatabase;
    private transactionManager: TransactionManager;
    public isLoaded: boolean = false;
    private databaseStructures: Map<string, DatabaseStructure> = new Map();

    private log(...args: any[]) {
        if (DB_VERBOSE) {
            console.log(...args);
        }
    }

    private logError(...args: any[]) {
        if (DB_VERBOSE) {
            console.error(...args);
        }
    }

    private constructor(dbPath: string) {
        this.transactionManager = new TransactionManager();
        const config = createEnvironmentLMDBConfig(dbPath);
        this.db = open(config);
    }

    public static getInstance(dbPath: string): LMDBManager {
        if (!LMDBManager.instance) {
            LMDBManager.instance = new LMDBManager(dbPath);
            // Auto-load cache on first access
            LMDBManager.instance.loadCache().catch(err => {
                console.error("Failed to load LMDB cache:", err);
            });
        }
        return LMDBManager.instance;
    }

    public async loadCache() {
        this.log("Loading database structures from LMDB");
        try {
            // Load database structures
            let dbList: string[] = [];
            try {
                const dbListRaw = await this.db.get(PathUtils.DB_LIST_KEY);
                if (dbListRaw) {
                    dbList = deserializeValue(dbListRaw);
                    this.log("Loaded database list:", dbList);
                }
            } catch (error) {
                this.log(
                    "No existing database list found. Starting with an empty database.",
                );
                // Initialize with an empty database list
                await this.db.put(
                    PathUtils.DB_LIST_KEY,
                    serializeValue([]),
                );
            }

            for (const dbName of dbList) {
                try {
                    const dbStructureRaw = await this.db.get(
                        `${PathUtils.DB_STRUCTURE_KEY}${dbName}`,
                    );
                    if (dbStructureRaw) {
                        const dbStructure: DatabaseStructure =
                            deserializeValue(dbStructureRaw);
                        this.databaseStructures.set(dbName, dbStructure);
                    }
                } catch (error) {
                    this.log(
                        `No structure found for database ${dbName}. Skipping.`,
                    );
                }
            }

            this.isLoaded = true;
            this.log("Database structures loaded from LMDB");
        } catch (error) {
            this.logError("Error loading database:", error);
            this.databaseStructures.clear();
            throw error;
        }
    }

    public beginTransaction(readOnly: boolean = false, objectStoreNames: string[] = []): string {
        // NOTE: The lmdb npm package doesn't support explicit transaction management.
        // It uses callback-based transactions (transactionSync/transaction methods) which
        // don't map well to IndexedDB's transaction model where transactions can span
        // multiple operations across different object stores.
        // This implementation tracks transaction state but doesn't provide true ACID isolation.
        const context = this.transactionManager.createContext(readOnly, objectStoreNames);
        this.log(`Started transaction ${context.id} (${readOnly ? 'read-only' : 'read-write'})`);
        return context.id;
    }

    public async commitTransaction(txnId: string): Promise<void> {
        const context = this.getTransactionContext(txnId);
        if (!context) {
            throw new Error(`Transaction ${txnId} not found`);
        }
        
        if (context.state !== 'active') {
            throw new Error(`Transaction ${txnId} is not active`);
        }
        
        // For read-only transactions or empty transactions, just update state
        if (context.readOnly || context.operations.length === 0) {
            await this.transactionManager.commitContext(txnId);
            this.log(`Committed transaction ${txnId}`);
            return;
        }
        
        // Check for constraint violations (add() operations with duplicate keys)
        const addOperations = context.operations.filter(op => op.type === 'set' && op.noOverwrite);
        await this.validateConstraints(addOperations);

        // Execute all write operations in a single LMDB transaction
        try {
            await this.db.transaction(async () => {
                for (const op of context.operations) {
                    if (op.type === 'set' && op.key) {
                        const serializedValue = serializeValue(op.value);
                        
                        // Debug key/value size issues if needed
                        if (op.key.length > 4026) {
                            console.warn(`LMDB key too long: ${op.key.length} bytes (max 4026)`);
                            console.warn(`Key: ${op.key.substring(0, 100)}...`);
                            throw new Error(`Key too long: ${op.key.length} bytes exceeds maximum of 4026 bytes`);
                        }
                        
                        // Check for very large values that might cause issues
                        if (serializedValue.length > 100 * 1024 * 1024) { // 100MB
                            console.warn(`Large value: ${Math.round(serializedValue.length / 1024 / 1024)}MB`);
                        }
                        
                        await this.db.put(op.key, serializedValue);
                    } else if (op.type === 'delete' && op.key) {
                        await this.db.remove(op.key);
                    }
                }
            });
            
            await this.transactionManager.commitContext(txnId);
            this.log(`Committed transaction ${txnId} with ${context.operations.length} operations`);
        } catch (error) {
            // Transaction failed
            context.state = 'aborted';
            this.logError(`Failed to commit transaction ${txnId}:`, error);
            throw error;
        }
    }

    public async rollbackTransaction(txnId: string): Promise<void> {
        await this.transactionManager.rollbackContext(txnId);
        this.log(`Rolled back transaction ${txnId}`);
    }

    private getTransactionContext(txnId?: string): TransactionContext | undefined {
        if (!txnId) return undefined;
        return this.transactionManager.getContext(txnId);
    }

    public async saveDatabaseStructure(db: Database) {
        const dbStructure: DatabaseStructure = {
            name: db.name,
            version: db.version,
            objectStores: {},
        };

        for (const [name, objectStore] of db.rawObjectStores) {
            dbStructure.objectStores[name] = {
                keyPath: objectStore.keyPath,
                autoIncrement: objectStore.autoIncrement,
                indexes: {},
            };

            for (const [indexName, index] of objectStore.rawIndexes) {
                dbStructure.objectStores[name].indexes[indexName] = {
                    keyPath: index.keyPath,
                    multiEntry: index.multiEntry,
                    unique: index.unique,
                };
            }
        }

        const dbList = Array.from(this.databaseStructures.keys());
        if (!dbList.includes(db.name)) {
            dbList.push(db.name);
            await this.db.put(PathUtils.DB_LIST_KEY, serializeValue(dbList));
        }

        this.databaseStructures.set(db.name, dbStructure);
        
        const structureKey = `${PathUtils.DB_STRUCTURE_KEY}${db.name}`;
        const serializedStructure = serializeValue(dbStructure);
        
        // Debug key size issues
        if (structureKey.length > 4026) {
            console.warn(`Database structure key too long: ${structureKey.length} bytes (max 4026)`);
            console.warn(`Key: ${structureKey.substring(0, 100)}...`);
        }
        
        await this.db.put(structureKey, serializedStructure);
        
        this.log("Saved database structure", dbStructure);
    }

    public getDatabaseStructure(dbName: string): DatabaseStructure | undefined {
        return this.databaseStructures.get(dbName);
    }

    public getAllDatabaseStructures(): { [dbName: string]: DatabaseStructure } {
        if (!this.isLoaded)
            throw new Error(
                "Database not loaded yet. Manually call await dbManager.loadCache() before awaiting import of node-indexeddb/auto in any module",
            );
        return Object.fromEntries(this.databaseStructures);
    }

    public async get(key: string, txnId?: string): Promise<RecordValue | undefined> {
        if (!this.isLoaded) throw new Error("Database not loaded yet");
        
        const context = this.getTransactionContext(txnId);
        if (context && context.state === 'committed') {
            throw new Error(`Transaction ${txnId} is already committed`);
        }

        // Check if this key has been modified in the current transaction
        // (only for active transactions)
        if (context && context.state === 'active' && !context.readOnly) {
            // Look for the most recent operation on this key
            for (let i = context.operations.length - 1; i >= 0; i--) {
                const op = context.operations[i];
                if (op.key && op.key === key) {
                    if (op.type === 'set') {
                        this.log("GET (from transaction)", key, op.value);
                        return op.value;
                    } else if (op.type === 'delete') {
                        this.log("GET (from transaction)", key, undefined);
                        return undefined;
                    }
                }
            }
        }

        const rawValue = await this.db.get(key);
        const value = rawValue ? deserializeValue(rawValue) : rawValue;
            
        this.log("GET", key, value);
        
        if (txnId) {
            this.transactionManager.recordOperation(txnId, {
                type: 'get',
                key,
            });
        }
        
        return value;
    }

    public async set(key: string, value: RecordValue, txnId?: string, noOverwrite?: boolean): Promise<void> {
        this.log("SET", key, value);
        if (!this.isLoaded) throw new Error("Database not loaded yet");

        const context = this.getTransactionContext(txnId);
        if (context && context.state === 'committed') {
            throw new Error(`Transaction ${txnId} is already committed`);
        }

        // Check if this is an index entry
        const isIndex = key.startsWith("index/");

        // For index entries, we need to handle multiple values
        if (isIndex) {
            const existingValue = await this.get(key, txnId);
            if (existingValue) {
                // Convert to array format if needed
                const existingArray = Array.isArray(existingValue)
                    ? existingValue
                    : [existingValue];
                const valueArray = Array.isArray(value) ? value : [value];

                // Merge arrays and remove duplicates
                const combinedValues = [...existingArray];
                for (const val of valueArray) {
                    if (
                        !combinedValues.some(
                            (existing) =>
                                existing.key === val.key &&
                                existing.value === val.value,
                        )
                    ) {
                        combinedValues.push(val);
                    }
                }
                value = combinedValues;
            }
        }

        if (txnId && context && context.state === 'active' && !context.readOnly) {
            // Queue the operation for later execution in the transaction
            this.transactionManager.recordOperation(txnId, {
                type: 'set',
                key,
                value,
                noOverwrite,
            });
            this.log("SET (queued)", key, value);
        } else {
            // Execute immediately (no transaction or read-only transaction)
            const serializedValue = serializeValue(value);
            await this.db.put(key, serializedValue);
        }
    }

    public async delete(key: string, txnId?: string): Promise<void> {
        if (!this.isLoaded) throw new Error("Database not loaded yet");
        
        const context = this.getTransactionContext(txnId);
        if (context && context.state === 'committed') {
            throw new Error(`Transaction ${txnId} is already committed`);
        }

        this.log("DELETE", key);
        
        if (txnId && context && context.state === 'active' && !context.readOnly) {
            // Queue the operation for later execution in the transaction
            this.transactionManager.recordOperation(txnId, {
                type: 'delete',
                key,
            });
            this.log("DELETE (queued)", key);
        } else {
            // Execute immediately (no transaction or read-only transaction)
            await this.db.remove(key);
        }
    }

    public async deleteDatabaseStructure(dbName: string) {
        this.databaseStructures.delete(dbName);
        const dbList = Array.from(this.databaseStructures.keys());
        await this.db.put(PathUtils.DB_LIST_KEY, serializeValue(dbList));
        await this.db.remove(`${PathUtils.DB_STRUCTURE_KEY}${dbName}`);
    }

    public async getKeysStartingWith(prefix: string, txnId?: string): Promise<string[]> {
        if (!this.isLoaded) throw new Error("Database not loaded yet");
        
        const context = this.getTransactionContext(txnId);
        if (context && context.state === 'committed') {
            throw new Error(`Transaction ${txnId} is already committed`);
        }

        const keys: string[] = [];
        const deletedKeys = new Set<string>();
        const addedKeys = new Set<string>();
        
        // Check queued operations
        if (context && context.state === 'active' && !context.readOnly) {
            for (const op of context.operations) {
                if (op.key && op.key.startsWith(prefix)) {
                    if (op.type === 'set') {
                        addedKeys.add(op.key);
                        deletedKeys.delete(op.key);
                    } else if (op.type === 'delete') {
                        deletedKeys.add(op.key);
                        addedKeys.delete(op.key);
                    }
                }
            }
        }
        
        const cursor = this.db.getRange({ start: prefix });
        
        for (const { key } of cursor) {
            if (typeof key === 'string' && key.startsWith(prefix)) {
                if (!deletedKeys.has(key)) {
                    keys.push(key);
                }
            } else {
                break; // No longer matching prefix
            }
        }
        
        // Add keys from queued operations
        for (const key of addedKeys) {
            if (!keys.includes(key)) {
                keys.push(key);
            }
        }
        
        return keys;
    }

    public async getValuesForKeysStartingWith(
        prefix: string,
        type: RecordStoreType,
        txnId?: string,
    ): Promise<Record[]> {
        if (!this.isLoaded) throw new Error("Database not loaded yet");
        
        const context = this.getTransactionContext(txnId);
        if (context && context.state === 'committed') {
            throw new Error(`Transaction ${txnId} is already committed`);
        }

        const validatedPrefix = type + SEPARATOR + prefix;
        const records: Record[] = [];
        const processedKeys = new Set<string>();
        
        // First, get values from queued operations
        if (context && context.state === 'active' && !context.readOnly) {
            for (const op of context.operations) {
                if (op.key && op.key.startsWith(validatedPrefix)) {
                    processedKeys.add(op.key);
                    if (op.type === 'set' && op.value) {
                        if (Array.isArray(op.value)) {
                            records.push(...op.value);
                        } else {
                            records.push(op.value as Record);
                        }
                    }
                    // deleted keys are ignored
                }
            }
        }
        
        const cursor = this.db.getRange({ start: validatedPrefix });
        
        for (const { key, value } of cursor) {
            if (typeof key === 'string' && key.startsWith(validatedPrefix)) {
                if (!processedKeys.has(key)) {
                    const deserializedValue = deserializeValue(value);
                    if (Array.isArray(deserializedValue)) {
                        records.push(...deserializedValue);
                    } else if (deserializedValue) {
                        records.push(deserializedValue);
                    }
                }
            } else {
                break; // No longer matching prefix
            }
        }
        
        return records;
    }

    public async getRange(startKey: string, endKey: string, txnId?: string): Promise<Array<[string, RecordValue]>> {
        if (!this.isLoaded) throw new Error("Database not loaded yet");
        
        const context = this.getTransactionContext(txnId);
        if (context && context.state === 'committed') {
            throw new Error(`Transaction ${txnId} is already committed`);
        }

        const results: Array<[string, RecordValue]> = [];
        const processedKeys = new Set<string>();
        
        // First, check for operations in the current transaction that fall within the range
        if (context && context.state === 'active' && !context.readOnly) {
            for (const op of context.operations) {
                if (op.key && op.key >= startKey && op.key <= endKey) {
                    processedKeys.add(op.key);
                    if (op.type === 'set' && op.value) {
                        // Handle arrays of records (for indexes with multiple values per key)
                        if (Array.isArray(op.value)) {
                            for (const record of op.value) {
                                results.push([op.key, record]);
                            }
                        } else {
                            results.push([op.key, op.value]);
                        }
                    }
                    // deleted keys are ignored (won't be added to results)
                }
            }
        }
        
        // Then get values from LMDB, but skip keys we already processed from the transaction
        if (startKey === endKey) {
            // Point lookup
            if (!processedKeys.has(startKey)) {
                const value = await this.db.get(startKey);
                if (value !== undefined) {
                    const deserializedValue = deserializeValue(value);
                    
                    // Handle arrays of records (for indexes with multiple values per key)
                    if (Array.isArray(deserializedValue)) {
                        for (const record of deserializedValue) {
                            results.push([startKey, record]);
                        }
                    } else {
                        results.push([startKey, deserializedValue]);
                    }
                }
            }
        } else {
            // Range lookup
            const cursor = this.db.getRange({ start: startKey, end: endKey });
            
            for (const { key, value } of cursor) {
                if (typeof key === 'string' && !processedKeys.has(key)) {
                    const deserializedValue = deserializeValue(value);
                    // Handle arrays of records (for indexes with multiple values per key)
                    if (Array.isArray(deserializedValue)) {
                        for (const record of deserializedValue) {
                            results.push([key, record]);
                        }
                    } else {
                        results.push([key, deserializedValue]);
                    }
                }
            }
        }
        
        if (txnId) {
            this.transactionManager.recordOperation(txnId, {
                type: 'getRange',
                startKey,
                endKey,
            });
        }
        
        // Sort results by key to maintain proper ordering
        results.sort((a, b) => a[0].localeCompare(b[0]));
        
        return results;
    }

    public async flushWrites(): Promise<void> {
        // LMDB automatically handles write durability
        this.log("LMDB handles write durability automatically");
    }

    private async validateConstraints(operations: any[]): Promise<void> {
        const keysToAdd = new Map<string, any[]>(); // Track all add operations by key
        const keysDeleted = new Set<string>();
        const keysPut = new Set<string>(); // Track put operations (updates)
        
        // First pass: categorize all operations
        for (const op of operations) {
            if (!op.key) continue;
            
            if (op.type === 'set' && op.noOverwrite) {
                // This is an add() operation
                if (!keysToAdd.has(op.key)) {
                    keysToAdd.set(op.key, []);
                }
                keysToAdd.get(op.key)!.push(op);
            } else if (op.type === 'set' && !op.noOverwrite) {
                // This is a put() operation (update)
                keysPut.add(op.key);
            } else if (op.type === 'delete') {
                keysDeleted.add(op.key);
            }
        }
        
        // Second pass: validate add() operations
        for (const [key, addOps] of keysToAdd) {
            // Check if we're trying to add the same key multiple times in this transaction
            if (addOps.length > 1) {
                this.log(`Constraint violation: Multiple add() for key ${key} in same transaction`);
                this.throwConstraintError(key, key);
            }
            
            // If the key was deleted in this transaction, adding it back is fine
            if (keysDeleted.has(key)) {
                this.log(`Key ${key} was deleted then added in same transaction - allowed`);
                continue;
            }
            
            // If the key was put (updated) in this transaction, then trying to add it is wrong
            if (keysPut.has(key)) {
                this.log(`Constraint violation: Key ${key} was put() then add() in same transaction`);
                this.throwConstraintError(key, key);
            }
            
            // Check if the key already exists in the database
            try {
                const existingValue = await this.db.get(key);
                if (existingValue !== undefined) {
                    this.log(`Constraint violation: add() for existing key ${key}`);
                    this.throwConstraintError(key, key);
                }
            } catch (error) {
                // If we can't check the database, log it but don't fail
                this.logError(`Could not check existence of key ${key}:`, error);
            }
        }
    }
    
    private throwConstraintError(key: string, originalKey: string): never {
        // Parse the key to determine if it's an object store or index operation
        const parts = key.split('/');
        
        if (parts[0] === 'object' && parts.length >= 4) {
            // Object store operation: object/db/store/key (key might contain slashes)
            // Rejoin everything after the store name as the actual key
            const actualKey = parts.slice(3).join('/');
            const errorMessage = `A record with the key "${actualKey}" already exists in the object store and cannot be overwritten due to the noOverwrite flag being set. Error Code: OBJ_STORE_CONSTRAINT_ERR_002`;
            throw new ConstraintError(errorMessage);
        } else if (parts[0] === 'index' && parts.length >= 5) {
            // Index operation: index/db/store/index/indexKey (indexKey might contain slashes)
            const [, dbName, storeName, indexName] = parts;
            const indexKey = parts.slice(4).join('/');
            
            // Get the database structure to check if this is a unique index
            const dbStructure = this.getDatabaseStructure(dbName);
            if (dbStructure && dbStructure.objectStores[storeName] && dbStructure.objectStores[storeName].indexes[indexName]) {
                const indexInfo = dbStructure.objectStores[storeName].indexes[indexName];
                if (indexInfo.unique) {
                    const errorMessage = `A record with the specified key "${indexKey}" already exists in the index, which violates the unique constraint. Key properties: "${indexKey}". Error Code: IDX_CONSTRAINT_ERR_001`;
                    throw new ConstraintError(errorMessage);
                }
            }
            
            // If not a unique index, this shouldn't be a constraint violation
            // This could happen if there's an issue with our logic
            const errorMessage = `Unexpected constraint violation for non-unique index. Key: ${key}`;
            throw new ConstraintError(errorMessage);
        } else {
            // Unknown key format
            const errorMessage = `A record with the key "${originalKey}" already exists and cannot be overwritten due to the noOverwrite flag being set. Error Code: UNKNOWN_CONSTRAINT_ERR`;
            throw new ConstraintError(errorMessage);
        }
    }
}

// Export the instance
const dbManager = LMDBManager.getInstance(
    path.resolve(process.cwd(), "indexeddb"),
);
export default dbManager;