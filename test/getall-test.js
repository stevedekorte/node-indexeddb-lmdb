import dbManager from '../build/esm/lib/LMDBManager.js';

async function testGetAll() {
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
        console.log("Adding test data...");
        const addTransaction = db.transaction(["items"], "readwrite");
        const addStore = addTransaction.objectStore("items");
        
        addStore.add({ id: 1, name: "Item 1" });
        addStore.add({ id: 2, name: "Item 2" });
        addStore.add({ id: 3, name: "Item 3" });
        
        await new Promise((resolve, reject) => {
            addTransaction.oncomplete = resolve;
            addTransaction.onerror = reject;
        });
        
        console.log("Testing getAll()...");
        const readTransaction = db.transaction(["items"], "readonly");
        const readStore = readTransaction.objectStore("items");
        
        const getAllRequest = readStore.getAll();
        
        const allItems = await new Promise((resolve, reject) => {
            getAllRequest.onsuccess = () => {
                console.log("getAll completed:", getAllRequest.result);
                resolve(getAllRequest.result);
            };
            getAllRequest.onerror = () => {
                console.error("getAll failed:", getAllRequest.error);
                reject(getAllRequest.error);
            };
        });
        
        console.log("getAll test completed successfully. Items:", allItems);
        
    } catch (error) {
        console.error("getAll test failed:", error);
    }
}

testGetAll();