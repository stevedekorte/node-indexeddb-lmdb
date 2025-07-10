import dbManager from '../build/esm/lib/LMDBManager.js';

async function verifyIndexFix() {
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
        
        // Add test data
        const addTransaction = db.transaction(["items"], "readwrite");
        const addStore = addTransaction.objectStore("items");
        
        addStore.add({ id: 1, name: "Apple", category: "fruit" });
        addStore.add({ id: 2, name: "Banana", category: "fruit" });
        addStore.add({ id: 3, name: "Apple", category: "tech" });
        
        await new Promise((resolve, reject) => {
            addTransaction.oncomplete = resolve;
            addTransaction.onerror = reject;
        });
        
        console.log("✅ Data added successfully");
        
        // Test index operations
        const readTransaction = db.transaction(["items"], "readonly");
        const readStore = readTransaction.objectStore("items");
        const index = readStore.index("name_idx");
        
        console.log("Testing both operations in the same transaction...");
        
        // Test both operations together
        const [getResult, getAllResult] = await new Promise((resolve, reject) => {
            let getComplete = false;
            let getAllComplete = false;
            let getResultValue, getAllResultValue;
            
            const checkComplete = () => {
                if (getComplete && getAllComplete) {
                    resolve([getResultValue, getAllResultValue]);
                }
            };
            
            // Test index.get()
            const getRequest = index.get("Apple");
            getRequest.onsuccess = () => {
                console.log("get onsuccess fired");
                getResultValue = getRequest.result;
                getComplete = true;
                checkComplete();
            };
            getRequest.onerror = () => {
                console.log("get onerror fired");
                reject(getRequest.error);
            };
            
            // Test index.getAll()
            console.log("About to call index.getAll('Apple')...");
            const getAllRequest = index.getAll("Apple");
            getAllRequest.onsuccess = () => {
                console.log("getAll onsuccess fired");
                getAllResultValue = getAllRequest.result;
                getAllComplete = true;
                checkComplete();
            };
            getAllRequest.onerror = () => {
                console.log("getAll onerror fired");
                reject(getAllRequest.error);
            };
            
            // Add timeout to prevent hanging
            setTimeout(() => {
                console.log("Operations timed out after 5 seconds");
                console.log("getComplete:", getComplete, "getAllComplete:", getAllComplete);
                reject(new Error("Timeout"));
            }, 5000);
        });
        
        console.log("✅ index.get('Apple'):", getResult);
        console.log("✅ index.getAll('Apple'):", getAllResult);
        console.log(`✅ Found ${getAllResult.length} items with name 'Apple'`);
        
        if (getAllResult.length === 2) {
            console.log("🎉 Index operations working correctly!");
        } else {
            console.log("❌ Expected 2 items, got", getAllResult.length);
        }
        
    } catch (error) {
        console.error("❌ Test failed:", error);
    }
}

verifyIndexFix();