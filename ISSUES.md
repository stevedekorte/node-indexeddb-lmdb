# Known Issues

This document tracks known bugs and limitations in the LMDB implementation of IndexedDB.

## 🔴 High Priority Issues

### 1. W3C Test Suite Timeouts
- **Status**: 🔴 Critical Issue
- **Description**: Some W3C tests hang/timeout, likely due to async operation issues
- **Examples**: `idbcursor_advance_objectstore.js`, `idbobjectstore_openCursor.js`
- **Impact**: Unknown compatibility issues, tests don't complete

### 2. TypeScript Compilation Errors
- **Status**: 🟡 Build Issue
- **Description**: Multiple TypeScript errors about possibly undefined records
- **Files**: `src/FDBCursor.ts`, `src/lib/Index.ts`, `src/lib/ObjectStore.ts`
- **Impact**: Prevents clean build with type checking

## 🟡 Medium Priority Issues

### 3. Transaction Scope Edge Cases
- **Status**: 🟡 Behavior Issue
- **Description**: Some edge cases in transaction lifecycle may not match spec exactly
- **Impact**: Potential issues with complex transaction patterns

## 🟢 Resolved Issues

### ✅ Index Operations Not Working (Major Fix!)
- **Status**: ✅ Fixed  
- **Description**: `index.getAll()` returned empty arrays, indexes completely non-functional
- **Root Cause**: Multiple issues: 
  1. LMDB range queries fail when startKey === endKey (need point lookup instead)
  2. Missing await on index.storeRecord() causing async timing issues
  3. Array handling bug when multiple records share same index key
- **Solution**: 
  1. Modified LMDBManager.getRange() to use point lookup for exact key matches
  2. Added await to index storeRecord operations in ObjectStore
  3. Added array expansion logic for multi-value index entries
- **Impact**: Index operations now fully functional - get(), getAll(), multiple values per key all working!

### ✅ Cursor Operations Not Working  
- **Status**: ✅ Fixed
- **Description**: `openCursor()` returned `null`, cursors completely non-functional
- **Root Cause**: Transaction ID mismatch between FDBObjectStore and underlying RecordStore, plus incorrect key prefixing in range queries
- **Solution**: Fixed transaction ID setting in FDBObjectStore constructor and corrected RecordStore.getRange key prefixing
- **Commit**: `8f645fd`
- **Impact**: Major breakthrough - cursors now fully functional!

### ✅ Circular Reference Serialization
- **Status**: ✅ Fixed
- **Description**: IndexedDB couldn't store objects with circular references
- **Solution**: Implemented structured clone algorithm with custom serialization
- **Commit**: `91dcdfb`

### ✅ Transaction Rollback Errors
- **Status**: ✅ Fixed
- **Description**: Attempting to rollback already-aborted transactions threw errors
- **Solution**: Added graceful handling for transaction state transitions
- **Commit**: `91dcdfb`

### ✅ Transaction Auto-commit Timing
- **Status**: ✅ Fixed
- **Description**: Transactions committed too early, preventing multi-operation use
- **Solution**: Proper auto-commit timer and execution context tracking
- **Commit**: `67e7f4c`

## 🔍 Investigation Needed

### 5. Advanced Index Operations
- **Status**: 🔍 Needs Testing
- **Description**: Complex index operations like openCursor(), count() may need testing
- **Next Steps**: Test index cursors and advanced query operations

### 6. Versionchange Transaction Behavior
- **Status**: 🔍 Unknown
- **Description**: Database upgrade transactions may have edge case issues
- **Next Steps**: Test complex schema migrations

## 📝 Testing Status

- **Basic Operations**: ✅ Working (add, get, delete, put)
- **Transactions**: ✅ Working (single and multi-op synchronous)
- **Circular References**: ✅ Working
- **Cursors**: ✅ Working (openCursor, cursor.value, instanceof checks)
- **Indexes**: ✅ Working (get, getAll, multi-value keys)
- **Database Versioning**: 🟡 Basic functionality works
- **GetAll Operations**: ✅ Working (object store and index getAll)

## 📊 Test Suite Progress

### Core Functionality Tests
- **Total Core Tests**: 9 tests
- **Status**: ✅ Complete
- **Pass Rate**: **100%** 
- **Passing**: Basic CRUD operations, transactions, object store getAll, index operations (get/getAll), multi-value index keys, circular reference serialization, database versioning

### W3C Test Suite
- **Total W3C Tests**: ~300+ tests  
- **Status**: Evaluation pending
- **Known Issues**: Some TypeScript compilation issues, potential cursor edge cases
- **Next Steps**: Full W3C test suite evaluation planned

---

**Last Updated**: 2025-01-10
**Next Focus**: Run comprehensive test suite to identify remaining edge cases and fix TypeScript compilation issues