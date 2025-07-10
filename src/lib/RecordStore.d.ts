import FDBKeyRange from "../FDBKeyRange.js";
import { Key, Record } from "./types.js";
export type RecordStoreType = "object" | "index" | "";
declare class RecordStore {
    private keyPrefix;
    private type;
    private transactionId?;
    constructor(keyPrefix: string, type: RecordStoreType);
    setTransactionId(txnId?: string): void;
    private createFullKey;
    get(key: Key | FDBKeyRange): Promise<Record | undefined>;
    add(newRecord: Record, noOverwrite?: boolean): Promise<void>;
    delete(key: Key): Promise<Record[]>;
    deleteByValue(key: Key): Promise<Record[]>;
    clear(): Promise<Record[]>;
    getAllRecords(): Promise<Record[]>;
    values(range?: FDBKeyRange, direction?: "next" | "prev"): Promise<{
        [Symbol.iterator]: () => {
            next: () => {
                done: boolean;
                value: undefined;
            } | {
                done: boolean;
                value: Record;
            };
        };
    }>;
    private getRange;
    private matchesKeyRange;
}
export default RecordStore;
