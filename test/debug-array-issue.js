import dbManager from '../build/esm/lib/LMDBManager.js';

async function debugArrayIssue() {
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
        
        // Add TWO items with the same name to trigger array storage
        const addTransaction = db.transaction(["items"], "readwrite");
        const addStore = addTransaction.objectStore("items");
        
        addStore.add({ id: 1, name: "Apple", category: "fruit" });
        addStore.add({ id: 3, name: "Apple", category: "tech" });
        
        await new Promise((resolve, reject) => {
            addTransaction.oncomplete = resolve;
            addTransaction.onerror = reject;
        });
        
        console.log("Data added. Now testing getAll with array...");
        
        // Test the array case specifically
        const readTransaction = db.transaction(["items"], "readonly");
        const readStore = readTransaction.objectStore("items");
        const index = readStore.index("name_idx");
        
        console.log("About to call index.getAll('Apple')...");
        const getAllRequest = index.getAll("Apple");
        
        let timeoutFired = false;
        const timeout = setTimeout(() => {
            timeoutFired = true;
            console.log("⚠️  getAll timed out after 5 seconds");
            process.exit(1);
        }, 5000);
        
        const result = await new Promise((resolve, reject) => {
            getAllRequest.onsuccess = () => {
                if (!timeoutFired) {
                    clearTimeout(timeout);
                    resolve(getAllRequest.result);
                }
            };
            getAllRequest.onerror = () => {
                if (!timeoutFired) {
                    clearTimeout(timeout);
                    reject(getAllRequest.error);
                }
            };
        });
        
        console.log("✅ getAll result:", result);
        
    } catch (error) {
        console.error("❌ Test failed:", error);
    }
}

debugArrayIssue();