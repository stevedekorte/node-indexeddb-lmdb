# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

### Build Commands
- `pnpm run build` - Full build process (cleans, builds ESM, CJS, and types)
- `pnpm run build-esm` - Build ES modules output
- `pnpm run build-cjs` - Build CommonJS output
- `pnpm run build-types` - Generate TypeScript declaration files

### Testing Commands
- `pnpm run test` - Run full test suite (lint, build, jest, integration tests, W3C tests, mocha, qunit)
- `pnpm run test-jest` - Run Jest tests only
- `pnpm run test-mocha` - Run Mocha tests for fakeIndexedDB
- `pnpm run test-w3c` - Run W3C web platform tests
- `pnpm run test-qunit` - Run QUnit tests
- `pnpm run test-dev` - Run development tests with ts-node
- `pnpm run test-dev:watch` - Run development tests in watch mode
- `pnpm run test-db` - Run database-specific tests

### Linting & Formatting
- `pnpm run lint` - Run ESLint and TypeScript compiler
- `pnpm run prettier` - Format code with Prettier

## Architecture Overview

This project implements a Node.js-compatible IndexedDB API using LMDB for persistence. The architecture consists of:

### Core Components

1. **FDBFactory** (`src/FDBFactory.ts`) - Main factory class that creates databases and manages connections
2. **FDBDatabase** (`src/FDBDatabase.ts`) - Database connection wrapper  
3. **Database** (`src/lib/Database.ts`) - Internal database representation with object stores and transactions
4. **LMDBManager** (`src/lib/LMDBManager.ts`) - Singleton that manages LMDB persistence with transaction queueing
5. **ObjectStore** (`src/lib/ObjectStore.ts`) - Object store implementation
6. **RecordStore** (`src/lib/RecordStore.ts`) - Low-level record storage and indexing

### Key Architecture Patterns

- **Singleton Pattern**: `LMDBManager` ensures single instance for database persistence
- **Transaction Queueing**: Write operations are queued and executed atomically on commit
- **Asynchronous Initialization**: Must call `await dbManager.loadCache()` before using IndexedDB APIs
- **Event-Driven**: Uses custom event system (`FakeEvent`, `FakeEventTarget`) to mimic browser behavior
- **Transaction Management**: Uses LMDB transactions for atomicity with operation queueing

### Data Flow

1. Database structures are loaded from LMDB on startup
2. Write operations within transactions are queued in memory
3. On commit, all queued operations execute atomically in an LMDB transaction
4. Read operations check the transaction queue first for read-your-writes consistency
5. Database schema is stored separately from data records

### Important Usage Requirements

- **CRITICAL**: Must call `await dbManager.loadCache()` before importing `node-indexeddb/auto`
- Uses LMDB for actual persistence with memory-mapped files
- Supports both ES modules and CommonJS exports
- Transactions queue operations for atomic execution on commit

### Test Architecture

- **Jest Tests**: Unit tests in `test/jest.js`
- **W3C Tests**: Web platform tests converted from HTML to JS in `src/test/web-platform-tests/`
- **Mocha Tests**: Integration tests in `src/test/fakeIndexedDB/`
- **QUnit Tests**: Browser compatibility tests in `src/test/indexedDBmock/`
- **Development Tests**: TypeScript tests with ts-node loader

### Key Files to Understand

- `src/index.ts` - Main entry point with exports
- `src/fakeIndexedDB.ts` - Creates FDBFactory instance
- `src/lib/LMDBManager.ts` - Database persistence layer with transaction queueing
- `src/lib/TransactionManager.ts` - Manages transaction contexts and operation queues
- `src/lib/Database.ts` - Database structure and transaction processing
- `src/lib/PathUtils.ts` - Key path utilities for LMDB storage
- `src/lib/types.ts` - TypeScript type definitions

### Environment Variables

- `DB_VERBOSE=1` - Enable debug logging for database operations

## Transaction Implementation

### How Transactions Work

The LMDB integration uses a transaction queueing system since the `lmdb` npm package (v3.x) uses callback-based transactions:

1. **Transaction Creation**: When `beginTransaction()` is called, a unique transaction ID is generated and a context is created to track operations.

2. **Operation Queueing**: 
   - Write operations (`set`, `delete`) within active transactions are queued in memory
   - Read operations check the queue first to provide read-your-writes consistency
   - Operations outside transactions execute immediately against LMDB

3. **Commit Process**:
   - All queued operations are executed within a single LMDB transaction callback
   - This ensures atomicity - either all operations succeed or none do
   - The transaction context is marked as 'committed'

4. **Abort/Rollback**:
   - Queued operations are discarded
   - The transaction context is marked as 'aborted'
   - No changes are written to LMDB

### Transaction Isolation Notes

- Write operations are isolated within their transaction until commit
- Read operations see their own transaction's writes plus all committed data
- No snapshot isolation - transactions may see other committed changes
- Best suited for single-process applications

### Key Transaction Files

- `src/lib/LMDBManager.ts` - Handles operation queueing and LMDB transaction execution
- `src/lib/TransactionManager.ts` - Manages transaction contexts and operation tracking
- `src/FDBTransaction.ts` - IndexedDB transaction API implementation


### More Documentation

See the /docs folder for more documentation and notes.