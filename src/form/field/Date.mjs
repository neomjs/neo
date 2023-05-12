import DateSelector from '../../component/DateSelector.mjs'
import DateTrigger  from './trigger/Date.mjs'
import DateUtil     from '../../util/Date.mjs';
import Picker       from './Picker.mjs';
import VDomUtil     from '../../util/VDom.mjs';

/**
 * @class Neo.form.field.Date
 * @extends Neo.form.field.Picker
 */
class DateField extends Picker {
    static config = {
        /**
         * @member {String} className='Neo.form.field.Date'
         * @protected
         */
        className: 'Neo.form.field.Date',
        /**
         * @member {String} ntype='datefield'
         * @protected
         */
        ntype: 'datefield',
        /**
         * @member {String[]} baseCls=['neo-datefield','neo-pickerfield','neo-textfield']
         */
        baseCls: ['neo-datefield', 'neo-pickerfield', 'neo-textfield'],
        /**
         * @member {Neo.component.DateSelector|null} dateSelector=null
         * @protected
         */
        dateSelector: null,
        /**
         * @member {Object|null} dateSelectorConfig=null
         */
        dateSelectorConfig: null,
        /**
         * True to hide the DatePicker when selecting a day
         * @member {Boolean} hidePickerOnSelect=false
         */
        hidePickerOnSelect: false,
        /**
         * @member {String} inputType='date'
         */
        inputType: 'date',
        /**
         * @member {Number} pickerHeight=225
         */
        pickerHeight: 225,
        /**
         * @member {Number|null} pickerMaxHeight=225
         */
        pickerMaxHeight: 225,
        /**
         * @member {Number} pickerWidth=200
         */
        pickerWidth: 200,
        /**
         * @member {Object|Object[]} triggers=[{module: DateTrigger}]
         * @protected
         */
        triggers: [{
            module: DateTrigger
        }]
    }

    /**
     * Setting the value to true will return a Date object when calling getValue()
     * @member {Boolean} submitDateObject=false
     */
    submitDateObject = false

    /**
     * @param config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.dateSelector = Neo.create(DateSelector, {
            dayNameFormat: 'short',
            value        : me.value || DateUtil.convertToyyyymmdd(new Date()),
            ...me.dateSelectorConfig
        });

        me.dateSelector.keys._keys.push(
            {fn: 'onContainerKeyDownEscape', key: 'Escape', scope: me.id}
        );

        me.dateSelector.on({
            change: me.onDatePickerChange,
            scope : me
        });
    }

    /**
     * Triggered after the value config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);

        if (oldValue !== undefined) {
            this.dateSelector.value = value
        }
    }

    /**
     * @returns {Neo.component.DateSelector}
     */
    createPickerComponent() {
        return this.dateSelector;
    }

    /**
     * @returns {Date|String|null}
     */
    getValue() {
        let value = this.value;

        return this.submitDateObject && value ? new Date(`${value}T00:00:00.000Z`) : value
    }

    /**
     * @returns {Boolean}
     */
    hasContent() {
        if (this.labelPosition === 'inline') {
            return true;
        }

        return super.hasContent()
    }

    /**
     * @param {Object} data
     * @protected
     */
    onContainerKeyDownEscape(data) {
        let me = this;

        me.hidePicker();
        me.focus(me.getInputElId());
    }

    /**
     * @param {Object} opts
     */
    onDatePickerChange(opts) {
        let me   = this,
            vdom = me.vdom;

        if (me.hidePickerOnSelect) {
            VDomUtil.removeVdomChild(vdom, me.getPickerId());

            me.promiseVdomUpdate().then(data => {
                me.value = opts.value;
            });
        } else {
            me.value = opts.value;
        }
    }

    /**
     * @param {Object} data
     * @protected
     */
    onInputValueChange(data) {
        if (data.valid === true) {
            super.onInputValueChange(data)
        }
    }

    /**
     * @param {Object} data
     * @protected
     */
    onKeyDownEnter(data) {
        let me = this;

        if (me.pickerIsMounted) {
            me.dateSelector.focusCurrentItem();
            super.onKeyDownEnter(data);
        } else {
            super.onKeyDownEnter(data, me.dateSelector.focusCurrentItem, me.dateSelector);
        }
    }
}

Neo.applyClassConfig(DateField);

export default DateField;
