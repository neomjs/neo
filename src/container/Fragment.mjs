import Container from './Base.mjs';

/**
 * @class Neo.container.Fragment
 * @extends Neo.container.Base
 */
class Fragment extends Container {
    static config = {
        /**
         * @member {String} className='Neo.container.Fragment'
         * @protected
         */
        className: 'Neo.container.Fragment',
        /**
         * @member {String} ntype='fragment'
         * @protected
         */
        ntype: 'fragment',
        /**
         * @member {String[]|null} baseCls=null
         */
        baseCls: null,
        /**
         * @member {String[]|null} cls=null
         */
        cls: null,
        /**
         * Fragments cannot have layouts as they have no wrapper node.
         * @member {Object|String|null} layout=null
         */
        layout: null,
        /**
         * @member {String} tag='fragment'
         */
        tag: 'fragment'
    }

    /**
     * @param {String[]|null} value
     * @param {String[]|null} oldValue
     * @protected
     * @returns {null}
     */
    beforeSetCls(value, oldValue) {
        return null
    }

    /**
     * @param {Object|String|Neo.layout.Base} value
     * @param {Object|String|Neo.layout.Base} oldValue
     * @protected
     * @returns {null}
     */
    beforeSetLayout(value, oldValue) {
        return null
    }

    /**
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     * @returns {null}
     */
    beforeSetStyle(value, oldValue) {
        return null
    }

    /**
     * @param {String[]|null} value
     * @param {String[]|null} oldValue
     * @protected
     * @returns {null}
     */
    beforeSetWrapperCls(value, oldValue) {
        return null
    }

    /**
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     * @returns {null}
     */
    beforeSetWrapperStyle(value, oldValue) {
        return null
    }

    /**
     * Overriding createLayout to ensure it always returns null
     * @param {Object|String|Neo.layout.Base} value
     * @protected
     * @returns {null}
     */
    createLayout(value) {
        return null
    }
}

export default Neo.setupClass(Fragment);
