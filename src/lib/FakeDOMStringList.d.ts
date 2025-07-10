declare class FakeDOMStringList extends Array<string> {
    contains(value: string): boolean;
    item(i: number): string | null;
    _push(...values: Parameters<typeof Array.prototype.push>): number;
    _sort(...values: Parameters<typeof Array.prototype.sort>): any[];
}
export default FakeDOMStringList;
