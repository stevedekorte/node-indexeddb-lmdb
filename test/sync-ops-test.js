import dbManager from '../build/esm/lib/LMDBManager.js';

async function testSyncOps() {
    try {
        await dbManager.loadCache();
        const { default: fakeIndexedDB } = await import('../build/esm/index.js');
        
        console.log("Creating database...");
        const dbRequest = fakeIndexedDB.open("testdb", 1);
        
        dbRequest.onupgradeneeded = function(event) {
            const db = event.target.result;
            console.log("Creating object store...");
            const store = db.createObjectStore("items", { keyPath: "id" });
        };
        
        const db = await new Promise((resolve, reject) => {
            dbRequest.onsuccess = () => resolve(dbRequest.result);
            dbRequest.onerror = () => reject(dbRequest.error);
        });
        
        console.log("Database created, starting transaction...");
        
        // Start a transaction
        const transaction = db.transaction(["items"], "readwrite");
        const store = transaction.objectStore("items");
        
        console.log("Adding item and getting item SYNCHRONOUSLY...");
        
        // Make both requests in the same synchronous block
        const addRequest = store.add({ id: 1, name: "Test Item" });
        const getRequest = store.get(1);  // This should work since they're in same sync block
        
        console.log("Both requests made, waiting for results...");
        
        // Wait for both to complete
        const addResult = await new Promise((resolve, reject) => {
            addRequest.onsuccess = () => {
                console.log("Add completed successfully");
                resolve();
            };
            addRequest.onerror = () => {
                console.error("Add failed:", addRequest.error);
                reject(addRequest.error);
            };
        });
        
        const getResult = await new Promise((resolve, reject) => {
            getRequest.onsuccess = () => {
                console.log("Get completed successfully:", getRequest.result);
                resolve(getRequest.result);
            };
            getRequest.onerror = () => {
                console.error("Get failed:", getRequest.error);
                reject(getRequest.error);
            };
        });
        
        console.log("Sync ops test completed successfully");
        
    } catch (error) {
        console.error("Sync ops test failed:", error);
    }
}

testSyncOps();