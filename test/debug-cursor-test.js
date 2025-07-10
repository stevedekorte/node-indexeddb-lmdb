import dbManager from '../build/esm/lib/LMDBManager.js';

async function debugCursor() {
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
        console.log("Adding data...");
        const addTransaction = db.transaction(["items"], "readwrite");
        const addStore = addTransaction.objectStore("items");
        
        console.log("Add transaction ID:", addTransaction._lmdbTxnId);
        console.log("Add store transaction ID:", addStore._rawObjectStore._transactionId);
        
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
        
        console.log("Data added. Testing direct RecordStore access...");
        
        // Test RecordStore directly
        const objectStore = addStore._rawObjectStore;
        console.log("Object store:", objectStore);
        console.log("Record store:", objectStore.records);
        
        // Set transaction ID
        objectStore.records.setTransactionId();
        
        // Check what keys exist in LMDB
        console.log("Checking LMDB keys...");
        const prefix = objectStore.records.keyPrefix;
        console.log("Key prefix:", prefix);
        
        const keys = await dbManager.getKeysStartingWith(prefix);
        console.log("Keys with prefix:", keys);
        
        // Also check for all keys
        const allKeys = await dbManager.getKeysStartingWith("");
        console.log("All keys in database:", allKeys);
        
        // Try to get range directly
        const allRecords = await objectStore.records.getRange();
        console.log("All records from RecordStore:", allRecords);
        
        // Try values iterator
        const iterator = await objectStore.records.values();
        console.log("Iterator:", iterator);
        
        let recordCount = 0;
        for (const record of iterator) {
            console.log("Record from iterator:", record);
            recordCount++;
        }
        console.log("Total records from iterator:", recordCount);
        
        // Now test cursor
        console.log("Testing cursor...");
        const readTransaction = db.transaction(["items"], "readonly");
        const readStore = readTransaction.objectStore("items");
        
        const cursorRequest = readStore.openCursor();
        
        await new Promise((resolve, reject) => {
            cursorRequest.onsuccess = function(event) {
                const cursor = event.target.result;
                console.log("Cursor result:", cursor);
                resolve();
            };
            cursorRequest.onerror = reject;
        });
        
    } catch (error) {
        console.error("Debug cursor test failed:", error);
    }
}

debugCursor();