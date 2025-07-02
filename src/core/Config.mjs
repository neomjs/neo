import {isDescriptor} from './ConfigSymbols.mjs';

class Config {
    #value;
    #subscribers = new Set();

    // Meta-properties with framework defaults
    mergeStrategy = 'deep';
    isEqual = Neo.isEqual;

    constructor(configObject) {
        // The symbol check makes the logic clean and unambiguous
        if (Neo.isObject(configObject) && configObject[isDescriptor] === true) {
            this.initDescriptor(configObject);
        } else {
            // It's a simple value, not a descriptor
            this.#value = configObject;
        }
    }

    initDescriptor(descriptor) {
        this.#value = descriptor.value;
        this.mergeStrategy = descriptor.merge || this.mergeStrategy;
        this.isEqual = descriptor.isEqual || this.isEqual;
    }

    get() { return this.#value; }

    set(newValue) {
        const oldValue = this.#value;
        // The setter automatically uses the configured equality check
        if (!this.isEqual(newValue, oldValue)) {
            this.#value = newValue;
            this.notify(newValue, oldValue);
        }
    }

    subscribe(callback) {
        this.#subscribers.add(callback);
        return () => this.#subscribers.delete(callback);
    }

    notify(newValue, oldValue) {
        for (const callback of this.#subscribers) {
            callback(newValue, oldValue);
        }
    }
}

export default Config;
