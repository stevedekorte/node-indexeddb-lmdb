import FDBOpenDBRequest from "./FDBOpenDBRequest.js";
declare class FDBFactory {
    cmp: (first: any, second: any) => 0 | 1 | -1;
    private _databases;
    constructor();
    private initializeDatabases;
    deleteDatabase(name: string): FDBOpenDBRequest;
    open(name: string, version?: number): FDBOpenDBRequest;
    databases(): Promise<unknown>;
    toString(): string;
}
export default FDBFactory;
