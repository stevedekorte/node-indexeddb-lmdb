import dbManager from '../build/esm/lib/LMDBManager.js';

async function testTransaction() {
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
        
        console.log("Transaction state:", transaction.mode);
        
        // Add an item
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
        
        // IMMEDIATELY try to get the item in the same transaction
        console.log("Getting item immediately...");
        const getRequest = store.get(1);
        
        await new Promise((resolve, reject) => {
            getRequest.onsuccess = () => {
                console.log("Get completed successfully:", getRequest.result);
                resolve();
            };
            getRequest.onerror = () => {
                console.error("Get failed:", getRequest.error);
                reject(getRequest.error);
            };
        });
        
        console.log("Transaction test completed successfully");
        
    } catch (error) {
        console.error("Transaction test failed:", error);
    }
}

testTransaction();