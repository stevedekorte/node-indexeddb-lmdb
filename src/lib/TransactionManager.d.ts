import { Transaction } from "lmdb";
export interface TransactionOperation {
    type: 'get' | 'set' | 'delete' | 'getRange';
    key?: string;
    value?: any;
    startKey?: string;
    endKey?: string;
    timestamp: number;
    noOverwrite?: boolean;
}
export interface TransactionContext {
    id: string;
    readOnly: boolean;
    lmdbTxn?: Transaction;
    startTime: number;
    operations: TransactionOperation[];
    state: 'active' | 'committed' | 'aborted';
    objectStoreNames: string[];
}
export declare class TransactionManager {
    private contexts;
    private transactionCounter;
    createContext(readOnly?: boolean, objectStoreNames?: string[]): TransactionContext;
    getContext(txnId: string): TransactionContext | undefined;
    commitContext(txnId: string): Promise<void>;
    rollbackContext(txnId: string): Promise<void>;
    recordOperation(txnId: string, operation: Omit<TransactionOperation, 'timestamp'>): void;
    getActiveTransactionCount(): number;
    getAllActiveTransactions(): TransactionContext[];
    cleanupStaleTransactions(maxAge?: number): number;
}
