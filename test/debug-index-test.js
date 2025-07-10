import dbManager from '../build/esm/lib/LMDBManager.js';

async function debugIndex() {
    try {
        await dbManager.loadCache();
        const { default: fakeIndexedDB } = await import('../build/esm/index.js');
        
        console.log("Opening database...");
        const dbRequest = fakeIndexedDB.open("testdb", 1);
        
        dbRequest.onupgradeneeded = function(event) {
            const db = event.target.result;
            console.log("Creating object store...");
            const store = db.createObjectStore("items", { keyPath: "id" });
            
            console.log("Creating index...");
            const nameIndex = store.createIndex("name_idx", "name", { unique: false });
            console.log("Index created:", nameIndex.name);
        };
        
        const db = await new Promise((resolve, reject) => {
            dbRequest.onsuccess = () => {
                console.log("Database opened successfully");
                resolve(dbRequest.result);
            };
            dbRequest.onerror = () => reject(dbRequest.error);
        });
        
        console.log("Database structures after open:");
        console.log(JSON.stringify(dbManager.getAllDatabaseStructures(), null, 2));
        
        // Add just one item to see what happens
        console.log("Adding single item...");
        const addTransaction = db.transaction(["items"], "readwrite");
        const addStore = addTransaction.objectStore("items");
        
        console.log("Store transaction ID:", addStore._rawObjectStore._transactionId);
        console.log("Store indexes:", addStore._rawObjectStore.rawIndexes);
        
        addStore.add({ id: 1, name: "Apple", category: "fruit" });
        
        await new Promise((resolve, reject) => {
            addTransaction.oncomplete = () => {
                console.log("Add transaction completed");
                resolve();
            };
            addTransaction.onerror = (e) => {
                console.error("Add transaction failed:", e);
                reject(e);
            };
        });
        
        console.log("Database structures after add:");
        console.log(JSON.stringify(dbManager.getAllDatabaseStructures(), null, 2));
        
    } catch (error) {
        console.error("Debug index test failed:", error);
    }
}

debugIndex();