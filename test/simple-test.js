import "../auto/index.mjs";

async function test() {
    try {
        console.log("Starting simple test...");
        
        // Delete the database first to ensure clean state
        const deleteReq = indexedDB.deleteDatabase("TestDB");
        await new Promise((resolve, reject) => {
            deleteReq.onsuccess = resolve;
            deleteReq.onerror = reject;
        });
        
        console.log("Opening database...");
        const request = indexedDB.open("TestDB", 1);
        
        request.onupgradeneeded = (event) => {
            console.log("Upgrade needed");
            const db = event.target.result;
            const transaction = event.target.transaction;
            
            if (!db.objectStoreNames.contains("test")) {
                const store = db.createObjectStore("test", { keyPath: "id" });
                console.log("Created object store");
            }
            
            transaction.oncomplete = () => {
                console.log("Upgrade transaction completed");
            };
            transaction.onerror = () => {
                console.error("Upgrade transaction error:", transaction.error);
            };
            transaction.onabort = () => {
                console.error("Upgrade transaction aborted");
            };
        };
        
        const db = await new Promise((resolve, reject) => {
            request.onsuccess = () => {
                console.log("Database opened successfully");
                resolve(request.result);
            };
            request.onerror = () => {
                console.error("Error opening database:", request.error);
                reject(request.error);
            };
        });
        
        console.log("Starting transaction...");
        const tx = db.transaction(["test"], "readwrite");
        const store = tx.objectStore("test");
        
        console.log("Adding data...");
        const addReq = store.add({ id: 1, name: "Test" });
        
        await new Promise((resolve, reject) => {
            addReq.onsuccess = () => {
                console.log("Data added successfully");
                resolve();
            };
            addReq.onerror = () => {
                console.error("Error adding data:", addReq.error);
                reject(addReq.error);
            };
        });
        
        console.log("Reading data...");
        const getReq = store.get(1);
        
        const result = await new Promise((resolve, reject) => {
            getReq.onsuccess = () => {
                console.log("Data retrieved:", getReq.result);
                resolve(getReq.result);
            };
            getReq.onerror = () => {
                console.error("Error getting data:", getReq.error);
                reject(getReq.error);
            };
        });
        
        console.log("Test completed successfully!");
        console.log("Result:", result);
        
        db.close();
        process.exit(0);
    } catch (error) {
        console.error("Test failed:", error);
        process.exit(1);
    }
}

test();