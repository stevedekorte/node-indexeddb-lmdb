import dbManager from '../build/esm/lib/LMDBManager.js';

async function testAdvancedFeatures() {
    try {
        await dbManager.loadCache();
        const { default: fakeIndexedDB } = await import('../build/esm/index.js');
        
        console.log('🧪 Testing Advanced IndexedDB Features...\n');
        
        let testsPassed = 0;
        let testsTotal = 0;
        
        // Test 1: Multiple object stores in same transaction
        console.log('📝 Test 1: Multiple object stores');
        testsTotal++;
        try {
            const dbRequest = fakeIndexedDB.open("multistore_test", 1);
            
            dbRequest.onupgradeneeded = function(event) {
                const db = event.target.result;
                db.createObjectStore("store1", { keyPath: "id" });
                db.createObjectStore("store2", { keyPath: "id" });
            };
            
            const db = await new Promise((resolve, reject) => {
                dbRequest.onsuccess = () => resolve(dbRequest.result);
                dbRequest.onerror = () => reject(dbRequest.error);
            });
            
            const transaction = db.transaction(["store1", "store2"], "readwrite");
            const store1 = transaction.objectStore("store1");
            const store2 = transaction.objectStore("store2");
            
            store1.add({ id: 1, data: "test1" });
            store2.add({ id: 1, data: "test2" });
            
            await new Promise((resolve, reject) => {
                transaction.oncomplete = resolve;
                transaction.onerror = reject;
            });
            
            console.log('✅ Multiple object stores test passed');
            testsPassed++;
            db.close();
        } catch (error) {
            console.log('❌ Multiple object stores test failed:', error.message);
        }
        
        // Test 2: Key range queries
        console.log('📝 Test 2: Key range queries');
        testsTotal++;
        try {
            const dbRequest = fakeIndexedDB.open("range_test", 1);
            
            dbRequest.onupgradeneeded = function(event) {
                const db = event.target.result;
                db.createObjectStore("items", { keyPath: "id" });
            };
            
            const db = await new Promise((resolve, reject) => {
                dbRequest.onsuccess = () => resolve(dbRequest.result);
                dbRequest.onerror = () => reject(dbRequest.error);
            });
            
            // Add data
            const writeTransaction = db.transaction(["items"], "readwrite");
            const writeStore = writeTransaction.objectStore("items");
            
            for (let i = 1; i <= 10; i++) {
                writeStore.add({ id: i, value: `item${i}` });
            }
            
            await new Promise((resolve, reject) => {
                writeTransaction.oncomplete = resolve;
                writeTransaction.onerror = reject;
            });
            
            // Test range query
            const readTransaction = db.transaction(["items"], "readonly");
            const readStore = readTransaction.objectStore("items");
            
            const { default: FDBKeyRange } = await import('../build/esm/FDBKeyRange.js');
            const range = FDBKeyRange.bound(3, 7);
            
            const rangeResults = await new Promise((resolve, reject) => {
                const request = readStore.getAll(range);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            if (rangeResults.length === 5) { // Should get items 3, 4, 5, 6, 7
                console.log('✅ Key range queries test passed');
                testsPassed++;
            } else {
                console.log(`❌ Key range queries test failed: expected 5 items, got ${rangeResults.length}`);
                console.log('Range results:', rangeResults.map(r => r.id));
            }
            
            db.close();
        } catch (error) {
            console.log('❌ Key range queries test failed:', error.message);
        }
        
        // Test 3: Database versioning and migration
        console.log('📝 Test 3: Database versioning');
        testsTotal++;
        try {
            // Create version 1
            let dbRequest = fakeIndexedDB.open("version_test", 1);
            
            dbRequest.onupgradeneeded = function(event) {
                const db = event.target.result;
                db.createObjectStore("oldstore", { keyPath: "id" });
            };
            
            let db = await new Promise((resolve, reject) => {
                dbRequest.onsuccess = () => resolve(dbRequest.result);
                dbRequest.onerror = () => reject(dbRequest.error);
            });
            
            db.close();
            
            // Upgrade to version 2
            dbRequest = fakeIndexedDB.open("version_test", 2);
            
            dbRequest.onupgradeneeded = function(event) {
                const db = event.target.result;
                if (event.oldVersion < 2) {
                    db.createObjectStore("newstore", { keyPath: "id" });
                }
            };
            
            db = await new Promise((resolve, reject) => {
                dbRequest.onsuccess = () => resolve(dbRequest.result);
                dbRequest.onerror = () => reject(dbRequest.error);
            });
            
            if (db.objectStoreNames.contains("oldstore") && db.objectStoreNames.contains("newstore")) {
                console.log('✅ Database versioning test passed');
                testsPassed++;
            } else {
                console.log('❌ Database versioning test failed: stores not found');
            }
            
            db.close();
        } catch (error) {
            console.log('❌ Database versioning test failed:', error.message);
        }
        
        // Test 4: Complex data types
        console.log('📝 Test 4: Complex data types');
        testsTotal++;
        try {
            const dbRequest = fakeIndexedDB.open("complex_test", 1);
            
            dbRequest.onupgradeneeded = function(event) {
                const db = event.target.result;
                db.createObjectStore("complex", { keyPath: "id" });
            };
            
            const db = await new Promise((resolve, reject) => {
                dbRequest.onsuccess = () => resolve(dbRequest.result);
                dbRequest.onerror = () => reject(dbRequest.error);
            });
            
            const transaction = db.transaction(["complex"], "readwrite");
            const store = transaction.objectStore("complex");
            
            // Test various complex data types
            const complexData = {
                id: 1,
                array: [1, 2, 3],
                nested: { deep: { value: "test" } },
                date: new Date(),
                boolean: true,
                null_value: null,
                undefined_value: undefined
            };
            
            store.add(complexData);
            
            await new Promise((resolve, reject) => {
                transaction.oncomplete = resolve;
                transaction.onerror = reject;
            });
            
            // Read it back
            const readTransaction = db.transaction(["complex"], "readonly");
            const readStore = readTransaction.objectStore("complex");
            
            const result = await new Promise((resolve, reject) => {
                const request = readStore.get(1);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            if (result && result.array.length === 3 && result.nested.deep.value === "test") {
                console.log('✅ Complex data types test passed');
                testsPassed++;
            } else {
                console.log('❌ Complex data types test failed: data corrupted');
            }
            
            db.close();
        } catch (error) {
            console.log('❌ Complex data types test failed:', error.message);
        }
        
        // Test 5: Index with duplicate values
        console.log('📝 Test 5: Index with duplicate values');
        testsTotal++;
        try {
            const dbRequest = fakeIndexedDB.open("duplicate_test", 1);
            
            dbRequest.onupgradeneeded = function(event) {
                const db = event.target.result;
                const store = db.createObjectStore("items", { keyPath: "id" });
                store.createIndex("category_idx", "category", { unique: false });
            };
            
            const db = await new Promise((resolve, reject) => {
                dbRequest.onsuccess = () => resolve(dbRequest.result);
                dbRequest.onerror = () => reject(dbRequest.error);
            });
            
            const writeTransaction = db.transaction(["items"], "readwrite");
            const writeStore = writeTransaction.objectStore("items");
            
            // Add items with duplicate category values
            writeStore.add({ id: 1, category: "electronics", name: "phone" });
            writeStore.add({ id: 2, category: "electronics", name: "laptop" });
            writeStore.add({ id: 3, category: "electronics", name: "tablet" });
            writeStore.add({ id: 4, category: "books", name: "novel" });
            
            await new Promise((resolve, reject) => {
                writeTransaction.oncomplete = resolve;
                writeTransaction.onerror = reject;
            });
            
            // Query by index
            const readTransaction = db.transaction(["items"], "readonly");
            const readStore = readTransaction.objectStore("items");
            const index = readStore.index("category_idx");
            
            const electronics = await new Promise((resolve, reject) => {
                const request = index.getAll("electronics");
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            if (electronics.length === 3) {
                console.log('✅ Index with duplicate values test passed');
                testsPassed++;
            } else {
                console.log(`❌ Index with duplicate values test failed: expected 3, got ${electronics.length}`);
            }
            
            db.close();
        } catch (error) {
            console.log('❌ Index with duplicate values test failed:', error.message);
        }
        
        // Calculate overall results
        const passRate = Math.round((testsPassed / testsTotal) * 100);
        
        console.log('\n📊 Advanced Features Test Results:');
        console.log(`Total tests: ${testsTotal}`);
        console.log(`Passed: ${testsPassed}`);
        console.log(`Failed: ${testsTotal - testsPassed}`);
        console.log(`Pass rate: ${passRate}%`);
        
        return { testsTotal, testsPassed, passRate };
        
    } catch (error) {
        console.error('❌ Advanced features test suite failed:', error);
        return { testsTotal: 0, testsPassed: 0, passRate: 0 };
    }
}

testAdvancedFeatures().then(results => {
    console.log(`\n🎯 Advanced Features Pass Rate: ${results.passRate}%`);
    process.exit(0);
}).catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
});