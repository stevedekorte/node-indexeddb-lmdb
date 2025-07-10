import * as path from "path";
import { open } from "lmdb";
import { SEPARATOR, PathUtils } from "./PathUtils.js";
import { TransactionManager } from "./TransactionManager.js";
import { createEnvironmentLMDBConfig } from "./LMDBConfig.js";
import { serializeValue, deserializeValue } from "./SerializationUtils.js";
import { ConstraintError } from "./errors.js";
const DB_VERBOSE = process.env.DB_VERBOSE === "1";
class LMDBManager {
    static instance;
    db;
    transactionManager;
    isLoaded = false;
    databaseStructures = new Map();
    log(...args) {
        if (DB_VERBOSE) {
            console.log(...args);
        }
    }
    logError(...args) {
        if (DB_VERBOSE) {
            console.error(...args);
        }
    }
    constructor(dbPath) {
        this.transactionManager = new TransactionManager();
        const config = createEnvironmentLMDBConfig(dbPath);
        this.db = open(config);
    }
    static getInstance(dbPath) {
        if (!LMDBManager.instance) {
            LMDBManager.instance = new LMDBManager(dbPath);
            // Auto-load cache on first access
            LMDBManager.instance.loadCache().catch(err => {
                console.error("Failed to load LMDB cache:", err);
            });
        }
        return LMDBManager.instance;
    }
    async loadCache() {
        this.log("Loading database structures from LMDB");
        try {
            // Load database structures
            let dbList = [];
            try {
                const dbListRaw = await this.db.get(PathUtils.DB_LIST_KEY);
                if (dbListRaw) {
                    dbList = deserializeValue(dbListRaw);
                    this.log("Loaded database list:", dbList);
                }
            }
            catch (error) {
                this.log("No existing database list found. Starting with an empty database.");
                // Initialize with an empty database list
                await this.db.put(PathUtils.DB_LIST_KEY, serializeValue([]));
            }
            for (const dbName of dbList) {
                try {
                    const dbStructureRaw = await this.db.get(`${PathUtils.DB_STRUCTURE_KEY}${dbName}`);
                    if (dbStructureRaw) {
                        const dbStructure = deserializeValue(dbStructureRaw);
                        this.databaseStructures.set(dbName, dbStructure);
                    }
                }
                catch (error) {
                    this.log(`No structure found for database ${dbName}. Skipping.`);
                }
            }
            this.isLoaded = true;
            this.log("Database structures loaded from LMDB");
        }
        catch (error) {
            this.logError("Error loading database:", error);
            this.databaseStructures.clear();
            throw error;
        }
    }
    beginTransaction(readOnly = false, objectStoreNames = []) {
        // NOTE: The lmdb npm package doesn't support explicit transaction management.
        // It uses callback-based transactions (transactionSync/transaction methods) which
        // don't map well to IndexedDB's transaction model where transactions can span
        // multiple operations across different object stores.
        // This implementation tracks transaction state but doesn't provide true ACID isolation.
        const context = this.transactionManager.createContext(readOnly, objectStoreNames);
        this.log(`Started transaction ${context.id} (${readOnly ? 'read-only' : 'read-write'})`);
        return context.id;
    }
    async commitTransaction(txnId) {
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
                    }
                    else if (op.type === 'delete' && op.key) {
                        await this.db.remove(op.key);
                    }
                }
            });
            await this.transactionManager.commitContext(txnId);
            this.log(`Committed transaction ${txnId} with ${context.operations.length} operations`);
        }
        catch (error) {
            // Transaction failed
            context.state = 'aborted';
            this.logError(`Failed to commit transaction ${txnId}:`, error);
            throw error;
        }
    }
    async rollbackTransaction(txnId) {
        await this.transactionManager.rollbackContext(txnId);
        this.log(`Rolled back transaction ${txnId}`);
    }
    getTransactionContext(txnId) {
        if (!txnId)
            return undefined;
        return this.transactionManager.getContext(txnId);
    }
    async saveDatabaseStructure(db) {
        const dbStructure = {
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
    getDatabaseStructure(dbName) {
        return this.databaseStructures.get(dbName);
    }
    getAllDatabaseStructures() {
        if (!this.isLoaded)
            throw new Error("Database not loaded yet. Manually call await dbManager.loadCache() before awaiting import of node-indexeddb/auto in any module");
        return Object.fromEntries(this.databaseStructures);
    }
    async get(key, txnId) {
        if (!this.isLoaded)
            throw new Error("Database not loaded yet");
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
                    }
                    else if (op.type === 'delete') {
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
    async set(key, value, txnId, noOverwrite) {
        this.log("SET", key, value);
        if (!this.isLoaded)
            throw new Error("Database not loaded yet");
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
                    if (!combinedValues.some((existing) => existing.key === val.key &&
                        existing.value === val.value)) {
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
        }
        else {
            // Execute immediately (no transaction or read-only transaction)
            const serializedValue = serializeValue(value);
            await this.db.put(key, serializedValue);
        }
    }
    async delete(key, txnId) {
        if (!this.isLoaded)
            throw new Error("Database not loaded yet");
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
        }
        else {
            // Execute immediately (no transaction or read-only transaction)
            await this.db.remove(key);
        }
    }
    async deleteDatabaseStructure(dbName) {
        this.databaseStructures.delete(dbName);
        const dbList = Array.from(this.databaseStructures.keys());
        await this.db.put(PathUtils.DB_LIST_KEY, serializeValue(dbList));
        await this.db.remove(`${PathUtils.DB_STRUCTURE_KEY}${dbName}`);
    }
    async getKeysStartingWith(prefix, txnId) {
        if (!this.isLoaded)
            throw new Error("Database not loaded yet");
        const context = this.getTransactionContext(txnId);
        if (context && context.state === 'committed') {
            throw new Error(`Transaction ${txnId} is already committed`);
        }
        const keys = [];
        const deletedKeys = new Set();
        const addedKeys = new Set();
        // Check queued operations
        if (context && context.state === 'active' && !context.readOnly) {
            for (const op of context.operations) {
                if (op.key && op.key.startsWith(prefix)) {
                    if (op.type === 'set') {
                        addedKeys.add(op.key);
                        deletedKeys.delete(op.key);
                    }
                    else if (op.type === 'delete') {
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
            }
            else {
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
    async getValuesForKeysStartingWith(prefix, type, txnId) {
        if (!this.isLoaded)
            throw new Error("Database not loaded yet");
        const context = this.getTransactionContext(txnId);
        if (context && context.state === 'committed') {
            throw new Error(`Transaction ${txnId} is already committed`);
        }
        const validatedPrefix = type + SEPARATOR + prefix;
        const records = [];
        const processedKeys = new Set();
        // First, get values from queued operations
        if (context && context.state === 'active' && !context.readOnly) {
            for (const op of context.operations) {
                if (op.key && op.key.startsWith(validatedPrefix)) {
                    processedKeys.add(op.key);
                    if (op.type === 'set' && op.value) {
                        if (Array.isArray(op.value)) {
                            records.push(...op.value);
                        }
                        else {
                            records.push(op.value);
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
                    }
                    else if (deserializedValue) {
                        records.push(deserializedValue);
                    }
                }
            }
            else {
                break; // No longer matching prefix
            }
        }
        return records;
    }
    async getRange(startKey, endKey, txnId) {
        if (!this.isLoaded)
            throw new Error("Database not loaded yet");
        const context = this.getTransactionContext(txnId);
        if (context && context.state === 'committed') {
            throw new Error(`Transaction ${txnId} is already committed`);
        }
        const results = [];
        // If start and end are the same, use a point lookup instead of range
        if (startKey === endKey) {
            const value = await this.db.get(startKey);
            if (value !== undefined) {
                const deserializedValue = deserializeValue(value);
                // Handle arrays of records (for indexes with multiple values per key)
                if (Array.isArray(deserializedValue)) {
                    for (const record of deserializedValue) {
                        results.push([startKey, record]);
                    }
                }
                else {
                    results.push([startKey, deserializedValue]);
                }
            }
        }
        else {
            const cursor = this.db.getRange({ start: startKey, end: endKey });
            for (const { key, value } of cursor) {
                if (typeof key === 'string') {
                    const deserializedValue = deserializeValue(value);
                    // Handle arrays of records (for indexes with multiple values per key)
                    if (Array.isArray(deserializedValue)) {
                        for (const record of deserializedValue) {
                            results.push([key, record]);
                        }
                    }
                    else {
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
        return results;
    }
    async flushWrites() {
        // LMDB automatically handles write durability
        this.log("LMDB handles write durability automatically");
    }
    async validateConstraints(operations) {
        const keysSeen = new Set();
        for (const op of operations) {
            if (!op.key)
                continue;
            // Check if we're trying to add the same key multiple times in this transaction
            if (keysSeen.has(op.key)) {
                this.throwConstraintError(op.key, op.key);
            }
            keysSeen.add(op.key);
            // Check if the key already exists in the database
            const existingValue = await this.db.get(op.key);
            if (existingValue !== undefined) {
                this.throwConstraintError(op.key, op.key);
            }
        }
    }
    throwConstraintError(key, originalKey) {
        // Parse the key to determine if it's an object store or index operation
        const parts = key.split('/');
        // Debug logging to help identify parsing issues
        console.log(`DEBUG throwConstraintError: key="${key}", parts.length=${parts.length}, parts[0]="${parts[0]}"`);
        console.log(`DEBUG parts:`, parts);
        if (parts[0] === 'object' && parts.length >= 4) {
            // Object store operation: object/db/store/key (key might contain slashes)
            // Rejoin everything after the store name as the actual key
            const actualKey = parts.slice(3).join('/');
            const errorMessage = `A record with the key "${actualKey}" already exists in the object store and cannot be overwritten due to the noOverwrite flag being set. Error Code: OBJ_STORE_CONSTRAINT_ERR_002`;
            throw new ConstraintError(errorMessage);
        }
        else if (parts[0] === 'index' && parts.length >= 5) {
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
        }
        else {
            // Unknown key format - debug info
            console.log(`DEBUG: Unknown key format - parts[0]="${parts[0]}", length=${parts.length}, expected object with length >= 4 or index with length >= 5`);
            const errorMessage = `A record with the key "${originalKey}" already exists and cannot be overwritten due to the noOverwrite flag being set. Error Code: UNKNOWN_CONSTRAINT_ERR`;
            throw new ConstraintError(errorMessage);
        }
    }
}
// Export the instance
const dbManager = LMDBManager.getInstance(path.resolve(process.cwd(), "indexeddb"));
export default dbManager;
