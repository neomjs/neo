import Base from '../core/Base.mjs';

/**
 * @class Neo.util.HashHistory
 * @extends Neo.core.Base
 * @singleton
 */
class HashHistory extends Base {
    static getStaticConfig() {return {
        /**
         * True automatically applies the core/Observable.mjs mixin
         * @member {Boolean} observable=true
         * @static
         */
        observable: true
    }}

    static getConfig() {return {
        className: 'Neo.util.HashHistory',
        ntype    : 'hash-history',
        singleton: true,
        stack    : []
    }}

    first() {
        return this.stack[0];
    }

    getCount() {
        return this.stack.length;
    }

    push(hash, hashString) {
        let me = this;

        me.stack.unshift(hash);
        me.fire('change', hash, me.stack[1], hashString);
    }
}

Neo.applyClassConfig(HashHistory);

let instance = Neo.create(HashHistory);

Neo.applyToGlobalNs(instance);

export default instance;