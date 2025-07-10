export const SEPARATOR = "/";
export class PathUtils {
    static DB_LIST_KEY = "__db_list__";
    static DB_STRUCTURE_KEY = "__db_structure__";
    static SPECIAL_KEYS = [PathUtils.DB_LIST_KEY, PathUtils.DB_STRUCTURE_KEY];
    static createObjectStoreKeyPath(dbName, storeName) {
        return `${dbName}/${storeName}/`;
    }
    // For record store
    static createRecordStoreKeyPath(keyPrefix, type, key) {
        // Encode keys to preserve IndexedDB ordering in string comparison
        const encodedKey = PathUtils.encodeKey(key);
        return type + SEPARATOR + keyPrefix + encodedKey;
    }
    // Encode a key to preserve natural ordering in string comparison
    static encodeKey(key) {
        if (typeof key === 'number') {
            // Pad numbers to ensure proper string ordering
            // Use a fixed width (16 chars) with leading zeros
            return key.toString().padStart(16, '0');
        }
        else if (typeof key === 'string') {
            return JSON.stringify(key); // Keep string quotes for proper encoding
        }
        else if (key instanceof Date) {
            // Encode dates as numbers (milliseconds since epoch) with padding
            return key.getTime().toString().padStart(16, '0');
        }
        else if (Array.isArray(key)) {
            // For array keys, encode each element and join
            return '[' + key.map(k => PathUtils.encodeKey(k)).join(',') + ']';
        }
        else {
            return JSON.stringify(key);
        }
    }
    // Decode a key from its encoded string representation
    static decodeKey(encodedKey) {
        // Check for padded numbers (16 chars, all digits)
        if (encodedKey.length === 16 && /^\d+$/.test(encodedKey)) {
            return parseInt(encodedKey, 10);
        }
        // Check for array format
        if (encodedKey.startsWith('[') && encodedKey.endsWith(']')) {
            const inner = encodedKey.slice(1, -1);
            if (inner === '')
                return [];
            return inner.split(',').map(k => PathUtils.decodeKey(k));
        }
        // Try JSON parsing (for strings, etc.)
        try {
            return JSON.parse(encodedKey);
        }
        catch {
            // If all else fails, return as string
            return encodedKey;
        }
    }
}
