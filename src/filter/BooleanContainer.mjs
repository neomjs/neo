import Container from '../container/Base.mjs';
import Radio     from '../form/field/Radio.mjs';

/**
 * @class Neo.filter.BooleanContainer
 * @extends Neo.container.Base
 */
class BooleanContainer extends Container {
    static config = {
        /**
         * @member {String} className='Neo.filter.BooleanContainer'
         * @protected
         */
        className: 'Neo.filter.BooleanContainer',
        /**
         * @member {String} ntype='filter-booleancontainer'
         * @protected
         */
        ntype: 'filter-booleancontainer',
        /**
         * @member {String[]} baseCls=['neo-filter-booleancontainer']
         */
        baseCls: ['neo-filter-booleancontainer'],
        /**
         * @member {Object} layout={ntype: 'hbox', align: 'center'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'center'},
        /**
         * Pass config to the Radio Fields
         * @member {Object|null} radioConfig=null
         */
        radioConfig: null,
        /**
         * @member {Boolean|null} value_=null
         * @reactive
         */
        value_: null
    }

    /**
     * Triggered after the value config got changed
     * @param {Boolean|null} value
     * @param {Boolean|null} oldValue
     */
    afterSetValue(value, oldValue) {
        if (oldValue !== undefined) {
            this.fire('change', {
                component: this,
                oldValue,
                value
            })
        }
    }

    /**
     *
     */
    createItems() {
        let me = this;

        const defaults = {
            module        : Radio,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onRadioChange, scope: me},
            name          : me.id
        };

        me.items = [{
            ...defaults,
            checked   : me.value === true,
            fieldValue: true,
            valueLabel: {tag: 'i', cls: ['fa', 'fa-check']},
            ...me.radioConfig
        }, {
            ...defaults,
            checked   : me.value === false,
            fieldValue: false,
            valueLabel: {tag: 'i', cls: ['fa', 'fa-times']},
            ...me.radioConfig
        }, {
            ...defaults,
            checked   : me.value === null,
            fieldValue: null,
            valueLabel: [{tag: 'i', cls: ['fa', 'fa-check']}, {tag: 'i', cls: ['fa', 'fa-times'], style: {marginLeft: '5px'}}],
            ...me.radioConfig
        }];

        super.createItems()
    }

    /**
     * @param {Object} data
     */
    onRadioChange(data) {
        if (data.value) {
            this.value = data.component.fieldValue
        }
    }
}

export default Neo.setupClass(BooleanContainer);
