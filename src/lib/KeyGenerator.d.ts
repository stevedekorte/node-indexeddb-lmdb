declare class KeyGenerator {
    num: number;
    next(): number;
    setIfLarger(num: number): void;
}
export default KeyGenerator;
