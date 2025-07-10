import { ConstraintError } from "./errors.js";
import extractKey from "./extractKey.js";
import RecordStore from "./RecordStore.js";
import valueToKey from "./valueToKey.js";
// http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-index
class Index {
    deleted = false;
    // Initialized should be used to decide whether to throw an error or abort the versionchange transaction when there is a
    // constraint
    initialized = false;
    rawObjectStore;
    records;
    name;
    keyPath;
    multiEntry;
    unique;
    _transactionId;
    constructor(rawObjectStore, name, keyPath, multiEntry, unique) {
        this.rawObjectStore = rawObjectStore;
        // this.records.setKeyPrefix(); //is this right? or should the index name not be there?
        this.name = name;
        const keyPrefix = `${this.rawObjectStore.rawDatabase.name}/${this.rawObjectStore.name}/${this.name}/`;
        this.records = new RecordStore(keyPrefix, "index");
        this.keyPath = keyPath;
        this.multiEntry = multiEntry;
        this.unique = unique;
        // console.log("IDB|Index constructor,", this.name, this.rawObjectStore.name);
    }
    _setTransactionId(txnId) {
        this._transactionId = txnId;
        this.records.setTransactionId(txnId);
    }
    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-retrieving-a-value-from-an-index
    async getKey(key) {
        const record = await this.records.get(key);
        return record !== undefined ? record.value : undefined;
    }
    // http://w3c.github.io/IndexedDB/#retrieve-multiple-referenced-values-from-an-index
    async getAllKeys(range, count) {
        if (count === undefined || count === 0) {
            count = Infinity;
        }
        const records = [];
        const values = await this.records.values(range);
        for (const record of values) {
            if (!record)
                continue;
            records.push(structuredClone(record.value));
            if (records.length >= count) {
                break;
            }
        }
        return records;
    }
    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#index-referenced-value-retrieval-operation
    async getValue(key) {
        const record = await this.records.get(key);
        return record !== undefined
            ? await this.rawObjectStore.getValue(record.value)
            : undefined;
    }
    // http://w3c.github.io/IndexedDB/#retrieve-multiple-referenced-values-from-an-index
    async getAllValues(range, count) {
        if (count === undefined || count === 0) {
            count = Infinity;
        }
        const records = [];
        const values = await this.records.values(range);
        for (const record of values) {
            if (!record)
                continue;
            records.push(await this.rawObjectStore.getValue(record.value));
            if (records.length >= count) {
                break;
            }
        }
        return records;
    }
    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-storing-a-record-into-an-object-store (step 7)
    async storeRecord(newRecord, deferConstraints) {
        // First remove any existing index entries for this record
        await this.records.deleteByValue(newRecord.key);
        let indexKey;
        try {
            indexKey = extractKey(this.keyPath, newRecord.value);
        }
        catch (err) {
            if (err.name === "DataError") {
                // Invalid key is not an actual error, just means we do not store an entry in this index
                return;
            }
            throw err;
        }
        if (!this.multiEntry || !Array.isArray(indexKey)) {
            try {
                valueToKey(indexKey);
            }
            catch (e) {
                return;
            }
        }
        else {
            // remove any elements from index key that are not valid keys and remove any duplicate elements from index
            // key such that only one instance of the duplicate value remains.
            const keep = [];
            for (const part of indexKey) {
                if (keep.indexOf(part) < 0) {
                    try {
                        keep.push(valueToKey(part));
                    }
                    catch (err) {
                        /* Do nothing */
                    }
                }
            }
            indexKey = keep;
        }
        if (!this.multiEntry || !Array.isArray(indexKey)) {
            // For unique indexes, only check constraints if deferConstraints is true (meaning this is an add() operation)
            // put() operations (deferConstraints = false) should be allowed to overwrite
            if (this.unique && deferConstraints) {
                const existingRecord = await this.records.get(indexKey);
                if (existingRecord && existingRecord.value !== newRecord.key) {
                    // Only throw error if the existing record has a different primary key
                    // Same primary key is allowed (it's just an update)
                    const errorMessage = `A record with the specified key "${indexKey}" already exists in the index, which violates the unique constraint. Key properties: ${JSON.stringify(newRecord.key)}. Error Code: IDX_CONSTRAINT_ERR_001`;
                    console.error("ConstraintError:", errorMessage);
                    throw new ConstraintError(errorMessage);
                }
            }
            await this.records.add({
                key: indexKey,
                value: newRecord.key,
            }, deferConstraints);
        }
        else {
            // For multiEntry unique indexes, only check constraints if deferConstraints is true
            if (this.unique && deferConstraints) {
                for (const individualIndexKey of indexKey) {
                    const existingRecord = await this.records.get(individualIndexKey);
                    if (existingRecord && existingRecord.value !== newRecord.key) {
                        // Only throw error if the existing record has a different primary key
                        const errorMessage = `A record with the specified key "${individualIndexKey}" already exists in the index, which violates the unique constraint. Key properties: ${JSON.stringify(newRecord.key)}. Error Code: IDX_CONSTRAINT_ERR_002`;
                        console.error("ConstraintError:", errorMessage);
                        throw new ConstraintError(errorMessage);
                    }
                }
            }
            for (const individualIndexKey of indexKey) {
                await this.records.add({
                    key: individualIndexKey,
                    value: newRecord.key,
                }, deferConstraints);
            }
        }
    }
    initialize(transaction) {
        if (this.initialized) {
            throw new Error("Index already initialized");
        }
        transaction._execRequestAsync({
            operation: async () => {
                try {
                    // Create index based on current value of objectstore
                    const values = await this.rawObjectStore.records.values();
                    for (const record of values) {
                        if (record) {
                            await this.storeRecord(record);
                        }
                    }
                    this.initialized = true;
                }
                catch (err) {
                    // console.error(err);
                    transaction._abort(err.name);
                }
            },
            source: null,
        });
    }
    async count(range) {
        let count = 0;
        const values = await this.records.values(range);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const _record of values) {
            count += 1;
        }
        return count;
    }
}
export default Index;
