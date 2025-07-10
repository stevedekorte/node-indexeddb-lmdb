export class TransactionManager {
    contexts = new Map();
    transactionCounter = 0;
    createContext(readOnly = false, objectStoreNames = []) {
        const id = `txn_${++this.transactionCounter}_${Date.now()}`;
        const context = {
            id,
            readOnly,
            startTime: Date.now(),
            operations: [],
            state: 'active',
            objectStoreNames,
        };
        this.contexts.set(id, context);
        return context;
    }
    getContext(txnId) {
        return this.contexts.get(txnId);
    }
    async commitContext(txnId) {
        const context = this.contexts.get(txnId);
        if (!context) {
            throw new Error(`Transaction context ${txnId} not found`);
        }
        if (context.state !== 'active') {
            throw new Error(`Transaction ${txnId} is not active (state: ${context.state})`);
        }
        context.state = 'committed';
        // Keep context for a short time to handle any pending operations
        setTimeout(() => {
            this.contexts.delete(txnId);
        }, 1000);
    }
    async rollbackContext(txnId) {
        const context = this.contexts.get(txnId);
        if (!context) {
            // Transaction might already be cleaned up - silently ignore
            return;
        }
        if (context.state === 'aborted') {
            // Transaction is already aborted - silently ignore
            return;
        }
        if (context.state === 'committed') {
            // Cannot rollback a committed transaction
            throw new Error(`Cannot rollback transaction ${txnId} - already committed`);
        }
        context.state = 'aborted';
        // Keep context for a short time to handle any pending operations
        setTimeout(() => {
            this.contexts.delete(txnId);
        }, 1000);
    }
    recordOperation(txnId, operation) {
        const context = this.contexts.get(txnId);
        if (!context) {
            // Transaction might have been aborted or committed - silently ignore
            return;
        }
        if (context.state !== 'active') {
            // Transaction is no longer active - silently ignore
            return;
        }
        context.operations.push({
            ...operation,
            timestamp: Date.now(),
        });
    }
    getActiveTransactionCount() {
        let count = 0;
        for (const context of this.contexts.values()) {
            if (context.state === 'active') {
                count++;
            }
        }
        return count;
    }
    getAllActiveTransactions() {
        const active = [];
        for (const context of this.contexts.values()) {
            if (context.state === 'active') {
                active.push(context);
            }
        }
        return active;
    }
    cleanupStaleTransactions(maxAge = 5 * 60 * 1000) {
        const now = Date.now();
        let cleaned = 0;
        for (const [id, context] of this.contexts.entries()) {
            if (context.state === 'active' && (now - context.startTime) > maxAge) {
                context.state = 'aborted';
                this.contexts.delete(id);
                cleaned++;
            }
        }
        return cleaned;
    }
}
