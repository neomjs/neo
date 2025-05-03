import Base       from '../core/Base.mjs';
import Observable from '../core/Observable.mjs';

/**
 * @class Neo.util.HashHistory
 * @extends Neo.core.Base
 * @singleton
 */
class HashHistory extends Base {
    /**
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='Neo.util.HashHistory'
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
         * Storing one stack per windowId
         * @member {Object} stacks={}
         * @protected
         */
        stacks: {}
    }

    /**
     * Convenience shortcut
     * @param {Number} [windowId]
     * @returns {Object}
     */
    first(windowId) {
        return this.getAt(0, windowId)
    }

    /**
     * @param {Number} index
     * @param {Number} [windowId]
     * @returns {Number}
     */
    getAt(index, windowId) {
        return this.getStack(windowId)[index]
    }

    /**
     * @param {Number} [windowId]
     * @returns {Number}
     */
    getCount(windowId) {
        return this.getStack(windowId).length
    }

    /**
     * @param {Number} [windowId]
     * @returns {Number}
     */
    getStack(windowId) {
        let me       = this,
            {stacks} = me,
            stackId  = windowId || Object.keys(stacks)[0],
            stack    = stacks[stackId];

        if (!stack) {
            stacks[stackId] = stack = []
        }

        return stack
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Object} data.hash
     * @param {String} data.hashString
     * @param {Number} data.windowId
     */
    push(data) {
        let me         = this,
            {windowId} = data,
            stack      = me.getStack(windowId);

        if (stack[0]?.hashString !== data.hashString) {
            delete data[windowId];
            stack.unshift(data);

            if (stack.length > me.maxItems) {
                stack.pop()
            }

            me.fire('change', data, stack[1] || null)
        }
    }

    /**
     * Convenience shortcut
     * @param {Number} [windowId]
     * @returns {Object}
     */
    second(windowId) {
        return this.getAt(0, windowId)
    }
}

export default Neo.setupClass(HashHistory);
