import FDBCursor from "./FDBCursor.js";
import FDBIndex from "./FDBIndex.js";
import FDBObjectStore from "./FDBObjectStore.js";
import FDBTransaction from "./FDBTransaction.js";
import FakeEventTarget from "./lib/FakeEventTarget.js";
import { EventCallback } from "./lib/types.js";
declare class FDBRequest extends FakeEventTarget {
    _result: any;
    _error: Error | null | undefined;
    source: FDBCursor | FDBIndex | FDBObjectStore | null;
    transaction: FDBTransaction | null;
    readyState: "done" | "pending";
    onsuccess: EventCallback | null;
    onerror: EventCallback | null;
    get error(): any;
    set error(value: any);
    get result(): any;
    set result(value: any);
    toString(): string;
}
export default FDBRequest;
