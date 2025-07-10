import FakeEvent from "./FakeEvent.js";
import { EventCallback, EventType } from "./types.js";
interface Listener {
    callback: EventCallback;
    capture: boolean;
    type: EventType;
}
declare abstract class FakeEventTarget {
    readonly listeners: Listener[];
    readonly onabort: EventCallback | null | undefined;
    readonly onblocked: EventCallback | null | undefined;
    readonly oncomplete: EventCallback | null | undefined;
    readonly onerror: EventCallback | null | undefined;
    readonly onsuccess: EventCallback | null | undefined;
    readonly onupgradeneeded: EventCallback | null | undefined;
    readonly onversionchange: EventCallback | null | undefined;
    addEventListener(type: EventType, callback: EventCallback, capture?: boolean): void;
    removeEventListener(type: EventType, callback: EventCallback, capture?: boolean): void;
    dispatchEvent(event: FakeEvent): boolean;
}
export default FakeEventTarget;
