import FDBKeyRange from "../FDBKeyRange.js";
import FDBTransaction from "../FDBTransaction.js";
import ObjectStore from "./ObjectStore.js";
import RecordStore from "./RecordStore.js";
import { Key, KeyPath, Record } from "./types.js";
declare class Index {
    deleted: boolean;
    initialized: boolean;
    readonly rawObjectStore: ObjectStore;
    readonly records: RecordStore;
    name: string;
    readonly keyPath: KeyPath;
    multiEntry: boolean;
    unique: boolean;
    private _transactionId?;
    constructor(rawObjectStore: ObjectStore, name: string, keyPath: KeyPath, multiEntry: boolean, unique: boolean);
    _setTransactionId(txnId: string): void;
    getKey(key: FDBKeyRange | Key): Promise<any>;
    getAllKeys(range: FDBKeyRange, count?: number): Promise<any[]>;
    getValue(key: FDBKeyRange | Key): Promise<any>;
    getAllValues(range: FDBKeyRange, count?: number): Promise<any[]>;
    storeRecord(newRecord: Record, deferConstraints?: boolean): Promise<void>;
    initialize(transaction: FDBTransaction): void;
    count(range: FDBKeyRange): Promise<number>;
}
export default Index;
