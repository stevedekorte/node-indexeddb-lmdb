import { ConstraintError } from "./errors.js";

const MAX_KEY = 9007199254740992;

class KeyGenerator {
    // This is kind of wrong. Should start at 1 and increment only after record is saved
    public num = 0;

    public next() {
        if (this.num >= MAX_KEY) {
            const errorMessage = `The key generator has reached its maximum value of ${MAX_KEY} and cannot generate new keys. Error Code: KEY_GEN_CONSTRAINT_ERR_001`;
            console.error("ConstraintError:", errorMessage);
            throw new ConstraintError(errorMessage);
        }

        this.num += 1;

        return this.num;
    }

    // https://w3c.github.io/IndexedDB/#possibly-update-the-key-generator
    public setIfLarger(num: number) {
        const value = Math.floor(Math.min(num, MAX_KEY)) - 1;

        if (value >= this.num) {
            this.num = value + 1;
        }
    }
}

export default KeyGenerator;
