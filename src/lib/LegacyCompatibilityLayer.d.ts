import { RecordValue } from "./types.js";
/**
 * Temporary compatibility layer to help migrate from the old cache-based system
 * to the new LMDB transaction-aware system. This layer provides familiar methods
 * while the codebase is being migrated.
 *
 * @deprecated This is a temporary compatibility layer. Use LMDBManager directly.
 */
export declare class LegacyCompatibilityLayer {
    private lmdbManager;
    /**
     * Emulates the old cache loading behavior. With LMDB, this is now just
     * ensuring the database structures are loaded.
     */
    loadCache(): Promise<void>;
    /**
     * Get a value from the database. This now performs a direct LMDB read.
     * @deprecated Use LMDBManager.get() with transaction ID
     */
    get(key: string): Promise<RecordValue | undefined>;
    /**
     * Set a value in the database. This now performs a direct LMDB write.
     * @deprecated Use LMDBManager.set() with transaction ID
     */
    set(key: string, value: RecordValue): Promise<void>;
    /**
     * Delete a value from the database.
     * @deprecated Use LMDBManager.delete() with transaction ID
     */
    delete(key: string): Promise<void>;
    /**
     * Get all keys starting with a prefix.
     * @deprecated Use LMDBManager.getKeysStartingWith() with transaction ID
     */
    getKeysStartingWith(prefix: string): Promise<string[]>;
    /**
     * Check if the database is loaded. With LMDB, this refers to whether
     * database structures have been loaded.
     */
    get isLoaded(): boolean;
    /**
     * Flush pending writes. With LMDB, this is a no-op as writes are
     * automatically durable.
     * @deprecated LMDB handles write durability automatically
     */
    flushWrites(): Promise<void>;
    /**
     * Get all database structures.
     */
    getAllDatabaseStructures(): {
        [dbName: string]: import("./types.js").DatabaseStructure;
    };
    /**
     * Get a specific database structure.
     */
    getDatabaseStructure(dbName: string): import("./types.js").DatabaseStructure | undefined;
    /**
     * Save database structure.
     */
    saveDatabaseStructure(db: any): Promise<void>;
    /**
     * Delete database structure.
     */
    deleteDatabaseStructure(dbName: string): Promise<void>;
}
export declare const legacyDbManager: LegacyCompatibilityLayer;
/**
 * Migration helper function to update code that uses synchronous operations
 * to use async operations.
 *
 * Example usage:
 * ```
 * // Old code:
 * const value = dbManager.get(key);
 *
 * // New code:
 * const value = await migrateToAsync(() => dbManager.get(key));
 * ```
 */
export declare function migrateToAsync<T>(operation: () => T | Promise<T>): Promise<T>;
/**
 * Helper to wrap operations in a transaction context
 */
export declare function withTransaction<T>(operation: (txnId: string) => Promise<T>, readOnly?: boolean): Promise<T>;
