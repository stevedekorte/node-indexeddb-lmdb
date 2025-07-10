import dbManager from '../build/esm/lib/LMDBManager.js';

async function testIndexes() {
    try {
        await dbManager.loadCache();
        const { default: fakeIndexedDB } = await import('../build/esm/index.js');
        
        const dbRequest = fakeIndexedDB.open("testdb", 1);
        
        dbRequest.onupgradeneeded = function(event) {
            const db = event.target.result;
            const store = db.createObjectStore("items", { keyPath: "id" });
            // Create an index on the 'name' field
            const nameIndex = store.createIndex("name_idx", "name", { unique: false });
            console.log("Created index:", nameIndex.name);
        };
        
        const db = await new Promise((resolve, reject) => {
            dbRequest.onsuccess = () => resolve(dbRequest.result);
            dbRequest.onerror = () => reject(dbRequest.error);
        });
        
        // Add data with different names
        console.log("Adding test data...");
        const addTransaction = db.transaction(["items"], "readwrite");
        const addStore = addTransaction.objectStore("items");
        
        addStore.add({ id: 1, name: "Apple", category: "fruit" });
        addStore.add({ id: 2, name: "Banana", category: "fruit" });
        addStore.add({ id: 3, name: "Apple", category: "tech" }); // Duplicate name
        
        await new Promise((resolve, reject) => {
            addTransaction.oncomplete = resolve;
            addTransaction.onerror = reject;
        });
        
        console.log("Testing index operations...");
        const readTransaction = db.transaction(["items"], "readonly");
        const readStore = readTransaction.objectStore("items");
        const index = readStore.index("name_idx");
        
        console.log("Index name:", index.name);
        console.log("Index keyPath:", index.keyPath);
        
        // Test index.get()
        console.log("Testing index.get('Apple')...");
        const getRequest = index.get("Apple");
        
        const indexResult = await new Promise((resolve, reject) => {
            getRequest.onsuccess = () => {
                console.log("index.get completed:", getRequest.result);
                resolve(getRequest.result);
            };
            getRequest.onerror = () => {
                console.error("index.get failed:", getRequest.error);
                reject(getRequest.error);
            };
        });
        
        // Test index.getAll()
        console.log("Testing index.getAll('Apple')...");
        const getAllRequest = index.getAll("Apple");
        
        const allIndexResults = await new Promise((resolve, reject) => {
            getAllRequest.onsuccess = () => {
                console.log("index.getAll completed:", getAllRequest.result);
                resolve(getAllRequest.result);
            };
            getAllRequest.onerror = () => {
                console.error("index.getAll failed:", getAllRequest.error);
                reject(getAllRequest.error);
            };
        });
        
        console.log("Index test completed successfully");
        
    } catch (error) {
        console.error("Index test failed:", error);
    }
}

testIndexes();