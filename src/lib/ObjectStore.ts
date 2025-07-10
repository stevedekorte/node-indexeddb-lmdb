import FDBKeyRange from "../FDBKeyRange.js";
import Database from "./Database.js";
import { ConstraintError, DataError } from "./errors.js";
import extractKey from "./extractKey.js";
import Index from "./Index.js";
import KeyGenerator from "./KeyGenerator.js";
import RecordStore from "./RecordStore.js";
import { Key, KeyPath, Record, RollbackLog } from "./types.js";
import dbManager from "./LMDBManager.js";
import { PathUtils } from "./PathUtils.js";
// http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-object-store
class ObjectStore {
    public deleted = false;
    public readonly rawDatabase: Database;
    public readonly records;
    public readonly rawIndexes: Map<string, Index> = new Map();
    public name: string;
    public readonly keyPath: KeyPath | null;
    public readonly autoIncrement: boolean;
    public readonly keyGenerator: KeyGenerator | null;
    private _transactionId?: string;

    constructor(
        rawDatabase: Database,
        name: string,
        keyPath: KeyPath | null,
        autoIncrement: boolean,
    ) {
        this.rawDatabase = rawDatabase;
        this.keyGenerator = autoIncrement === true ? new KeyGenerator() : null;
        this.deleted = false;

        this.name = name;
        this.keyPath = keyPath;
        this.autoIncrement = autoIncrement;
        const keyPrefix = PathUtils.createObjectStoreKeyPath(
            this.rawDatabase.name,
            this.name,
        );
        this.records = new RecordStore(keyPrefix, "object");
        // this.records.setKeyPrefix(keyPrefix);
        // console.log(
        //     "IDB|ObjectStore constructor,",
        //     this.name,
        //     this.rawDatabase.name,
        // );
        const dbStructure = dbManager.getDatabaseStructure(rawDatabase.name);
        if (dbStructure && dbStructure.objectStores[name]) {
            const osData = dbStructure.objectStores[name];
            for (const [indexName, indexData] of Object.entries(
                osData.indexes,
            )) {
                const index = new Index(
                    this,
                    indexName,
                    indexData.keyPath,
                    indexData.multiEntry,
                    indexData.unique,
                );
                index.initialized = true;
                this.rawIndexes.set(indexName, index);
            }
        }
        if (process.env.DB_VERBOSE === "1") {
            console.log(
                this.rawDatabase.name,
                this.name,
                "rawIndexes",
                this.rawIndexes,
            );
        }
    }

    public _setTransactionId(txnId: string): void {
        this._transactionId = txnId;
        this.records.setTransactionId(txnId);
        
        // Also set transaction ID on all indexes
        for (const index of this.rawIndexes.values()) {
            index._setTransactionId(txnId);
        }
    }

    public async saveStructure() {
        // Get the current database structure or create a new one
        let dbStructure = dbManager.getDatabaseStructure(
            this.rawDatabase.name,
        );

        if (!dbStructure) {
            // Create a new database structure if it doesn't exist
            dbStructure = {
                name: this.rawDatabase.name,
                version: this.rawDatabase.version,
                objectStores: {},
            };
        }

        // Update or add this object store's structure
        dbStructure.objectStores[this.name] = {
            keyPath: this.keyPath,
            autoIncrement: this.autoIncrement,
            indexes: {},
        };

        // Add indexes
        for (const [indexName, index] of this.rawIndexes) {
            dbStructure.objectStores[this.name].indexes[indexName] = {
                keyPath: index.keyPath,
                multiEntry: index.multiEntry,
                unique: index.unique,
            };
        }

        // Save the updated structure
        await dbManager.saveDatabaseStructure(this.rawDatabase);
    }

    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-retrieving-a-value-from-an-object-store
    public async getKey(key: FDBKeyRange | Key) {
        const record = await this.records.get(key);

        return record !== undefined ? structuredClone(record.key) : undefined;
    }

    // http://w3c.github.io/IndexedDB/#retrieve-multiple-keys-from-an-object-store
    public async getAllKeys(range: FDBKeyRange, count?: number) {
        if (count === undefined || count === 0) {
            count = Infinity;
        }

        const records = [];
        const values = await this.records.values(range);
        for (const record of values) {
            if (!record) continue;
            records.push(structuredClone(record.key));
            if (records.length >= count) {
                break;
            }
        }

        return records;
    }

    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-retrieving-a-value-from-an-object-store
    public async getValue(key: FDBKeyRange | Key) {
        const record = await this.records.get(key);

        return record !== undefined ? structuredClone(record.value) : undefined;
    }

    // http://w3c.github.io/IndexedDB/#retrieve-multiple-values-from-an-object-store
    public async getAllValues(range: FDBKeyRange, count?: number) {
        if (count === undefined || count === 0) {
            count = Infinity;
        }

        const records = [];
        const values = await this.records.values(range);
        for (const record of values) {
            if (!record) continue;
            records.push(structuredClone(record.value));
            if (records.length >= count) {
                break;
            }
        }

        return records;
    }

    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-storing-a-record-into-an-object-store
    public async storeRecord(
        newRecord: Record,
        noOverwrite: boolean,
        rollbackLog?: RollbackLog,
    ): Promise<Key> {
        if (this.keyPath !== null) {
            const key = extractKey(this.keyPath, newRecord.value);
            if (key !== undefined) {
                newRecord.key = key;
            }
        }

        if (this.keyGenerator !== null && newRecord.key === undefined) {
            if (rollbackLog) {
                const keyGeneratorBefore = this.keyGenerator.num;
                rollbackLog.push(() => {
                    if (this.keyGenerator) {
                        this.keyGenerator.num = keyGeneratorBefore;
                    }
                });
            }

            newRecord.key = this.keyGenerator.next();

            // Set in value if keyPath defiend but led to no key
            // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-to-assign-a-key-to-a-value-using-a-key-path
            if (this.keyPath !== null) {
                if (Array.isArray(this.keyPath)) {
                    throw new Error(
                        "Cannot have an array key path in an object store with a key generator",
                    );
                }
                let remainingKeyPath = this.keyPath;
                let object = newRecord.value;
                let identifier;

                let i = 0; // Just to run the loop at least once
                while (i >= 0) {
                    if (typeof object !== "object") {
                        throw new DataError();
                    }

                    i = remainingKeyPath.indexOf(".");
                    if (i >= 0) {
                        identifier = remainingKeyPath.slice(0, i);
                        remainingKeyPath = remainingKeyPath.slice(i + 1);

                        if (!Object.hasOwn(object, identifier)) {
                            object[identifier] = {};
                        }

                        object = object[identifier];
                    }
                }

                identifier = remainingKeyPath;

                object[identifier] = newRecord.key;
            }
        } else if (
            this.keyGenerator !== null &&
            typeof newRecord.key === "number"
        ) {
            this.keyGenerator.setIfLarger(newRecord.key);
        }

        const existingRecord = await this.records.get(newRecord.key);
        if (existingRecord) {
            if (noOverwrite) {
                const errorMessage = `A record with the key "${newRecord.key}" already exists in the object store and cannot be overwritten due to the noOverwrite flag being set. Error Code: OBJ_STORE_CONSTRAINT_ERR_002`;
                console.error("ConstraintError:", errorMessage);
                throw new ConstraintError(errorMessage);
            }
            await this.deleteRecord(newRecord.key, rollbackLog);
        }

        await this.records.add(newRecord);

        if (rollbackLog) {
            rollbackLog.push(() => {
                this.deleteRecord(newRecord.key);
            });
        }

        // Update indexes
        for (const rawIndex of this.rawIndexes.values()) {
            if (rawIndex.initialized) {
                await rawIndex.storeRecord(newRecord);
            }
        }

        return newRecord.key;
    }

    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-deleting-records-from-an-object-store
    public async deleteRecord(key: Key, rollbackLog?: RollbackLog): Promise<void> {
        const deletedRecords = await this.records.delete(key);

        if (rollbackLog) {
            for (const record of deletedRecords) {
                rollbackLog.push(async () => {
                    await this.storeRecord(record, true);
                });
            }
        }

        for (const rawIndex of this.rawIndexes.values()) {
            await rawIndex.records.deleteByValue(key);
        }
    }

    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-clearing-an-object-store
    public async clear(rollbackLog: RollbackLog): Promise<void> {
        const deletedRecords = await this.records.clear();

        if (rollbackLog) {
            for (const record of deletedRecords) {
                rollbackLog.push(async () => {
                    await this.storeRecord(record, true);
                });
            }
        }

        for (const rawIndex of this.rawIndexes.values()) {
            await rawIndex.records.clear();
        }
    }

    public async count(range: FDBKeyRange): Promise<number> {
        let count = 0;

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const values = await this.records.values(range);
        for (const record of values) {
            count += 1;
        }

        return count;
    }
}

export default ObjectStore;
