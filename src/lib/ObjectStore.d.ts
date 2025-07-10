import FDBKeyRange from "../FDBKeyRange.js";
import Database from "./Database.js";
import Index from "./Index.js";
import KeyGenerator from "./KeyGenerator.js";
import RecordStore from "./RecordStore.js";
import { Key, KeyPath, Record, RollbackLog } from "./types.js";
declare class ObjectStore {
    deleted: boolean;
    readonly rawDatabase: Database;
    readonly records: RecordStore;
    readonly rawIndexes: Map<string, Index>;
    name: string;
    readonly keyPath: KeyPath | null;
    readonly autoIncrement: boolean;
    readonly keyGenerator: KeyGenerator | null;
    private _transactionId?;
    constructor(rawDatabase: Database, name: string, keyPath: KeyPath | null, autoIncrement: boolean);
    _setTransactionId(txnId: string): void;
    saveStructure(): Promise<void>;
    getKey(key: FDBKeyRange | Key): Promise<any>;
    getAllKeys(range: FDBKeyRange, count?: number): Promise<any[]>;
    getValue(key: FDBKeyRange | Key): Promise<any>;
    getAllValues(range: FDBKeyRange, count?: number): Promise<any[]>;
    storeRecord(newRecord: Record, noOverwrite: boolean, rollbackLog?: RollbackLog): Promise<Key>;
    deleteRecord(key: Key, rollbackLog?: RollbackLog): Promise<void>;
    clear(rollbackLog: RollbackLog): Promise<void>;
    count(range: FDBKeyRange): Promise<number>;
}
export default ObjectStore;
