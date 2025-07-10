# Transaction Limitations in node-indexeddb

## Current State

The node-indexeddb library uses the `lmdb` npm package for persistence. However, there's a fundamental mismatch between IndexedDB's transaction model and what the `lmdb` package provides.

## The Issue

### IndexedDB Transaction Model
IndexedDB expects explicit transaction management:
1. Start a transaction
2. Perform multiple operations across different object stores
3. Commit or rollback the transaction
4. All operations within a transaction should be isolated from other transactions

### LMDB Package Transaction Model
The `lmdb` npm package (v3.x) uses a callback-based transaction model:
- `db.transaction(callback)` - Asynchronous transactions
- `db.transactionSync(callback)` - Synchronous transactions
- No explicit transaction objects that can be passed around
- All operations within the callback are part of the transaction

## Current Implementation

The current implementation in `LMDBManager.ts`:
1. Uses a `TransactionManager` to track transaction state
2. Does NOT provide true ACID transaction isolation
3. Operations are executed directly against the database
4. Transaction IDs are tracked for logging/debugging purposes only

## Implications

1. **No True Isolation**: Operations from different "transactions" can see each other's changes immediately
2. **No Rollback**: The rollback functionality doesn't actually undo database changes
3. **Race Conditions**: Concurrent transactions may interfere with each other

## Potential Solutions

### Option 1: Switch to node-lmdb
The `node-lmdb` package provides explicit transaction management:
```javascript
const txn = env.beginTxn();
const value = txn.getString(dbi, key);
txn.putString(dbi, key, newValue);
txn.commit(); // or txn.abort();
```

### Option 2: Rewrite Transaction Handling
Redesign the transaction handling to work with lmdb's callback model:
- Queue all operations for a transaction
- Execute them all within a single `db.transactionSync()` callback
- This would require significant architectural changes

### Option 3: Accept the Limitations
Document that this implementation doesn't provide full transaction isolation and is best suited for:
- Single-process applications
- Applications that don't require strict transaction isolation
- Use cases where eventual consistency is acceptable

## Recommendation

For applications requiring true transaction isolation and ACID compliance, consider:
1. Using a different IndexedDB implementation
2. Switching to the `node-lmdb` package (would require significant refactoring)
3. Using a different database that better matches your transaction requirements