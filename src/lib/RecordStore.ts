import FDBKeyRange from "../FDBKeyRange.js";
import cmp from "./cmp.js";
import { Key, Record } from "./types.js";
import dbManager from "./LMDBManager.js";
export type RecordStoreType = "object" | "index" | "";
import { PathUtils, SEPARATOR } from "./PathUtils.js";

class RecordStore {
    private keyPrefix: string;
    private type: RecordStoreType;
    private transactionId?: string;
    
    constructor(keyPrefix: string, type: RecordStoreType) {
        this.keyPrefix = keyPrefix;
        this.type = type;
    }
    
    public setTransactionId(txnId?: string) {
        this.transactionId = txnId;
    }

    private createFullKey(key: Key): string {
        return PathUtils.createRecordStoreKeyPath(
            this.keyPrefix,
            this.type,
            key,
        );
    }

    public async get(key: Key | FDBKeyRange): Promise<Record | undefined> {
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
        
        return value as Record | undefined;
    }

    public async add(newRecord: Record): Promise<void> {
        const fullKey = this.createFullKey(newRecord.key);
        
        if (this.type === "index") {
            // For indexes, we need to handle multiple values per key
            const existingValue = await dbManager.get(fullKey, this.transactionId);
            let records: Record[] = [];
            
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
            
            await dbManager.set(
                fullKey,
                records.length === 1 ? records[0] : records,
                this.transactionId,
            );
        } else {
            // For object stores, just store the record directly
            await dbManager.set(fullKey, newRecord, this.transactionId);
        }
    }

    public async delete(key: Key): Promise<Record[]> {
        const deletedRecords: Record[] = [];
        
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
        } else {
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

    public async deleteByValue(key: Key): Promise<Record[]> {
        const range = key instanceof FDBKeyRange ? key : FDBKeyRange.only(key);
        const deletedRecords: Record[] = [];
        
        // Get all records for this store
        const entries = await dbManager.getRange(
            this.keyPrefix,
            this.keyPrefix + '\xFF',
            this.transactionId
        );
        
        for (const [dbKey, value] of entries) {
            if (!dbKey.startsWith(this.keyPrefix)) continue;
            
            const records = Array.isArray(value) ? value : [value];
            const remainingRecords: Record[] = [];
            
            for (const record of records) {
                if (range.includes(record.value)) {
                    deletedRecords.push(record);
                } else {
                    remainingRecords.push(record);
                }
            }
            
            if (remainingRecords.length === 0) {
                await dbManager.delete(dbKey, this.transactionId);
            } else if (remainingRecords.length < records.length) {
                await dbManager.set(
                    dbKey,
                    remainingRecords.length === 1 ? remainingRecords[0] : remainingRecords,
                    this.transactionId,
                );
            }
        }
        
        return deletedRecords;
    }

    public async clear(): Promise<Record[]> {
        const deletedRecords: Record[] = [];
        
        // Get all records for this store
        const entries = await dbManager.getRange(
            this.keyPrefix,
            this.keyPrefix + '\xFF',
            this.transactionId
        );
        
        for (const [dbKey, value] of entries) {
            if (!dbKey.startsWith(this.keyPrefix)) continue;
            
            const records = Array.isArray(value) ? value : [value];
            deletedRecords.push(...records);
            await dbManager.delete(dbKey, this.transactionId);
        }
        
        return deletedRecords;
    }

    public async getAllRecords(): Promise<Record[]> {
        const allRecords: Record[] = [];
        
        const entries = await dbManager.getRange(
            this.keyPrefix,
            this.keyPrefix + '\xFF',
            this.transactionId
        );
        
        for (const [_, value] of entries) {
            if (Array.isArray(value)) {
                allRecords.push(...value);
            } else if (value) {
                allRecords.push(value);
            }
        }
        
        return allRecords.sort((a, b) => cmp(a.key, b.key));
    }

    public async values(range?: FDBKeyRange, direction: "next" | "prev" = "next") {
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

    private async getRange(range?: FDBKeyRange): Promise<Record[]> {
        const allRecords: Record[] = [];
        
        let startKey = this.keyPrefix;
        let endKey = this.keyPrefix + '\xFF';
        
        if (range) {
            if (range.lower !== undefined) {
                startKey = this.createFullKey(range.lower);
            }
            if (range.upper !== undefined) {
                endKey = this.createFullKey(range.upper);
            }
        }
        
        const entries = await dbManager.getRange(startKey, endKey, this.transactionId);
        
        for (const [dbKey, value] of entries) {
            if (!range || this.matchesKeyRange(dbKey, range)) {
                if (Array.isArray(value)) {
                    allRecords.push(...value);
                } else if (value) {
                    allRecords.push(value);
                }
            }
        }
        
        return allRecords.sort((a, b) => cmp(a.key, b.key));
    }

    private matchesKeyRange(dbKey: string, range: FDBKeyRange): boolean {
        // Extract the actual key from the full database key
        const keyParts = dbKey.split(SEPARATOR);
        const keyStr = keyParts[keyParts.length - 1];
        
        // Parse the key back to its original form
        let key: Key;
        try {
            key = JSON.parse(keyStr);
        } catch {
            key = keyStr;
        }
        
        return range.includes(key);
    }
}

export default RecordStore;