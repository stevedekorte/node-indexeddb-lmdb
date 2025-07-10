import dbManager from '../build/esm/lib/LMDBManager.js';

async function testSingleOp() {
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
        
        console.log("Adding item...");
        const addRequest = store.add({ id: 1, name: "Test Item" });
        
        await new Promise((resolve, reject) => {
            addRequest.onsuccess = () => {
                console.log("Add completed successfully");
                resolve();
            };
            addRequest.onerror = () => {
                console.error("Add failed:", addRequest.error);
                reject(addRequest.error);
            };
        });
        
        // Wait for transaction to auto-commit
        await new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                console.log("Transaction completed successfully");
                resolve();
            };
            transaction.onerror = () => {
                console.error("Transaction failed:", transaction.error);
                reject(transaction.error);
            };
        });
        
        console.log("Single operation test completed successfully");
        
    } catch (error) {
        console.error("Single operation test failed:", error);
    }
}

testSingleOp();