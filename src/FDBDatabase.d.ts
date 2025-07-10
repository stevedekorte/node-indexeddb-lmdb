import FDBTransaction from "./FDBTransaction.js";
import Database from "./lib/Database.js";
import FakeDOMStringList from "./lib/FakeDOMStringList.js";
import FakeEventTarget from "./lib/FakeEventTarget.js";
import { KeyPath, TransactionMode } from "./lib/types.js";
declare class FDBDatabase extends FakeEventTarget {
    _closePending: boolean;
    _closed: boolean;
    _runningVersionchangeTransaction: boolean;
    _rawDatabase: Database;
    name: string;
    version: number;
    objectStoreNames: FakeDOMStringList;
    constructor(rawDatabase: Database);
    createObjectStore(name: string, options?: {
        autoIncrement?: boolean;
        keyPath?: KeyPath;
    } | null): import("./FDBObjectStore.js").default;
    deleteObjectStore(name: string): void;
    transaction(storeNames: string | string[], mode?: TransactionMode): FDBTransaction;
    close(): void;
    toString(): string;
}
export default FDBDatabase;
