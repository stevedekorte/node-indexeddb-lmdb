import dbManager from '../build/esm/lib/LMDBManager.js';

async function testData() {
    try {
        await dbManager.loadCache();
        const { default: fakeIndexedDB } = await import('../build/esm/index.js');
        
        const dbRequest = fakeIndexedDB.open("testdb", 1);
        
        dbRequest.onupgradeneeded = function(event) {
            const db = event.target.result;
            const store = db.createObjectStore("items", { keyPath: "id" });
        };
        
        const db = await new Promise((resolve, reject) => {
            dbRequest.onsuccess = () => resolve(dbRequest.result);
            dbRequest.onerror = () => reject(dbRequest.error);
        });
        
        // Add data
        const addTransaction = db.transaction(["items"], "readwrite");
        const addStore = addTransaction.objectStore("items");
        
        console.log("Adding items...");
        addStore.add({ id: 1, name: "Item 1" });
        addStore.add({ id: 2, name: "Item 2" });
        addStore.add({ id: 3, name: "Item 3" });
        
        await new Promise((resolve, reject) => {
            addTransaction.oncomplete = () => {
                console.log("Add transaction completed");
                resolve();
            };
            addTransaction.onerror = reject;
        });
        
        // Try to retrieve data
        console.log("Retrieving data...");
        const getTransaction = db.transaction(["items"], "readonly");
        const getStore = getTransaction.objectStore("items");
        
        const getRequest = getStore.get(1);
        
        await new Promise((resolve, reject) => {
            getRequest.onsuccess = () => {
                console.log("Retrieved item 1:", getRequest.result);
                resolve();
            };
            getRequest.onerror = reject;
        });
        
        // Try to get all data with getAll
        const getAllRequest = getStore.getAll();
        
        await new Promise((resolve, reject) => {
            getAllRequest.onsuccess = () => {
                console.log("All items:", getAllRequest.result);
                resolve();
            };
            getAllRequest.onerror = reject;
        });
        
    } catch (error) {
        console.error("Data test failed:", error);
    }
}

testData();