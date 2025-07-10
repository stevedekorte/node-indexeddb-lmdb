// Utility functions for handling serialization with circular references
// This implements a structured clone algorithm similar to what IndexedDB uses
export function serializeValue(value) {
    // Use structured clone algorithm for proper circular reference handling
    const objectMap = new Map();
    let objectId = 0;
    function serialize(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        // Check if we've seen this object before
        if (objectMap.has(obj)) {
            return { __circular_ref__: objectMap.get(obj) };
        }
        // Assign an ID to this object
        const id = objectId++;
        objectMap.set(obj, id);
        if (Array.isArray(obj)) {
            return {
                __type__: 'array',
                __id__: id,
                __data__: obj.map(serialize)
            };
        }
        else if (obj instanceof Date) {
            return {
                __type__: 'date',
                __id__: id,
                __data__: obj.toISOString()
            };
        }
        else if (obj instanceof RegExp) {
            return {
                __type__: 'regexp',
                __id__: id,
                __data__: {
                    source: obj.source,
                    flags: obj.flags
                }
            };
        }
        else {
            // Regular object
            const result = {
                __type__: 'object',
                __id__: id,
                __data__: {}
            };
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    result.__data__[key] = serialize(obj[key]);
                }
            }
            return result;
        }
    }
    return JSON.stringify(serialize(value));
}
export function deserializeValue(jsonString) {
    try {
        const parsed = JSON.parse(jsonString);
        // If it's not a structured clone object, return as-is
        if (!parsed || typeof parsed !== 'object' || !parsed.__type__) {
            return parsed;
        }
        const objectMap = new Map();
        // eslint-disable-next-line no-inner-declarations
        function deserialize(obj) {
            if (obj === null || typeof obj !== 'object') {
                return obj;
            }
            // Handle circular references
            if (obj.__circular_ref__ !== undefined) {
                return objectMap.get(obj.__circular_ref__);
            }
            // Handle structured clone objects
            if (obj.__type__ && obj.__id__ !== undefined) {
                let result;
                switch (obj.__type__) {
                    case 'array':
                        result = [];
                        objectMap.set(obj.__id__, result);
                        for (let i = 0; i < obj.__data__.length; i++) {
                            result[i] = deserialize(obj.__data__[i]);
                        }
                        break;
                    case 'date':
                        result = new Date(obj.__data__);
                        objectMap.set(obj.__id__, result);
                        break;
                    case 'regexp':
                        result = new RegExp(obj.__data__.source, obj.__data__.flags);
                        objectMap.set(obj.__id__, result);
                        break;
                    case 'object':
                        result = {};
                        objectMap.set(obj.__id__, result);
                        for (const key in obj.__data__) {
                            result[key] = deserialize(obj.__data__[key]);
                        }
                        break;
                    default:
                        result = obj;
                }
                return result;
            }
            // Regular object - recursively deserialize
            const result = {};
            for (const key in obj) {
                result[key] = deserialize(obj[key]);
            }
            return result;
        }
        return deserialize(parsed);
    }
    catch (error) {
        console.error('Failed to deserialize value:', error);
        return null;
    }
}
export function isCircularReference(obj) {
    try {
        JSON.stringify(obj);
        return false;
    }
    catch (error) {
        return error instanceof TypeError && error.message.includes('circular');
    }
}
