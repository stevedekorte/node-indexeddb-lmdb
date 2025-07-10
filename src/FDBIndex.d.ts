import FDBKeyRange from "./FDBKeyRange.js";
import FDBObjectStore from "./FDBObjectStore.js";
import FDBRequest from "./FDBRequest.js";
import Index from "./lib/Index.js";
import { FDBCursorDirection, Key, KeyPath } from "./lib/types.js";
declare class FDBIndex {
    _rawIndex: Index;
    objectStore: FDBObjectStore;
    keyPath: KeyPath;
    multiEntry: boolean;
    unique: boolean;
    private _name;
    constructor(objectStore: FDBObjectStore, rawIndex: Index);
    get name(): any;
    set name(name: any);
    openCursor(range?: FDBKeyRange | Key | null | undefined, direction?: FDBCursorDirection): FDBRequest;
    openKeyCursor(range?: FDBKeyRange | Key | null | undefined, direction?: FDBCursorDirection): FDBRequest;
    get(key: FDBKeyRange | Key): FDBRequest;
    getAll(query?: FDBKeyRange | Key, count?: number): FDBRequest;
    getKey(key: FDBKeyRange | Key): FDBRequest;
    getAllKeys(query?: FDBKeyRange | Key, count?: number): FDBRequest;
    count(key: FDBKeyRange | Key | null | undefined): FDBRequest;
    toString(): string;
}
export default FDBIndex;
