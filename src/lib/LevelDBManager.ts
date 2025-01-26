import * as path from "path";
import { Level } from "level";
import { Record, DatabaseStructure } from "./types.js";
import Database from "./Database.js";
import { RecordStoreType } from "./RecordStore.js";
import { SEPARATOR, PathUtils } from "./PathUtils.js";
type RecordValue = Record | Record[];

const DB_VERBOSE = process.env.DB_VERBOSE === "1";

class LevelDBManager {
    private static instance: LevelDBManager;
    private db: Level<string, any>;
    private cache: Map<string, RecordValue> = new Map();
    public isLoaded: boolean = false;
    private databaseStructures: Map<string, DatabaseStructure> = new Map();
    private pendingWrites: Promise<void>[] = [];

    private log(...args: any[]) {
        if (DB_VERBOSE) {
            console.log(...args);
        }
    }

    private logError(...args: any[]) {
        if (DB_VERBOSE) {
            console.error(...args);
        }
    }

    private constructor(dbName: string) {
        this.db = new Level<string, any>(dbName, { valueEncoding: "json" });
    }

    public static getInstance(dbName: string): LevelDBManager {
        if (!LevelDBManager.instance) {
            LevelDBManager.instance = new LevelDBManager(dbName);
        }
        return LevelDBManager.instance;
    }

    public async loadCache() {
        this.log("Loading database structures and data into memory");
        try {
            // Load database structures
            let dbList: string[] = [];
            try {
                const dbListJson = await this.db.get(PathUtils.DB_LIST_KEY);
                dbList = JSON.parse(dbListJson);
                this.log("Loaded database list:", dbList);
            } catch (error) {
                if (error.code === "LEVEL_NOT_FOUND") {
                    this.log(
                        "No existing database list found. Starting with an empty database.",
                    );
                    // Initialize with an empty database list
                    await this.db.put(
                        PathUtils.DB_LIST_KEY,
                        JSON.stringify([]),
                    );
                } else {
                    throw error;
                }
            }

            for (const dbName of dbList) {
                try {
                    const dbStructureJson = await this.db.get(
                        `${PathUtils.DB_STRUCTURE_KEY}${dbName}`,
                    );
                    const dbStructure: DatabaseStructure =
                        JSON.parse(dbStructureJson);
                    this.databaseStructures.set(dbName, dbStructure);
                } catch (error) {
                    if (error.code === "LEVEL_NOT_FOUND") {
                        this.log(
                            `No structure found for database ${dbName}. Skipping.`,
                        );
                    } else {
                        throw error;
                    }
                }
            }
            // console.log('Loaded databaseStructures:', this.databaseStructures);

            // Load actual data
            for await (const [key, value] of this.db.iterator()) {
                if (!PathUtils.SPECIAL_KEYS.includes(key)) {
                    // Skip structure keys
                    this.cache.set(key, value);
                    this.log("LOAD", key, "with value:", value);
                }
            }

            this.isLoaded = true;
            this.log("Database loaded into memory");
        } catch (error) {
            this.logError("Error loading database:", error);
            this.cache.clear();
            this.databaseStructures.clear();
            throw error;
        }
    }

    public async saveDatabaseStructure(db: Database) {
        const dbStructure: DatabaseStructure = {
            name: db.name,
            version: db.version,
            objectStores: {},
        };

        for (const [name, objectStore] of db.rawObjectStores) {
            dbStructure.objectStores[name] = {
                keyPath: objectStore.keyPath,
                autoIncrement: objectStore.autoIncrement,
                indexes: {},
            };

            for (const [indexName, index] of objectStore.rawIndexes) {
                dbStructure.objectStores[name].indexes[indexName] = {
                    keyPath: index.keyPath,
                    multiEntry: index.multiEntry,
                    unique: index.unique,
                };
            }
        }

        const dbList = Array.from(this.databaseStructures.keys());
        if (!dbList.includes(db.name)) {
            dbList.push(db.name);
            // Create promises for both operations
            const dbListPromise = this.db
                .put(PathUtils.DB_LIST_KEY, JSON.stringify(dbList))
                .catch((err) => {
                    this.logError("Error saving database list:", err);
                    throw err;
                })
                .finally(() => {
                    const index = this.pendingWrites.indexOf(dbListPromise);
                    if (index > -1) {
                        this.pendingWrites.splice(index, 1);
                    }
                });

            this.pendingWrites.push(dbListPromise);
            await dbListPromise;
        }

        this.databaseStructures.set(db.name, dbStructure);

        const structurePromise = this.db
            .put(
                `${PathUtils.DB_STRUCTURE_KEY}${db.name}`,
                JSON.stringify(dbStructure),
            )
            .catch((err) => {
                this.logError("Error saving database structure:", err);
                throw err;
            })
            .finally(() => {
                const index = this.pendingWrites.indexOf(structurePromise);
                if (index > -1) {
                    this.pendingWrites.splice(index, 1);
                }
            });

        this.log("Saving database structure", dbStructure);
        this.pendingWrites.push(structurePromise);
        await structurePromise;
    }

    public getDatabaseStructure(dbName: string): DatabaseStructure | undefined {
        return this.databaseStructures.get(dbName);
    }

    public getAllDatabaseStructures(): { [dbName: string]: DatabaseStructure } {
        if (!this.isLoaded)
            throw new Error(
                "Database not loaded yet. Manually call await dbManager.loadCache() before awaiting import of real-indexeddb/auto in any module",
            );
        return Object.fromEntries(this.databaseStructures);
    }

    public get(key: string): RecordValue | undefined {
        if (!this.isLoaded) throw new Error("Database not loaded yet");
        const value = this.cache.get(key);
        this.log("GET", key, value);
        return value;
    }

    public set(key: string, value: RecordValue) {
        this.log("SET", key, value);
        if (!this.isLoaded) throw new Error("Database not loaded yet");

        // Check if this is an index entry
        const isIndex = key.startsWith("index/");

        // For index entries, we need to handle multiple values
        if (isIndex) {
            const existingValue = this.cache.get(key);
            if (existingValue) {
                // Convert to array format if needed
                const existingArray = Array.isArray(existingValue)
                    ? existingValue
                    : [existingValue];
                const valueArray = Array.isArray(value) ? value : [value];

                // Merge arrays and remove duplicates
                const combinedValues = [...existingArray];
                for (const val of valueArray) {
                    if (
                        !combinedValues.some(
                            (existing) =>
                                existing.key === val.key &&
                                existing.value === val.value,
                        )
                    ) {
                        combinedValues.push(val);
                    }
                }
                value = combinedValues;
            }
        }

        this.cache.set(key, value);

        const writePromise = this.db
            .put(key, value)
            .catch((err) => {
                this.logError("Error persisting record:", err);
                throw err;
            })
            .finally(() => {
                const index = this.pendingWrites.indexOf(writePromise);
                if (index > -1) {
                    this.pendingWrites.splice(index, 1);
                }
            });

        this.pendingWrites.push(writePromise);
    }

    public delete(key: string) {
        if (!this.isLoaded) throw new Error("Database not loaded yet");
        this.log("DELETE", key);
        this.cache.delete(key);

        const deletePromise = this.db
            .del(key)
            .catch((err) =>
                this.logError("Error deleting record from persistence:", err),
            )
            .finally(() => {
                const index = this.pendingWrites.indexOf(deletePromise);
                if (index > -1) {
                    this.pendingWrites.splice(index, 1);
                }
            });

        this.pendingWrites.push(deletePromise);
    }

    public async deleteDatabaseStructure(dbName: string) {
        this.databaseStructures.delete(dbName);
        const dbList = Array.from(this.databaseStructures.keys());
        const promises = [
            this.db.put(PathUtils.DB_LIST_KEY, JSON.stringify(dbList)),
            this.db.del(`${PathUtils.DB_STRUCTURE_KEY}${dbName}`),
        ];
        this.pendingWrites.push(...promises);
        await Promise.all(promises);
    }

    public getKeysStartingWith(prefix: string): string[] {
        if (!this.isLoaded) throw new Error("Database not loaded yet");
        return Array.from(this.cache.keys()).filter((key) =>
            key.startsWith(prefix),
        );
    }

    public getValuesForKeysStartingWith(
        prefix: string,
        type: RecordStoreType,
    ): Record[] {
        if (!this.isLoaded) throw new Error("Database not loaded yet");
        const validatedPrefix = type + SEPARATOR + prefix;

        return Array.from(this.cache.entries())
            .filter(([key]) => key.startsWith(validatedPrefix))
            .map(([, value]) => (Array.isArray(value) ? value : [value]))
            .flat();
    }

    public async flushWrites(): Promise<void> {
        this.log("Flushing writes to disk", this.pendingWrites.length);
        if (this.pendingWrites.length === 0) return;

        const writes = [...this.pendingWrites];
        this.pendingWrites = [];

        try {
            // Process writes sequentially instead of in parallel
            for (const write of writes) {
                await write;
            }
            this.log(
                `Successfully flushed ${writes.length} pending writes to disk`,
            );
        } catch (error) {
            // Put failed writes back in the queue in their original order
            this.pendingWrites.unshift(...writes);
            throw error;
        }
    }
}

// Export the instance and the loadCache function
const dbManager = LevelDBManager.getInstance(
    path.resolve(process.cwd(), "indexeddb"),
);
export default dbManager;
