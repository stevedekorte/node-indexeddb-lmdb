import { Key } from "./lib/types.js";
declare class FDBKeyRange {
    static only(value: Key): FDBKeyRange;
    static lowerBound(lower: Key, open?: boolean): FDBKeyRange;
    static upperBound(upper: Key, open?: boolean): FDBKeyRange;
    static bound(lower: Key, upper: Key, lowerOpen?: boolean, upperOpen?: boolean): FDBKeyRange;
    readonly lower: Key | undefined;
    readonly upper: Key | undefined;
    readonly lowerOpen: boolean;
    readonly upperOpen: boolean;
    constructor(lower: Key | undefined, upper: Key | undefined, lowerOpen: boolean, upperOpen: boolean);
    includes(key: Key): boolean;
    toString(): string;
}
export default FDBKeyRange;
