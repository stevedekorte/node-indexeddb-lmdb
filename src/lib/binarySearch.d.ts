import FDBKeyRange from "../FDBKeyRange.js";
import { Key, Record } from "./types.js";
/**
 * Equivalent to `records.findIndex(record => cmp(record.key, key) === 0)`
 */
export declare function getIndexByKey(records: Record[], key: Key): number;
/**
 * Equivalent to `records.find(record => cmp(record.key, key) === 0)`
 */
export declare function getByKey(records: Record[], key: Key): Record | undefined;
/**
 * Equivalent to `records.findIndex(record => key.includes(record.key))`
 */
export declare function getIndexByKeyRange(records: Record[], keyRange: FDBKeyRange): number;
/**
 * Equivalent to `records.find(record => key.includes(record.key))`
 */
export declare function getByKeyRange(records: Record[], keyRange: FDBKeyRange): Record | undefined;
/**
 * Equivalent to `records.findIndex(record => cmp(record.key, key) >= 0)`
 */
export declare function getIndexByKeyGTE(records: Record[], key: Key): number;
