import { RecordStoreType } from "./RecordStore.js";
import { Key } from "./types.js";
export declare const SEPARATOR = "/";
export declare class PathUtils {
    static DB_LIST_KEY: string;
    static DB_STRUCTURE_KEY: string;
    static SPECIAL_KEYS: string[];
    static createObjectStoreKeyPath(dbName: string, storeName: string): string;
    static createRecordStoreKeyPath(keyPrefix: string, type: RecordStoreType, key: Key): string;
    static encodeKey(key: Key): string;
    static decodeKey(encodedKey: string): Key;
}
