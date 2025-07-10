# LMDB Implementation for node-indexeddb

This document describes the LMDB-based implementation of IndexedDB for Node.js and its compatibility with the web IndexedDB specification.

## Overview

This implementation uses LMDB (Lightning Memory-Mapped Database) as the storage backend, replacing the previous LevelDB-based approach. LMDB provides ACID transactions and efficient memory-mapped file access.

## Architecture

### Transaction Queue System

Since the `lmdb` npm package (v3.x) uses callback-based transactions, we implement a queueing system:

1. **Write operations** within a transaction are queued in memory
2. **Read operations** check the queue first for read-your-writes consistency  
3. **On commit**, all queued operations execute atomically in a single LMDB transaction
4. **On abort**, queued operations are discarded

## Compatibility with Web IndexedDB

### ✅ What IS Compatible

1. **Core API Surface**
   - All main IndexedDB interfaces: `IDBDatabase`, `IDBTransaction`, `IDBObjectStore`, `IDBIndex`, `IDBCursor`, etc.
   - Full support for database versioning and schema upgrades
   - Complete event model with `onsuccess`, `onerror`, `oncomplete`, `onabort` callbacks

2. **Transaction Semantics**
   - **Atomicity**: All operations within a transaction succeed or fail together
   - **Read-your-writes**: Can read data written earlier in the same transaction
   - **Abort/Rollback**: Transactions can be aborted, properly discarding all changes
   - **Auto-commit**: Transactions automatically commit when all requests complete

3. **Data Operations**
   - All CRUD operations: `put`, `add`, `get`, `delete`, `clear`
   - Cursor operations: `openCursor`, `openKeyCursor` with all cursor directions
   - Index operations: Creating, using, and deleting indexes
   - Key ranges: Full support for `IDBKeyRange` with bounds and operators

4. **Data Types**
   - Structured clone algorithm for complex JavaScript objects
   - Binary data (ArrayBuffer, Blob)
   - Date objects, RegExp, and other built-in types
   - Circular references handled correctly

### ❌ What's NOT Fully Compatible

1. **Transaction Isolation**
   - **Web**: Provides snapshot isolation - each transaction sees a consistent database state
   - **This implementation**: Limited isolation - transactions may see committed changes from other transactions immediately
   - **Impact**: Potential read inconsistencies in high-concurrency scenarios

2. **Concurrency Model**
   - **Web**: Handles multiple tabs/workers with automatic coordination
   - **This implementation**: Optimized for single-process Node.js applications
   - **Impact**: Multiple Node.js processes accessing the same database may experience race conditions

3. **Transaction Scheduling**
   - **Web**: Specific scheduling rules for transaction lifetime and interleaving
   - **This implementation**: Different timing characteristics due to LMDB's transaction model
   - **Impact**: Code relying on specific transaction scheduling behavior may need adjustment

4. **Performance Characteristics**
   - **Web**: In-memory with periodic flushes to disk
   - **This implementation**: Memory-mapped files with different caching behavior
   - **Impact**: Different performance profiles for read-heavy vs write-heavy workloads

5. **Error Details**
   - Error messages and specific error conditions may differ slightly
   - Some web-specific errors (like quota exceeded) don't apply

## Use Case Recommendations

### ✅ Good Fit For

- Single-process Node.js applications
- Server-side rendering with IndexedDB code sharing
- Development/testing environments
- Applications ported from the browser
- Electron apps needing consistent API

### ⚠️ Consider Alternatives For

- Multi-process applications requiring strict isolation
- High-concurrency scenarios with many writers
- Applications requiring exact web IndexedDB behavior
- Systems needing distributed database access

## Migration Notes

When migrating from web IndexedDB:

1. **Add initialization**: Must call `await dbManager.loadCache()` before use
2. **Handle process coordination**: If using multiple processes, implement external locking
3. **Test transaction behavior**: Verify your transaction patterns work correctly
4. **Monitor performance**: LMDB has different performance characteristics than in-browser storage

## Configuration

### Environment Variables

- `DB_VERBOSE=1` - Enable detailed transaction and operation logging

### Database Location

By default, databases are stored in `./indexeddb/` relative to the current working directory.

## Example Usage

```javascript
// Required initialization
const dbManager = require('node-indexeddb/lib/LMDBManager');
await dbManager.loadCache();

// Then use standard IndexedDB API
const indexedDB = require('node-indexeddb/auto');

const request = indexedDB.open('mydb', 1);
request.onsuccess = (event) => {
    const db = event.target.result;
    const tx = db.transaction(['store'], 'readwrite');
    const store = tx.objectStore('store');
    
    store.put({ id: 1, data: 'test' });
    
    tx.oncomplete = () => {
        console.log('Transaction completed');
    };
};
```

## Technical Details

### LMDB Transaction Implementation

- Uses LMDB's `transaction()` callback for atomic writes
- Operations are queued until commit time
- Read operations check queue first, then LMDB
- Transaction contexts are managed with unique IDs
- Supports nested event loop operations via Promise chains

### Memory Usage

- LMDB uses memory-mapped files, reducing heap usage
- Transaction queues use temporary memory until commit
- Large transactions may require more memory during execution

### Durability

- LMDB provides full ACID durability
- Commits are synchronous and durable by default
- No data loss on process crash after commit

## Limitations

1. **No cross-process transaction coordination** - Each process has independent transactions
2. **No automatic garbage collection** - Deleted database space requires manual compaction
3. **File locking** - Database files are locked while the process runs
4. **Platform differences** - LMDB behavior may vary slightly between operating systems

## Future Improvements

1. Implement proper MVCC for better transaction isolation
2. Add multi-process coordination layer
3. Support for LMDB-specific features (like read-only transactions without copying)
4. Performance optimizations for specific workload patterns