import { RootDatabaseOptions } from "lmdb";

export interface LMDBConfig extends RootDatabaseOptions {
    // Database path
    path: string;
    
    // Memory map size (maximum database size)
    mapSize?: number;
    
    // Maximum number of concurrent readers
    maxReaders?: number;
    
    // Environment flags
    noSync?: boolean;
    noMetaSync?: boolean;
    readOnly?: boolean;
    
    // Compression
    compression?: boolean;
    
    // Enable dupSort for better index performance
    dupSort?: boolean;
    
    // Page size optimization
    pageSize?: number;
    
    // Write options
    noMemInit?: boolean;
    mapAsync?: boolean;
    
    // Encoding options
    encoding?: "msgpack" | "json" | "binary";
    
    // Cache options
    cache?: boolean | {
        maxSize?: number;
        maxAge?: number;
    };
}

export const defaultLMDBConfig: Partial<LMDBConfig> = {
    // Memory map size (1GB default)
    mapSize: 1024 * 1024 * 1024,
    
    // Maximum number of concurrent readers
    maxReaders: 126,
    
    // Environment flags
    noSync: false, // Ensure durability
    noMetaSync: false, // Ensure metadata durability
    readOnly: false,
    
    // Compression (optional)
    compression: true,
    
    // Disable dupSort to allow large values (multi-megabyte)
    // dupSort is only beneficial for duplicate keys, but limits values to 1978 bytes
    dupSort: false,
    
    // Page size optimization - 8192 allows maximum key size of 4026 bytes
    // Default 4096 limits keys to 1978 bytes which may be insufficient for complex key paths
    pageSize: 8192,
    
    // Write options
    noMemInit: false,
    mapAsync: false,
    
    // Use binary encoding - we'll handle serialization ourselves
    encoding: "binary" as const,
    
    // Disable cache by default (LMDB has its own memory-mapped caching)
    cache: false,
};

export function createLMDBConfig(
    path: string,
    customConfig?: Partial<LMDBConfig>
): LMDBConfig {
    return {
        path,
        ...defaultLMDBConfig,
        ...customConfig,
    } as LMDBConfig;
}

// Environment-specific configurations
export const developmentConfig: Partial<LMDBConfig> = {
    // Faster writes, less durability for development
    noSync: true,
    mapAsync: true,
};

export const productionConfig: Partial<LMDBConfig> = {
    // Maximum durability for production
    noSync: false,
    noMetaSync: false,
    mapAsync: false,
};

export const testConfig: Partial<LMDBConfig> = {
    // Smaller memory map for tests
    mapSize: 100 * 1024 * 1024, // 100MB
    // Faster operations for tests
    noSync: true,
};

// Helper to get configuration based on environment
export function getEnvironmentConfig(): Partial<LMDBConfig> {
    const env = process.env.NODE_ENV || "development";
    
    switch (env) {
        case "production":
            return productionConfig;
        case "test":
            return testConfig;
        case "development":
        default:
            return developmentConfig;
    }
}

// Create configuration with environment defaults
export function createEnvironmentLMDBConfig(
    path: string,
    customConfig?: Partial<LMDBConfig>
): LMDBConfig {
    const envConfig = getEnvironmentConfig();
    
    return {
        path,
        ...defaultLMDBConfig,
        ...envConfig,
        ...customConfig,
    } as LMDBConfig;
}