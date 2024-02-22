import Base       from '../core/Base.mjs';
import Observable from '../core/Observable.mjs';

/**
 * @class Neo.util.HashHistory
 * @extends Neo.core.Base
 * @singleton
 */
class HashHistory extends Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
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
    }

    /**
     * @returns {Object}
     */
    first() {
        return this.stack[0] || null
    }

    /**
     * @returns {Number}
     */
    getCount() {
        return this.stack.length
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

        if (stack[0]?.hashString !== data.hashString) {
            stack.unshift(data);

            if (stack.length > me.maxItems) {
                stack.pop()
            }

            me.fire('change', data, stack[1] || null)
        }
    }

    /**
     * @returns {Object}
     */
    second() {
        return this.stack[1] || null
    }
}

let instance = Neo.setupClass(HashHistory);

export default instance;
