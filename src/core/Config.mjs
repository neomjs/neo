import {isDescriptor} from './ConfigSymbols.mjs';

class Config {
    #subscribers = new Set();
    #value;

    // Meta-properties with framework defaults
    isEqual = Neo.isEqual;
    mergeStrategy = 'deep';

    constructor(configObject) {
        // The symbol check makes the logic clean and unambiguous
        if (Neo.isObject(configObject) && configObject[isDescriptor] === true) {
            this.initDescriptor(configObject);
        } else {
            // It's a simple value, not a descriptor
           // this.#value = configObject;
        }
    }

    get() { return this.#value; }

    initDescriptor(descriptor) {
        this.#value = descriptor.value;
        this.mergeStrategy = descriptor.merge || this.mergeStrategy;
        this.isEqual = descriptor.isEqual || this.isEqual;
    }

    notify(newValue, oldValue) {
        for (const callback of this.#subscribers) {
            callback(newValue, oldValue);
        }
    }

    set(newValue) {
        const oldValue = this.#value;
        // The setter automatically uses the configured equality check
        if (!this.isEqual(newValue, oldValue)) {
            this.#value = newValue;
            this.notify(newValue, oldValue);
        }
    }

    setRaw(newValue) {
        this.#value = newValue;
    }

    subscribe(callback) {
        this.#subscribers.add(callback);
        return () => this.#subscribers.delete(callback);
    }
}

export default Config;
