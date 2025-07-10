export const defaultLMDBConfig = {
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
    // Page size optimization
    pageSize: 4096,
    // Write options
    noMemInit: false,
    mapAsync: false,
    // Use binary encoding - we'll handle serialization ourselves
    encoding: "binary",
    // Disable cache by default (LMDB has its own memory-mapped caching)
    cache: false,
};
export function createLMDBConfig(path, customConfig) {
    return {
        path,
        ...defaultLMDBConfig,
        ...customConfig,
    };
}
// Environment-specific configurations
export const developmentConfig = {
    // Faster writes, less durability for development
    noSync: true,
    mapAsync: true,
};
export const productionConfig = {
    // Maximum durability for production
    noSync: false,
    noMetaSync: false,
    mapAsync: false,
};
export const testConfig = {
    // Smaller memory map for tests
    mapSize: 100 * 1024 * 1024, // 100MB
    // Faster operations for tests
    noSync: true,
};
// Helper to get configuration based on environment
export function getEnvironmentConfig() {
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
export function createEnvironmentLMDBConfig(path, customConfig) {
    const envConfig = getEnvironmentConfig();
    return {
        path,
        ...defaultLMDBConfig,
        ...envConfig,
        ...customConfig,
    };
}
