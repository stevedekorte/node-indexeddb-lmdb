import FDBCursor from "./FDBCursor.js";
import { CursorRange, CursorSource, FDBCursorDirection, Value } from "./lib/types.js";
declare class FDBCursorWithValue extends FDBCursor {
    value: Value;
    constructor(source: CursorSource, range: CursorRange, direction?: FDBCursorDirection, request?: any);
    toString(): string;
}
export default FDBCursorWithValue;
