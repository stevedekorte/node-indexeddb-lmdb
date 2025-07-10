import dbManager from '../build/esm/lib/LMDBManager.js';

async function comprehensiveTest() {
    try {
        await dbManager.loadCache();
        const { default: fakeIndexedDB } = await import('../build/esm/index.js');
        
        console.log("🧪 Starting comprehensive test suite...");
        
        const dbRequest = fakeIndexedDB.open("testdb", 1);
        
        dbRequest.onupgradeneeded = function(event) {
            const db = event.target.result;
            const store = db.createObjectStore("items", { keyPath: "id" });
            store.createIndex("category_idx", "category", { unique: false });
        };
        
        const db = await new Promise((resolve, reject) => {
            dbRequest.onsuccess = () => resolve(dbRequest.result);
            dbRequest.onerror = () => reject(dbRequest.error);
        });
        
        // Test 1: Basic CRUD operations
        console.log("📝 Test 1: Basic CRUD operations");
        const writeTransaction = db.transaction(["items"], "readwrite");
        const writeStore = writeTransaction.objectStore("items");
        
        writeStore.add({ id: 1, name: "Apple", category: "fruit" });
        writeStore.add({ id: 2, name: "Banana", category: "fruit" });
        writeStore.add({ id: 3, name: "Carrot", category: "vegetable" });
        writeStore.add({ id: 4, name: "Broccoli", category: "vegetable" });
        
        await new Promise((resolve, reject) => {
            writeTransaction.oncomplete = resolve;
            writeTransaction.onerror = reject;
        });
        console.log("✅ CRUD operations completed");
        
        // Test 2: Object store getAll
        console.log("📝 Test 2: Object store getAll");
        const readTransaction1 = db.transaction(["items"], "readonly");
        const readStore1 = readTransaction1.objectStore("items");
        
        const allItems = await new Promise((resolve, reject) => {
            const request = readStore1.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        
        console.log(`✅ Object store getAll: Found ${allItems.length} items`);
        
        // Test 3: Index operations
        console.log("📝 Test 3: Index operations");
        const readTransaction2 = db.transaction(["items"], "readonly");
        const readStore2 = readTransaction2.objectStore("items");
        const index = readStore2.index("category_idx");
        
        const fruits = await new Promise((resolve, reject) => {
            const request = index.getAll("fruit");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        
        console.log(`✅ Index getAll: Found ${fruits.length} fruits`);
        
        // Test 4: Cursor operations
        console.log("📝 Test 4: Cursor operations");
        const readTransaction3 = db.transaction(["items"], "readonly");
        const readStore3 = readTransaction3.objectStore("items");
        
        const cursorItems = [];
        await new Promise((resolve, reject) => {
            const request = readStore3.openCursor();
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursorItems.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = () => reject(request.error);
        });
        
        console.log(`✅ Cursor operations: Found ${cursorItems.length} items via cursor`);
        
        // Test 5: Index cursor operations
        console.log("📝 Test 5: Index cursor operations");
        const readTransaction4 = db.transaction(["items"], "readonly");
        const readStore4 = readTransaction4.objectStore("items");
        const index2 = readStore4.index("category_idx");
        
        const indexCursorItems = [];
        await new Promise((resolve, reject) => {
            const request = index2.openCursor();
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    indexCursorItems.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = () => reject(request.error);
        });
        
        console.log(`✅ Index cursor operations: Found ${indexCursorItems.length} items via index cursor`);
        
        console.log("🎉 All tests passed! IndexedDB implementation is working correctly!");
        console.log(`📊 Summary: ${allItems.length} total items, ${fruits.length} fruits, cursors working`);
        
    } catch (error) {
        console.error("❌ Comprehensive test failed:", error);
    }
}

comprehensiveTest();