import dbManager from '../build/esm/lib/LMDBManager.js';

async function testCursor() {
    try {
        await dbManager.loadCache();
        const { default: fakeIndexedDB, IDBCursor } = await import('../build/esm/index.js');
        
        console.log("IDBCursor constructor:", IDBCursor);
        
        const dbRequest = fakeIndexedDB.open("testdb", 1);
        
        dbRequest.onupgradeneeded = function(event) {
            const db = event.target.result;
            const store = db.createObjectStore("items", { keyPath: "id" });
        };
        
        const db = await new Promise((resolve, reject) => {
            dbRequest.onsuccess = () => resolve(dbRequest.result);
            dbRequest.onerror = () => reject(dbRequest.error);
        });
        
        // Add data in a separate transaction
        const addTransaction = db.transaction(["items"], "readwrite");
        const addStore = addTransaction.objectStore("items");
        
        // Add data synchronously in same execution context
        addStore.add({ id: 1, name: "Item 1" });
        addStore.add({ id: 2, name: "Item 2" });
        addStore.add({ id: 3, name: "Item 3" });
        
        // Wait for add transaction to complete
        await new Promise((resolve, reject) => {
            addTransaction.oncomplete = resolve;
            addTransaction.onerror = reject;
        });
        
        console.log("Data added, now testing cursor...");
        
        const transaction = db.transaction(["items"], "readonly");
        const store = transaction.objectStore("items");
        
        const cursorRequest = store.openCursor();
        
        await new Promise((resolve, reject) => {
            cursorRequest.onsuccess = function(event) {
                const cursor = event.target.result;
                console.log("Cursor result:", cursor);
                console.log("Cursor constructor:", cursor?.constructor?.name);
                console.log("Is instance of IDBCursor:", cursor instanceof IDBCursor);
                console.log("IDBCursor prototype:", IDBCursor.prototype);
                console.log("Cursor prototype chain:");
                let proto = cursor;
                while (proto) {
                    console.log("  -", proto.constructor?.name);
                    proto = Object.getPrototypeOf(proto);
                    if (proto === Object.prototype) break;
                }
                resolve();
            };
            cursorRequest.onerror = reject;
        });
        
    } catch (error) {
        console.error("Cursor test failed:", error);
    }
}

testCursor();