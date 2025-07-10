import FDBIndex from "./FDBIndex.js";
import FDBKeyRange from "./FDBKeyRange.js";
import FDBRequest from "./FDBRequest.js";
import FDBTransaction from "./FDBTransaction.js";
import FakeDOMStringList from "./lib/FakeDOMStringList.js";
import ObjectStore from "./lib/ObjectStore.js";
import { FDBCursorDirection, Key, KeyPath, Value } from "./lib/types.js";
declare class FDBObjectStore {
    _rawObjectStore: ObjectStore;
    _indexesCache: Map<string, FDBIndex>;
    keyPath: KeyPath | null;
    autoIncrement: boolean;
    transaction: FDBTransaction;
    indexNames: FakeDOMStringList;
    private _name;
    constructor(transaction: FDBTransaction, rawObjectStore: ObjectStore);
    get name(): any;
    set name(name: any);
    put(value: Value, key?: Key): FDBRequest;
    add(value: Value, key?: Key): FDBRequest;
    delete(key: Key): FDBRequest;
    get(key?: FDBKeyRange | Key): FDBRequest;
    getAll(query?: FDBKeyRange | Key, count?: number): FDBRequest;
    getKey(key?: FDBKeyRange | Key): FDBRequest;
    getAllKeys(query?: FDBKeyRange | Key, count?: number): FDBRequest;
    clear(): FDBRequest;
    openCursor(range?: FDBKeyRange | Key, direction?: FDBCursorDirection): FDBRequest;
    openKeyCursor(range?: FDBKeyRange | Key, direction?: FDBCursorDirection): FDBRequest;
    createIndex(name: string, keyPath: KeyPath, optionalParameters?: {
        multiEntry?: boolean;
        unique?: boolean;
    }): FDBIndex;
    index(name: string): FDBIndex;
    deleteIndex(name: string): void;
    count(key?: Key | FDBKeyRange): FDBRequest;
    toString(): string;
}
export default FDBObjectStore;
