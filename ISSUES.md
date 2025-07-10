# Known Issues

This document tracks known bugs and limitations in the LMDB implementation of IndexedDB.

## 🔴 High Priority Issues

### 1. Cursor Operations Not Working
- **Status**: 🔴 Critical Bug
- **Description**: `openCursor()` returns `null` even when data exists, `getAll()` operations hang
- **Affected Methods**: `openCursor()`, `openKeyCursor()`, `getAll()`, `getAllKeys()`
- **Test Cases**: `idbcursor_advance_objectstore.js`, cursor-related W3C tests
- **Impact**: Prevents iteration over data, breaks many applications

### 2. TypeScript Compilation Errors
- **Status**: 🟡 Build Issue
- **Description**: Multiple TypeScript errors about possibly undefined records
- **Files**: `src/FDBCursor.ts`, `src/lib/Index.ts`, `src/lib/ObjectStore.ts`
- **Impact**: Prevents clean build with type checking

## 🟡 Medium Priority Issues

### 3. W3C Test Suite Failures
- **Status**: 🟡 Compliance Issue
- **Description**: Various W3C IndexedDB tests failing beyond cursor issues
- **Examples**: `idbcursor_advance_objectstore.js` fails instanceof checks
- **Impact**: Reduced compatibility with standard IndexedDB behavior

### 4. Transaction Scope Edge Cases
- **Status**: 🟡 Behavior Issue
- **Description**: Some edge cases in transaction lifecycle may not match spec exactly
- **Impact**: Potential issues with complex transaction patterns

## 🟢 Resolved Issues

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

### 5. Potential Index Implementation Issues
- **Status**: 🔍 Unknown
- **Description**: Index operations may have bugs (not yet thoroughly tested)
- **Next Steps**: Need comprehensive index testing

### 6. Versionchange Transaction Behavior
- **Status**: 🔍 Unknown
- **Description**: Database upgrade transactions may have edge case issues
- **Next Steps**: Test complex schema migrations

## 📝 Testing Status

- **Basic Operations**: ✅ Working (add, get, delete, put)
- **Transactions**: ✅ Working (single and multi-op synchronous)
- **Circular References**: ✅ Working
- **Cursors**: 🔴 Not Working
- **Indexes**: 🔍 Unknown
- **Database Versioning**: 🟡 Basic functionality works

## 📊 W3C Test Suite Progress

- **Total Tests**: ~300+ tests
- **Status**: Testing in progress
- **Known Passing**: Basic CRUD operations, transaction management, circular references
- **Known Failing**: Cursor operations, some edge cases
- **Estimated Pass Rate**: TBD (needs full test run after cursor fixes)

---

**Last Updated**: 2025-01-10
**Next Focus**: Fix cursor implementation to resolve high-priority blocking issues