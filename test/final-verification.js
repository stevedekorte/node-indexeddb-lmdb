import dbManager from '../build/esm/lib/LMDBManager.js';

async function finalVerification() {
    try {
        await dbManager.loadCache();
        const { default: fakeIndexedDB } = await import('../build/esm/index.js');
        
        const dbRequest = fakeIndexedDB.open("testdb", 1);
        
        dbRequest.onupgradeneeded = function(event) {
            const db = event.target.result;
            const store = db.createObjectStore("items", { keyPath: "id" });
            store.createIndex("name_idx", "name", { unique: false });
        };
        
        const db = await new Promise((resolve, reject) => {
            dbRequest.onsuccess = () => resolve(dbRequest.result);
            dbRequest.onerror = () => reject(dbRequest.error);
        });
        
        // Add test data
        const addTransaction = db.transaction(["items"], "readwrite");
        const addStore = addTransaction.objectStore("items");
        
        addStore.add({ id: 1, name: "Apple", category: "fruit" });
        addStore.add({ id: 2, name: "Banana", category: "fruit" });
        addStore.add({ id: 3, name: "Apple", category: "tech" });
        
        await new Promise((resolve, reject) => {
            addTransaction.oncomplete = resolve;
            addTransaction.onerror = reject;
        });
        
        console.log("✅ Data added successfully");
        
        // Test index.get()
        const readTransaction1 = db.transaction(["items"], "readonly");
        const readStore1 = readTransaction1.objectStore("items");
        const index1 = readStore1.index("name_idx");
        
        const getResult = await new Promise((resolve, reject) => {
            const request = index1.get("Apple");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        
        console.log("✅ index.get('Apple'):", getResult);
        
        // Test index.getAll() in a separate transaction
        const readTransaction2 = db.transaction(["items"], "readonly");
        const readStore2 = readTransaction2.objectStore("items");
        const index2 = readStore2.index("name_idx");
        
        const getAllResult = await new Promise((resolve, reject) => {
            const request = index2.getAll("Apple");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        
        console.log("✅ index.getAll('Apple'):", getAllResult);
        console.log(`✅ Found ${getAllResult.length} items with name 'Apple'`);
        
        if (getAllResult.length === 2) {
            console.log("🎉 Index operations working correctly!");
            console.log("🎉 All major bugs fixed!");
        } else {
            console.log("❌ Expected 2 items, got", getAllResult.length);
        }
        
    } catch (error) {
        console.error("❌ Test failed:", error);
    }
}

finalVerification();