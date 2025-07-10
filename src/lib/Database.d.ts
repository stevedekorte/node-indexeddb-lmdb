import FDBDatabase from "../FDBDatabase.js";
import FDBTransaction from "../FDBTransaction.js";
import ObjectStore from "./ObjectStore.js";
declare class Database {
    deletePending: boolean;
    readonly transactions: FDBTransaction[];
    readonly rawObjectStores: Map<string, ObjectStore>;
    connections: FDBDatabase[];
    readonly name: string;
    version: number;
    constructor(name: string, version: number);
    saveStructure(): Promise<void>;
    processTransactions(): void;
}
export default Database;
