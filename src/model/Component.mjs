import Base        from '../core/Base.mjs';
import NeoFunction from '../util/Function.mjs';

/**
 * An optional component model for adding bindings to configs
 * @class Neo.model.Component
 * @extends Neo.core.Base
 */
class Component extends Base {
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
         * @member {Object|null} bindings_=null
         */
        bindings_: null,
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
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        me.bindings = {};

        NeoFunction.createSequence(me.owner, 'onConstructed', me.onComponentConstructed, me);
    }

    /**
     * Triggered after the data config got changed
     * @param {Object} value={}
     * @param {Object} oldValue={}
     * @protected
     */
    afterSetData(value={}, oldValue={}) {
        let data = this.data,
            descriptor, keyValue;

        Object.keys(value).forEach(key => {
            descriptor = Object.getOwnPropertyDescriptor(data, key);

            if (!(typeof descriptor === 'object' && typeof descriptor.set === 'function')) {
                keyValue = value[key];
                this.createDataProperty(key);
                data[key] = keyValue;
            }
        });
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
     *
     * @param {String} key
     */
    createDataProperty(key) {
        let me = this;

        Object.defineProperty(me.data, key, {
            get() {
                return me.data['_' + key];
            },

            set(value) {
                let oldValue = me.data['_' + key];

                me.data['_' + key] = value;

                if (value !== oldValue) {
                    me.onDataPropertyChange(key, value, oldValue);
                }
            }
        });
    }

    /**
     *
     * @param {String} key
     */
    getData(key) {
        // todo: check for parent VMs in case a prop does not exist
        return this.data[key];
    }

    /**
     *
     * @param {Neo.component.Base} [component=null]
     */
    onComponentConstructed(component=null) {
        console.log('onComponentConstructed', component);
    }

    /**
     *
     * @param {String} key
     * @param {*} value
     * @param {*} oldValue
     */
    onDataPropertyChange(key, value, oldValue) {
        console.log('onDataPropertyChange', key, value, oldValue);
    }

    /**
     *
     */
    resolveBindings() {
        console.log('resolveBindings');
    }

    /**
     *
     * @param {Object|String} key
     * @param {*} value
     */
    setData(key, value) {
        let me = this;

        // todo: check for parent VMs in case a prop does not exist
        // todo: create a data property in case no match is found

        if (Neo.isObject(key)) {
            Object.assign(me.data, key);
        } else {
            me.data[key] = value;
        }
    }
}

Neo.applyClassConfig(Component);

export {Component as default};