import CoreBase        from '../../core/Base.mjs';
import IdGenerator     from '../../core/IdGenerator.mjs';
import Instance        from '../../manager/Instance.mjs';
import ClassSystemUtil from '../../util/ClassSystem.mjs';

const hooks    = ['request', 'response', 'responseError', 'postParse'],
      reserved = new Set([
          ...hooks, 'id', 'ntype', 'ready', 'destroy', 'isDestroyed', 'isReady',
          'construct', 'init', 'initAsync', 'onConstructed', 'onAfterConstructed',
          '__proto__', 'prototype', 'constructor'
      ]);

/**
 * @summary One ordered, owned handler snapshot, retained by operation leases.
 * Modules must already be loaded in this realm. Retirement refuses new leases immediately, while
 * admitted operations keep every handler alive through readiness and execution. The owner calls
 * retire(), and each operation releases its lease in finally; Core Base destruction stays unchanged.
 * @class Neo.data.interceptor.Chain
 * @extends Neo.core.Base
 */
class Chain extends CoreBase {
    static config = {
        /** @member {String} className='Neo.data.interceptor.Chain' */
        className: 'Neo.data.interceptor.Chain',
        /**
         * Construction-only class/config descriptors. Every handler receives a fresh chain-owned id.
         * @member {Object[]} descriptors=[]
         */
        descriptors: []
    }

    #handlers = Object.freeze([])
    #leases = 0
    #retired = false
    #disposed = false

    /**
     * @summary Copies data-only descriptors before serialization or construction, without invoking accessors.
     * Bare registered classes normalize to module descriptors. modulePath is a scoped .mjs path,
     * not a URL; options are plain objects, dense arrays, finite numbers, strings, booleans or null/undefined.
     * @param {Array} descriptors
     * @returns {Object[]}
     * @throws {TypeError} Invalid identity, callable options, borrowed instances or escaping paths.
     */
    static validateDescriptors(descriptors) {
        if (!Array.isArray(descriptors)) throw new TypeError('Interceptor descriptors must be an array');

        for (const key of Reflect.ownKeys(descriptors)) {
            if (key === 'length') continue;
            const property = Object.getOwnPropertyDescriptor(descriptors, key);
            if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= descriptors.length ||
                !property.enumerable || !Object.hasOwn(property, 'value')) {
                throw new TypeError('Interceptor descriptors must be a plain dense array')
            }
        }

        return Array.from({length: descriptors.length}, (_, index) => {
            const input      = Object.getOwnPropertyDescriptor(descriptors, index)?.value;
            const descriptor = Neo.typeOf(input) === 'NeoClass' ? {module: input} : input,
                  location   = `interceptors[${index}]`,
                  copy       = {};

            if (!Chain.#isPlainObject(descriptor)) throw new TypeError(`${location} must be a class or config descriptor`);

            for (const key of Reflect.ownKeys(descriptor)) {
                const property = Object.getOwnPropertyDescriptor(descriptor, key);
                if (typeof key !== 'string' || !property.enumerable || !Object.hasOwn(property, 'value') || reserved.has(key)) {
                    throw new TypeError(`${location} contains an unsupported option: ${String(key)}`)
                }
                copy[key] = key === 'module'
                    ? Chain.#registeredClass(property.value)
                    : Chain.#copyData(property.value, new Set(), `${location}.${key}`)
            }

            if (copy.className !== undefined && (typeof copy.className !== 'string' || !copy.className.trim() ||
                copy.className.trim() !== copy.className ||
                copy.className.split('.').some(part => !part || ['__proto__', 'prototype', 'constructor'].includes(part)))) {
                throw new TypeError(`${location}.className must name a registered Neo class`)
            }
            if (copy.module) {
                const name = copy.module.prototype.className;
                if (copy.className !== undefined && copy.className !== name) {
                    throw new TypeError(`${location} module and className disagree`)
                }
                copy.className = name
            } else if (!copy.className) {
                throw new TypeError(`${location} requires module or className`)
            }

            if (copy.modulePath !== undefined) {
                const path = copy.modulePath;
                if (typeof path !== 'string' || !/^(apps\/|examples\/|docs\/app\/|src\/data\/).+\.mjs$/.test(path) ||
                    /[\\?#%:\u0000-\u001f\u007f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) {
                    throw new TypeError(`${location}.modulePath must be a scoped, non-escaping .mjs path`)
                }
            }

            return copy
        })
    }

    /** @summary Whether a value is an ordinary data/config object. @private */
    static #isPlainObject(value) {
        return value !== null && typeof value === 'object' &&
            (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    }

    /** @summary Resolves only registered Neo classes, never an existing singleton or instance. @private */
    static #registeredClass(value) {
        if (Neo.typeOf(value) !== 'NeoClass' || !(value === CoreBase || CoreBase.prototype.isPrototypeOf(value.prototype)) ||
            value.prototype.singleton || Neo.ns(value.prototype.className) !== value) {
            throw new TypeError('An interceptor must be a registered Neo class, not a borrowed instance or singleton')
        }
        return value
    }

    /** @summary Copies options recursively while refusing hidden behavior and cycles. @private */
    static #copyData(value, ancestors, location) {
        if (value == null || typeof value === 'string' || typeof value === 'boolean' ||
            typeof value === 'number' && Number.isFinite(value)) return value;

        const array = Array.isArray(value);
        if (!array && !Chain.#isPlainObject(value) || ancestors.has(value)) {
            throw new TypeError(`${location} must contain only acyclic plain data`)
        }

        ancestors.add(value);
        const copy = array ? [] : {};
        for (const key of Reflect.ownKeys(value)) {
            if (array && key === 'length') continue;
            const property = Object.getOwnPropertyDescriptor(value, key);
            if (typeof key !== 'string' || !property.enumerable || !Object.hasOwn(property, 'value') ||
                ['__proto__', 'prototype', 'constructor'].includes(key) ||
                array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) {
                throw new TypeError(`${location} contains an unsupported data property: ${String(key)}`)
            }
            copy[key] = Chain.#copyData(property.value, ancestors, `${location}.${key}`)
        }
        ancestors.delete(value);
        if (array && Object.keys(copy).length !== value.length) throw new TypeError(`${location} must be a dense array`);
        return copy
    }

    /**
     * @summary Creates fresh handlers from already-loaded classes, cleaning partial registrations on failure.
     * @param {Object} [config={}]
     */
    construct(config = {}) {
        const descriptors = Chain.validateDescriptors(config.descriptors === undefined ? [] : config.descriptors);
        super.construct({...config, descriptors});
        const handlers = [];

        try {
            for (const descriptor of descriptors) {
                const cls = Chain.#registeredClass(descriptor.module ?? Neo.ns(descriptor.className));
                if (hooks.some(name => typeof cls.prototype[name] !== 'function')) {
                    throw new TypeError(`${descriptor.className} must implement the interceptor hooks`)
                }
                const {modulePath, ...options} = descriptor,
                      id                       = IdGenerator.getId('data-interceptor');
                try {
                    handlers.push(ClassSystemUtil.beforeSetInstance({...options, id}))
                } catch (error) {
                    Instance.get(id)?.destroy();
                    throw error
                }
            }
            this.#handlers = Object.freeze(handlers)
        } catch (error) {
            this.#handlers = Object.freeze(handlers);
            this.retire();
            throw error
        }
    }

    /** @summary The immutable declaration-order snapshot of owned handlers. @returns {ReadonlyArray<Neo.data.interceptor.Base>} */
    get handlers() {
        return this.#handlers
    }

    /**
     * @summary Retains before awaiting readiness, so concurrent retirement cannot destroy an admitted operation.
     * A rejected ready() retires the unusable chain. This consumes the class's ready() contract;
     * it cannot detect an initAsync rejection that the underlying class never forwards to ready().
     * @returns {Promise<{handlers: ReadonlyArray<Neo.data.interceptor.Base>, release: Function}>}
     */
    async acquire() {
        if (this.#retired || this.isDestroyed) throw new Error('Interceptor chain is retired');
        this.#leases++;
        const handlers = this.#handlers;
        let   released = false;
        const release  = () => {
            if (released) return;
            released = true;
            this.#leases--;
            if (this.#retired && this.#leases === 0) this.#dispose()
        };

        try {
            await Promise.all([this.ready(), ...handlers.map(handler => handler.ready())]);
            return {handlers, release}
        } catch (error) {
            this.retire();
            release();
            throw error
        }
    }

    /** @summary Refuses new leases and disposes the snapshot after the final admitted operation releases it. */
    retire() {
        if (this.#retired) return;
        this.#retired = true;
        if (this.#leases === 0) this.#dispose()
    }

    /** @summary Attempts every owned teardown once, then destroys this chain using Core Base's normal semantics. @private */
    #dispose() {
        if (this.#disposed) return;
        this.#disposed = true;
        const handlers = this.#handlers;
        this.#handlers = Object.freeze([]);
        let failure;
        for (const handler of handlers) {
            try { handler.destroy() } catch (error) { failure ??= error }
        }
        this.destroy();
        if (failure) throw failure
    }
}

export default Neo.setupClass(Chain);
