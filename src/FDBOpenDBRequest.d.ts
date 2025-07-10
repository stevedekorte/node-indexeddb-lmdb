import FDBRequest from "./FDBRequest.js";
import { EventCallback } from "./lib/types.js";
declare class FDBOpenDBRequest extends FDBRequest {
    onupgradeneeded: EventCallback | null;
    onblocked: EventCallback | null;
    toString(): string;
}
export default FDBOpenDBRequest;
