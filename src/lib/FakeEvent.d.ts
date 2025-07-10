import FakeEventTarget from "./FakeEventTarget.js";
import { EventType } from "./types.js";
declare class Event {
    eventPath: FakeEventTarget[];
    type: EventType;
    readonly NONE = 0;
    readonly CAPTURING_PHASE = 1;
    readonly AT_TARGET = 2;
    readonly BUBBLING_PHASE = 3;
    propagationStopped: boolean;
    immediatePropagationStopped: boolean;
    canceled: boolean;
    initialized: boolean;
    dispatched: boolean;
    target: FakeEventTarget | null;
    currentTarget: FakeEventTarget | null;
    eventPhase: 0 | 1 | 2 | 3;
    defaultPrevented: boolean;
    isTrusted: boolean;
    timeStamp: number;
    bubbles: boolean;
    cancelable: boolean;
    constructor(type: EventType, eventInitDict?: {
        bubbles?: boolean;
        cancelable?: boolean;
    });
    preventDefault(): void;
    stopPropagation(): void;
    stopImmediatePropagation(): void;
}
export default Event;
