import Base from '../core/Base.mjs';

/**
 * An optional component model for adding bindings to configs
 * @class Neo.model.Component
 * @extends Neo.core.Base
 */
class Component extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.model.Component'
         * @protected
         */
        className: 'Neo.model.Component',
        /**
         * @member {String} ntype='component-model'
         * @protected
         */
        ntype: 'component-model',
        /**
         * @member {Object|null} data_=null
         */
        data_: null,
        /**
         * @member {Neo.component.Base|null} owner=null
         */
        owner: null
    }}

    /**
     * Triggered after the data config got changed
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetData(value, oldValue) {
        console.log('afterSetData', value, oldValue);
    }

    /**
     * Triggered when accessing the data config
     * @param {Object} value
     * @protected
     */
    beforeGetData(value) {
        return value || {};
    }

    /**
     * Triggered before the data config gets changed
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    beforeSetData(value, oldValue) {
        console.log('beforeSetData', value, oldValue);
        return value;
    }
}

Neo.applyClassConfig(Component);

export {Component as default};