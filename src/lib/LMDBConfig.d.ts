import { RootDatabaseOptions } from "lmdb";
export interface LMDBConfig extends RootDatabaseOptions {
    path: string;
    mapSize?: number;
    maxReaders?: number;
    noSync?: boolean;
    noMetaSync?: boolean;
    readOnly?: boolean;
    compression?: boolean;
    dupSort?: boolean;
    pageSize?: number;
    noMemInit?: boolean;
    mapAsync?: boolean;
    encoding?: "msgpack" | "json" | "binary";
    cache?: boolean | {
        maxSize?: number;
        maxAge?: number;
    };
}
export declare const defaultLMDBConfig: Partial<LMDBConfig>;
export declare function createLMDBConfig(path: string, customConfig?: Partial<LMDBConfig>): LMDBConfig;
export declare const developmentConfig: Partial<LMDBConfig>;
export declare const productionConfig: Partial<LMDBConfig>;
export declare const testConfig: Partial<LMDBConfig>;
export declare function getEnvironmentConfig(): Partial<LMDBConfig>;
export declare function createEnvironmentLMDBConfig(path: string, customConfig?: Partial<LMDBConfig>): LMDBConfig;
