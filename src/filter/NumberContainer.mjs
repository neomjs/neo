import Container             from '../container/Base.mjs';
import Number                from '../form/field/Number.mjs';
import ToggleOperatorsButton from './ToggleOperatorsButton.mjs';

/**
 * @class Neo.filter.NumberContainer
 * @extends Neo.container.Base
 */
class NumberContainer extends Container {
    static config = {
        /**
         * @member {String} className='Neo.filter.NumberContainer'
         * @protected
         */
        className: 'Neo.filter.NumberContainer',
        /**
         * @member {String} ntype='filter-numbercontainer'
         * @protected
         */
        ntype: 'filter-numbercontainer',
        /**
         * @member {String[]} baseCls=['neo-filter-numbercontainer']
         */
        baseCls: ['neo-filter-numbercontainer'],
        /**
         * Pass config to the ToggleOperatorsButton
         * @member {Object|null} buttonConfig=null
         */
        buttonConfig: null,
        /**
         * @member {Neo.form.field.Base} fieldModule=Number
         */
        fieldModule: Number,
        /**
         * @member {Object} layout={ntype: 'hbox', align: 'stretch'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * Pass config to the Number Field
         * @member {Object|null} fieldConfig=null
         */
        fieldConfig: null,
        /**
         * @member {String|null} operator_=null
         * @reactive
         */
        operator_: null,
        /**
         * @member {Boolean|null} value_=null
         * @reactive
         */
        value_: null
    }

    /**
     * Triggered after the operator config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetOperator(value, oldValue) {
        this.projectChildValue(0, value);
        if (oldValue !== undefined) {
            this.fire('operatorChange', {
                component: this,
                oldValue,
                value
            })
        }
    }

    /**
     * Triggered after the value config got changed
     * @param {Boolean|null} value
     * @param {Boolean|null} oldValue
     */
    afterSetValue(value, oldValue) {
        this.projectChildValue(1, value);
        if (oldValue !== undefined) {
            this.fire('change', {
                component: this,
                oldValue,
                value
            })
        }
    }

    /**
     * @summary Paints the composite's public value into its child without echoing a second input event.
     * @param {Number} index
     * @param {*} value
     */
    projectChildValue(index, value) {
        const child = this.items?.[index];
        if (child?.isConstructed) {
            const suspended = child.suspendEvents;
            child.suspendEvents = true;
            try {
                child.value = value
            } finally {
                child.suspendEvents = suspended
            }
        }
    }

    /**
     *
     */
    createItems() {
        let me = this;

        me.items = [{
            module   : ToggleOperatorsButton,
            flex     : 'none',
            listeners: {change: me.onOperatorChange, scope: me},
            value    : me.operator,
            ...me.buttonConfig
        }, {
            module   : me.fieldModule,
            flex     : '1 1 auto',
            hideLabel: true,
            listeners: {change: me.onValueChange, scope: me},
            value    : me.value,
            ...me.fieldConfig
        }];

        super.createItems()
    }

    /**
     * @param {Object} data
     */
    onOperatorChange(data) {
        this.operator = data.component.value
    }

    /**
     * @param {Object} data
     */
    onValueChange(data) {
        this.value = data.component.value
    }
}

export default Neo.setupClass(NumberContainer);
