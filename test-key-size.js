import { PathUtils } from './build/esm/lib/PathUtils.js';

// Test typical key sizes we might generate
function testKeySize() {
    console.log("Testing LMDB key sizes for IndexedDB operations...\n");
    
    // Simulate typical scenarios
    const scenarios = [
        {
            name: "Short UUID key",
            dbName: "MyDatabase",
            storeName: "users",
            type: "store",
            key: "550e8400-e29b-41d4-a716-446655440000" // Standard UUID
        },
        {
            name: "Long database/store names",
            dbName: "VeryLongDatabaseNameForEnterpriseApplication",
            storeName: "VeryLongObjectStoreNameWithDescriptiveTitle",
            type: "index",
            key: "550e8400-e29b-41d4-a716-446655440000"
        },
        {
            name: "Complex object key",
            dbName: "MyDatabase",
            storeName: "complexData",
            type: "store",
            key: { id: "550e8400-e29b-41d4-a716-446655440000", type: "document", version: 1 }
        },
        {
            name: "Array key",
            dbName: "MyDatabase", 
            storeName: "multiDimensional",
            type: "store",
            key: ["category", "subcategory", "550e8400-e29b-41d4-a716-446655440000"]
        },
        {
            name: "Very long string key",
            dbName: "MyDatabase",
            storeName: "documents",
            type: "store", 
            key: "x".repeat(1000) // 1KB string key
        }
    ];
    
    scenarios.forEach(scenario => {
        const keyPrefix = PathUtils.createObjectStoreKeyPath(scenario.dbName, scenario.storeName);
        const fullKey = PathUtils.createRecordStoreKeyPath(keyPrefix, scenario.type, scenario.key);
        
        console.log(`${scenario.name}:`);
        console.log(`  Key prefix: ${keyPrefix} (${keyPrefix.length} bytes)`);
        console.log(`  Encoded key: ${PathUtils.encodeKey(scenario.key).substring(0, 100)}${PathUtils.encodeKey(scenario.key).length > 100 ? '...' : ''} (${PathUtils.encodeKey(scenario.key).length} bytes)`);
        console.log(`  Full LMDB key: ${fullKey.substring(0, 100)}${fullKey.length > 100 ? '...' : ''}`);
        console.log(`  Total length: ${fullKey.length} bytes`);
        
        if (fullKey.length > 1978) {
            console.log(`  ⚠️  Exceeds default key limit (1978 bytes)`);
        }
        if (fullKey.length > 4026) {
            console.log(`  ❌ Exceeds maximum key limit (4026 bytes)`);
        }
        console.log();
    });
    
    console.log("Limits:");
    console.log("- Default LMDB key limit (pageSize 4096): 1978 bytes");
    console.log("- Maximum LMDB key limit (pageSize 8192+): 4026 bytes");
}

testKeySize();