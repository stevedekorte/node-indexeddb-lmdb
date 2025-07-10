import FDBKeyRange from "../FDBKeyRange.js";
import cmp from "./cmp.js";
import dbManager from "./LMDBManager.js";
import { PathUtils, SEPARATOR } from "./PathUtils.js";
class RecordStore {
    keyPrefix;
    type;
    transactionId;
    constructor(keyPrefix, type) {
        this.keyPrefix = keyPrefix;
        this.type = type;
    }
    setTransactionId(txnId) {
        this.transactionId = txnId;
    }
    createFullKey(key) {
        return PathUtils.createRecordStoreKeyPath(this.keyPrefix, this.type, key);
    }
    async get(key) {
        if (key instanceof FDBKeyRange) {
            // For key ranges, we need to do a range query
            const results = await this.getRange(key);
            return results[0]; // Return first matching record
        }
        const fullKey = this.createFullKey(key);
        const value = await dbManager.get(fullKey, this.transactionId);
        if (this.type === "index" && Array.isArray(value)) {
            // For indexes, return the first record if multiple exist
            return value[0];
        }
        return value;
    }
    async add(newRecord, noOverwrite) {
        const fullKey = this.createFullKey(newRecord.key);
        if (this.type === "index") {
            // For indexes, we need to handle multiple values per key
            const existingValue = await dbManager.get(fullKey, this.transactionId);
            let records = [];
            if (existingValue) {
                records = Array.isArray(existingValue) ? existingValue : [existingValue];
            }
            // Add the new record, maintaining sort order by value
            let inserted = false;
            for (let i = 0; i < records.length; i++) {
                if (cmp(records[i].value, newRecord.value) >= 0) {
                    records.splice(i, 0, newRecord);
                    inserted = true;
                    break;
                }
            }
            if (!inserted) {
                records.push(newRecord);
            }
            await dbManager.set(fullKey, records.length === 1 ? records[0] : records, this.transactionId, noOverwrite);
        }
        else {
            // For object stores, just store the record directly
            await dbManager.set(fullKey, newRecord, this.transactionId, noOverwrite);
        }
    }
    async delete(key) {
        const deletedRecords = [];
        if (key instanceof FDBKeyRange) {
            // Delete all records in the range
            const startKey = key.lower !== undefined ? this.createFullKey(key.lower) : this.keyPrefix;
            const endKey = key.upper !== undefined ? this.createFullKey(key.upper) : this.keyPrefix + '\xFF';
            const entries = await dbManager.getRange(startKey, endKey, this.transactionId);
            for (const [dbKey, value] of entries) {
                if (this.matchesKeyRange(dbKey, key)) {
                    const records = Array.isArray(value) ? value : [value];
                    deletedRecords.push(...records);
                    await dbManager.delete(dbKey, this.transactionId);
                }
            }
        }
        else {
            // Delete specific key
            const fullKey = this.createFullKey(key);
            const value = await dbManager.get(fullKey, this.transactionId);
            if (value) {
                const records = Array.isArray(value) ? value : [value];
                deletedRecords.push(...records);
                await dbManager.delete(fullKey, this.transactionId);
            }
        }
        return deletedRecords;
    }
    async deleteByValue(key) {
        const range = key instanceof FDBKeyRange ? key : FDBKeyRange.only(key);
        const deletedRecords = [];
        // Get all records for this store
        const entries = await dbManager.getRange(this.keyPrefix, this.keyPrefix + '\xFF', this.transactionId);
        for (const [dbKey, value] of entries) {
            if (!dbKey.startsWith(this.keyPrefix))
                continue;
            const records = Array.isArray(value) ? value : [value];
            const remainingRecords = [];
            for (const record of records) {
                if (range.includes(record.value)) {
                    deletedRecords.push(record);
                }
                else {
                    remainingRecords.push(record);
                }
            }
            if (remainingRecords.length === 0) {
                await dbManager.delete(dbKey, this.transactionId);
            }
            else if (remainingRecords.length < records.length) {
                await dbManager.set(dbKey, remainingRecords.length === 1 ? remainingRecords[0] : remainingRecords, this.transactionId);
            }
        }
        return deletedRecords;
    }
    async clear() {
        const deletedRecords = [];
        // Get all records for this store
        const entries = await dbManager.getRange(this.keyPrefix, this.keyPrefix + '\xFF', this.transactionId);
        for (const [dbKey, value] of entries) {
            if (!dbKey.startsWith(this.keyPrefix))
                continue;
            const records = Array.isArray(value) ? value : [value];
            deletedRecords.push(...records);
            await dbManager.delete(dbKey, this.transactionId);
        }
        return deletedRecords;
    }
    async getAllRecords() {
        const allRecords = [];
        const entries = await dbManager.getRange(this.keyPrefix, this.keyPrefix + '\xFF', this.transactionId);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const [_key, value] of entries) {
            if (Array.isArray(value)) {
                allRecords.push(...value);
            }
            else if (value) {
                allRecords.push(value);
            }
        }
        return allRecords.sort((a, b) => cmp(a.key, b.key));
    }
    async values(range, direction = "next") {
        const records = await this.getRange(range);
        if (direction === "prev") {
            records.reverse();
        }
        return {
            [Symbol.iterator]: () => {
                let i = 0;
                return {
                    next: () => {
                        if (i >= records.length) {
                            return { done: true, value: undefined };
                        }
                        return { done: false, value: records[i++] };
                    },
                };
            },
        };
    }
    async getRange(range) {
        const allRecords = [];
        // Include type prefix in the search keys
        let startKey = this.type + SEPARATOR + this.keyPrefix;
        let endKey = this.type + SEPARATOR + this.keyPrefix + '\xFF';
        if (range) {
            if (range.lower !== undefined) {
                startKey = this.createFullKey(range.lower);
            }
            if (range.upper !== undefined) {
                endKey = this.createFullKey(range.upper);
                // Only extend the end key for true range queries, not point queries
                if (!range.upperOpen && range.lower !== range.upper) {
                    endKey = endKey + '\x00'; // Add null byte to make it inclusive
                }
            }
        }
        const entries = await dbManager.getRange(startKey, endKey, this.transactionId);
        for (const [dbKey, value] of entries) {
            if (!range || this.matchesKeyRange(dbKey, range)) {
                if (Array.isArray(value)) {
                    allRecords.push(...value);
                }
                else if (value) {
                    allRecords.push(value);
                }
            }
        }
        return allRecords.sort((a, b) => cmp(a.key, b.key));
    }
    matchesKeyRange(dbKey, range) {
        // Extract the actual key from the full database key
        const keyParts = dbKey.split(SEPARATOR);
        const encodedKey = keyParts[keyParts.length - 1];
        // Decode the key back to its original form
        const key = PathUtils.decodeKey(encodedKey);
        return range.includes(key);
    }
}
export default RecordStore;
