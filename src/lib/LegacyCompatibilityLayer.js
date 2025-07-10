import dbManager from "./LMDBManager.js";
/**
 * Temporary compatibility layer to help migrate from the old cache-based system
 * to the new LMDB transaction-aware system. This layer provides familiar methods
 * while the codebase is being migrated.
 *
 * @deprecated This is a temporary compatibility layer. Use LMDBManager directly.
 */
export class LegacyCompatibilityLayer {
    lmdbManager = dbManager;
    /**
     * Emulates the old cache loading behavior. With LMDB, this is now just
     * ensuring the database structures are loaded.
     */
    async loadCache() {
        await this.lmdbManager.loadCache();
    }
    /**
     * Get a value from the database. This now performs a direct LMDB read.
     * @deprecated Use LMDBManager.get() with transaction ID
     */
    async get(key) {
        return await this.lmdbManager.get(key);
    }
    /**
     * Set a value in the database. This now performs a direct LMDB write.
     * @deprecated Use LMDBManager.set() with transaction ID
     */
    async set(key, value) {
        await this.lmdbManager.set(key, value);
    }
    /**
     * Delete a value from the database.
     * @deprecated Use LMDBManager.delete() with transaction ID
     */
    async delete(key) {
        await this.lmdbManager.delete(key);
    }
    /**
     * Get all keys starting with a prefix.
     * @deprecated Use LMDBManager.getKeysStartingWith() with transaction ID
     */
    async getKeysStartingWith(prefix) {
        return await this.lmdbManager.getKeysStartingWith(prefix);
    }
    /**
     * Check if the database is loaded. With LMDB, this refers to whether
     * database structures have been loaded.
     */
    get isLoaded() {
        return this.lmdbManager.isLoaded;
    }
    /**
     * Flush pending writes. With LMDB, this is a no-op as writes are
     * automatically durable.
     * @deprecated LMDB handles write durability automatically
     */
    async flushWrites() {
        await this.lmdbManager.flushWrites();
    }
    /**
     * Get all database structures.
     */
    getAllDatabaseStructures() {
        return this.lmdbManager.getAllDatabaseStructures();
    }
    /**
     * Get a specific database structure.
     */
    getDatabaseStructure(dbName) {
        return this.lmdbManager.getDatabaseStructure(dbName);
    }
    /**
     * Save database structure.
     */
    async saveDatabaseStructure(db) {
        await this.lmdbManager.saveDatabaseStructure(db);
    }
    /**
     * Delete database structure.
     */
    async deleteDatabaseStructure(dbName) {
        await this.lmdbManager.deleteDatabaseStructure(dbName);
    }
}
// Create a singleton instance for easy migration
export const legacyDbManager = new LegacyCompatibilityLayer();
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
export async function migrateToAsync(operation) {
    const result = operation();
    if (result instanceof Promise) {
        return await result;
    }
    return result;
}
/**
 * Helper to wrap operations in a transaction context
 */
export async function withTransaction(operation, readOnly = false) {
    const txnId = dbManager.beginTransaction(readOnly);
    try {
        const result = await operation(txnId);
        await dbManager.commitTransaction(txnId);
        return result;
    }
    catch (error) {
        await dbManager.rollbackTransaction(txnId);
        throw error;
    }
}
