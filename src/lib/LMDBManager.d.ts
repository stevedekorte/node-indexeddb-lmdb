import { Record, RecordValue, DatabaseStructure } from "./types.js";
import Database from "./Database.js";
import { RecordStoreType } from "./RecordStore.js";
declare class LMDBManager {
    private static instance;
    private db;
    private transactionManager;
    isLoaded: boolean;
    private databaseStructures;
    private log;
    private logError;
    private constructor();
    static getInstance(dbPath: string): LMDBManager;
    loadCache(): Promise<void>;
    beginTransaction(readOnly?: boolean, objectStoreNames?: string[]): string;
    commitTransaction(txnId: string): Promise<void>;
    rollbackTransaction(txnId: string): Promise<void>;
    private getTransactionContext;
    saveDatabaseStructure(db: Database): Promise<void>;
    getDatabaseStructure(dbName: string): DatabaseStructure | undefined;
    getAllDatabaseStructures(): {
        [dbName: string]: DatabaseStructure;
    };
    get(key: string, txnId?: string): Promise<RecordValue | undefined>;
    set(key: string, value: RecordValue, txnId?: string, noOverwrite?: boolean): Promise<void>;
    delete(key: string, txnId?: string): Promise<void>;
    deleteDatabaseStructure(dbName: string): Promise<void>;
    getKeysStartingWith(prefix: string, txnId?: string): Promise<string[]>;
    getValuesForKeysStartingWith(prefix: string, type: RecordStoreType, txnId?: string): Promise<Record[]>;
    getRange(startKey: string, endKey: string, txnId?: string): Promise<Array<[string, RecordValue]>>;
    flushWrites(): Promise<void>;
    private validateConstraints;
    private throwConstraintError;
}
declare const dbManager: LMDBManager;
export default dbManager;
