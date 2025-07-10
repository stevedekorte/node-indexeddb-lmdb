import dbManager from '../build/esm/lib/LMDBManager.js';

async function debugGetAll() {
    try {
        await dbManager.loadCache();
        const { default: fakeIndexedDB } = await import('../build/esm/index.js');
        
        const dbRequest = fakeIndexedDB.open("testdb", 1);
        
        dbRequest.onupgradeneeded = function(event) {
            const db = event.target.result;
            const store = db.createObjectStore("items", { keyPath: "id" });
            const nameIndex = store.createIndex("name_idx", "name", { unique: false });
            console.log("Created index:", nameIndex.name);
        };
        
        const db = await new Promise((resolve, reject) => {
            dbRequest.onsuccess = () => resolve(dbRequest.result);
            dbRequest.onerror = () => reject(dbRequest.error);
        });
        
        // Add one item
        console.log("Adding one item...");
        const addTransaction = db.transaction(["items"], "readwrite");
        const addStore = addTransaction.objectStore("items");
        
        addStore.add({ id: 1, name: "Apple", category: "fruit" });
        
        await new Promise((resolve, reject) => {
            addTransaction.oncomplete = resolve;
            addTransaction.onerror = reject;
        });
        
        console.log("Item added. Waiting a moment before testing index.getAll()...");
        // Add a small delay to ensure transaction is fully committed
        await new Promise(resolve => setTimeout(resolve, 100));
        const readTransaction = db.transaction(["items"], "readonly");
        const readStore = readTransaction.objectStore("items");
        const index = readStore.index("name_idx");
        
        console.log("About to call index.getAll('Apple')...");
        
        // Add a timeout to the getAll request
        const getAllRequest = index.getAll("Apple");
        console.log("getAll request created");
        
        let completed = false;
        const timer = setTimeout(() => {
            if (!completed) {
                console.log("getAll request timed out after 5 seconds");
                process.exit(1);
            }
        }, 5000);
        
        const result = await new Promise((resolve, reject) => {
            getAllRequest.onsuccess = () => {
                completed = true;
                clearTimeout(timer);
                console.log("getAll completed:", getAllRequest.result);
                resolve(getAllRequest.result);
            };
            getAllRequest.onerror = () => {
                completed = true;
                clearTimeout(timer);
                console.error("getAll failed:", getAllRequest.error);
                reject(getAllRequest.error);
            };
        });
        
        console.log("getAll test completed successfully:", result);
        
    } catch (error) {
        console.error("Debug getAll test failed:", error);
    }
}

debugGetAll();