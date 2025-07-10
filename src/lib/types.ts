import FDBIndex from "../FDBIndex.js";
import FDBKeyRange from "../FDBKeyRange.js";
import FDBObjectStore from "../FDBObjectStore.js";
import FDBRequest from "../FDBRequest.js";

export type CursorSource = FDBIndex | FDBObjectStore;

export interface DatabaseStructure {
    name: string;
    version: number;
    objectStores: {
        [name: string]: {
            keyPath: KeyPath | null;
            autoIncrement: boolean;
            indexes: {
                [name: string]: {
                    keyPath: KeyPath;
                    multiEntry: boolean;
                    unique: boolean;
                };
            };
        };
    };
}

interface EventInCallback extends Event {
    target: any;
    error: Error | null;
}

export type EventCallback = (event: EventInCallback) => void;

export type EventType =
    | "abort"
    | "blocked"
    | "complete"
    | "error"
    | "success"
    | "upgradeneeded"
    | "versionchange";

export type FDBCursorDirection = "next" | "nextunique" | "prev" | "prevunique";

export type KeyPath = string | string[];

export type Key = any;

export type CursorRange = Key | FDBKeyRange | undefined;

export type Value = any;

export interface Record {
    key: Key;
    value: Key | Value; // For indexes, will be Key. For object stores, will be Value.
}

export type RecordValue = Record | Record[];

export interface RequestObj {
    operation: () => void | Promise<any>;
    request?: FDBRequest | undefined;
    source?: any;
}

export type RollbackLog = (() => void | Promise<void>)[];

export type TransactionMode = "readonly" | "readwrite" | "versionchange";
