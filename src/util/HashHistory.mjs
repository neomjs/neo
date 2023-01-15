import Base       from '../core/Base.mjs';
import Observable from '../core/Observable.mjs';

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
        /**
         * @member {String} className='Neo.util.ClassSystem'
         * @protected
         */
        className: 'Neo.util.HashHistory',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Number} maxItems=50
         * @protected
         */
        maxItems: 50,
        /**
         * @member {Array} stack=[]
         * @protected
         */
        stack: []
    }}

    /**
     * @returns {Object}
     */
    first() {
        return this.stack[0];
    }

    /**
     * @returns {Number}
     */
    getCount() {
        return this.stack.length;
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Object} data.hash
     * @param {String} data.hashString
     */
    push(data) {
        let me    = this,
            stack = me.stack;

        stack.unshift(data);

        if (stack.length > me.maxItems) {
            stack.pop();
        }

        me.fire('change', data, stack[1] || null);
    }
}

export default Neo.applyClassConfig(HashHistory);
