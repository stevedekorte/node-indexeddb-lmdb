import { Key } from "./types.js";
declare const valueToKey: (input: any, seen?: Set<object>) => Key | Key[];
export default valueToKey;
