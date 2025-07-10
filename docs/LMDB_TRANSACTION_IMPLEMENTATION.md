# LMDB Transaction Implementation

## Overview

This document describes the transaction handling implementation for the LMDB migration of node-indexeddb.

## Architecture

### Transaction Queueing System

Since the `lmdb` npm package (v3.x) uses callback-based transactions rather than exposing transaction objects, we implemented a queueing system:

1. **Write Operations are Queued**: When a write transaction is active, all `set` and `delete` operations are queued in memory rather than executed immediately.

2. **Read Operations Check Queue**: When reading data, we first check if the key has been modified in the current transaction's queue. This provides read-your-writes consistency within a transaction.

3. **Commit Executes All Operations**: On commit, all queued operations are executed within a single LMDB transaction callback, ensuring atomicity.

4. **Rollback Discards Queue**: On abort/rollback, the queued operations are simply discarded and never executed.

### Key Components

#### LMDBManager
- `beginTransaction()`: Creates a transaction context and returns a transaction ID
- `commitTransaction()`: Executes all queued operations in an LMDB transaction
- `rollbackTransaction()`: Discards all queued operations
- `get/set/delete()`: Check transaction state and either queue operations or execute immediately

#### TransactionManager
- Manages transaction contexts with unique IDs
- Tracks operation history for each transaction
- Handles transaction state transitions (active → committed/aborted)
- Keeps contexts alive briefly after completion to handle pending operations

#### FDBTransaction
- Creates LMDB transaction ID on construction
- Passes transaction ID to all object stores in scope
- Handles proper cleanup on commit/abort

## Transaction Isolation

### Current Implementation
- **Write operations**: Queued and executed atomically on commit
- **Read operations**: See queued writes within the same transaction
- **Isolation between transactions**: Limited - transactions can see each other's committed changes immediately

### Limitations
1. **No true MVCC isolation**: Different transactions may see each other's changes
2. **No snapshot isolation**: Read-only transactions see the latest committed state
3. **Best for single-process applications**: Not suitable for high-concurrency scenarios

## Usage Patterns

### Write Transaction
```javascript
const tx = db.transaction(['store'], 'readwrite');
const store = tx.objectStore('store');

// These operations are queued
store.put({ id: 1, name: 'Item 1' });
store.put({ id: 2, name: 'Item 2' });
store.delete(3);

// On commit, all operations execute atomically
tx.oncomplete = () => console.log('All operations committed');
```

### Read-Your-Writes
```javascript
const tx = db.transaction(['store'], 'readwrite');
const store = tx.objectStore('store');

store.put({ id: 1, name: 'Item 1' });

// This read will see the queued write
const req = store.get(1);
req.onsuccess = () => {
    console.log(req.result); // { id: 1, name: 'Item 1' }
};
```

### Abort Handling
```javascript
const tx = db.transaction(['store'], 'readwrite');
const store = tx.objectStore('store');

store.put({ id: 1, name: 'Item 1' });
tx.abort();

// The put operation is never executed
```

## Future Improvements

1. **Consider node-lmdb**: This package provides more control over transactions
2. **Implement snapshot isolation**: Store transaction start timestamps and filter visibility
3. **Add transaction retry logic**: Handle transaction conflicts gracefully
4. **Optimize queue handling**: Use more efficient data structures for large transactions