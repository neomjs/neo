import DateSelector from '../../component/DateSelector.mjs'
import DateTrigger  from './trigger/Date.mjs'
import DateUtil     from '../../util/Date.mjs';
import Picker       from './Picker.mjs';

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
         * @member {String} errorTextInvalidDate='Not a valid date'
         */
        errorTextInvalidDate: 'Not a valid date',
        /**
         * @member {Boolean} isoDate=false
         */
        isoDate: false,
        /**
         * True to hide the DatePicker when selecting a day
         * @member {Boolean} hidePickerOnSelect=false
         */
        hidePickerOnSelect: false,
        /**
         * @member {String} inputType='date'
         * @reactive
         */
        inputType: 'date',
        /**
         * @member {String|null} maxValue_=null
         * @reactive
         */
        maxValue_: null,
        /**
         * @member {String|null} minValue_=null
         * @reactive
         */
        minValue_: null,
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
         * @reactive
         */
        triggers: [{
            module: DateTrigger
        }]
    }

    /**
     * Internal flag to store the dom based validity of this field
     * @member {Boolean} invalidInput=false
     */
    invalidInput = false
    /**
     * Setting the value to true will return a Date object when calling getSubmitValue()
     * @member {Boolean} submitDateObject=false
     */
    submitDateObject = false

    /**
     * @param config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.dateSelector = Neo.create({
            module       : DateSelector,
            dayNameFormat: 'short',
            maxValue     : me.maxValue,
            minValue     : me.minValue,
            value        : me.value || DateUtil.convertToyyyymmdd(new Date()),
            ...me.dateSelectorConfig
        });

        me.dateSelector.keys._keys.push(
            {fn: 'onContainerKeyDownEscape', key: 'Escape', scope: me.id}
        );

        me.dateSelector.on({
            change: me.onDatePickerChange,
            scope : me
        })
    }

    /**
     * Triggered after the maxValue config got changed
     * @param {Text} value
     * @param {Text} oldValue
     * @protected
     */
    afterSetMaxValue(value, oldValue) {
        let me = this;

        me.changeInputElKey('max', value);

        if (me.dateSelector) {
            me.dateSelector.maxValue = value
        }
    }

    /**
     * Triggered after the minValue config got changed
     * @param {Text} value
     * @param {Text} oldValue
     * @protected
     */
    afterSetMinValue(value, oldValue) {
        let me = this;

        me.changeInputElKey('min', value);

        if (me.dateSelector) {
            me.dateSelector.minValue = value
        }
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
     * Triggered before the value config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetValue(value, oldValue) {
        if (Neo.typeOf(value) === 'Date') {
            value = DateUtil.convertToyyyymmdd(value);
            this.originalConfig.value = value
        }

        value = super.beforeSetValue(value, oldValue);

        return (this.isoDate && value) ? value.substring(0, 10) : value
    }

    /**
     * @summary Configures the floating date picker container with non-modal WAI-ARIA dialog semantics and delegates initial focus to the active calendar day cell.
     * @returns {Neo.container.Base}
     */
    createPicker() {
        let me     = this,
            picker = super.createPicker(),
            {vdom} = picker;

        picker.focusOnMount = false;
        vdom['aria-label']  = vdom['aria-label'] || 'Choose Date';
        vdom.role           = 'dialog';

        picker.on('mounted', me.onPickerMounted, me);

        return picker
    }

    /**
     * @returns {Neo.component.DateSelector}
     */
    createPickerComponent() {
        return this.dateSelector
    }

    /**
     * @returns {Date|String|null}
     */
    getSubmitValue() {
        let value = this.value;

        if(this.submitDateObject && value) {
            return new Date(`${value}T12:00:00.000Z`);
        } else if(this.isoDate && value) {
            return new Date(value).toISOString();
        }

        return value;
    }

    /**
     * @returns {Boolean}
     */
    hasContent() {
        if (this.labelPosition === 'inline') {
            return true
        }

        return super.hasContent()
    }

    /**
     * @summary Annotates the date input element with WAI-ARIA dialog popup and expansion state attributes.
     */
    onConstructed() {
        let me      = this,
            inputEl = me.getInputEl();

        inputEl['aria-controls'] = me.getPickerId();
        inputEl['aria-expanded'] = false;
        inputEl['aria-haspopup'] = 'dialog';

        super.onConstructed(...arguments)
    }

    /**
     * @param {Object} data
     * @protected
     */
    onContainerKeyDownEscape(data) {
        let me = this;

        me.hidePicker();
        me.focus(me.getInputElId())
    }

    /**
     * @summary Propagates the committed date and delegates optional dismissal to the floating picker's owner.
     * @param {Object} opts
     */
    onDatePickerChange(opts) {
        let me = this;

        me.clean = false;

        me.hidePickerOnSelect && me.hidePicker();
        me.value = opts.value
    }

    /**
     * @param {Object} data
     * @protected
     */
    onInputValueChange(data) {
        this.invalidInput = !data.valid;

        if (data.valid) {
            super.onInputValueChange(data)
        } else {
            this.validate(false)
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
            super.onKeyDownEnter(data)
        } else {
            super.onKeyDownEnter(data, me.dateSelector.focusCurrentItem, me.dateSelector)
        }
    }

    /**
     * @summary Synchronizes the input element's `aria-expanded` state when the date picker opens or closes.
     * @param {Object} data
     * @protected
     */
    onPickerHiddenChange(data) {
        super.onPickerHiddenChange(data);

        this.getInputEl()['aria-expanded'] = !data.value;
        this.update()
    }

    /**
     * @summary Moves focus to the active or selected day cell inside the DateSelector when the floating picker mounts.
     * @protected
     */
    onPickerMounted() {
        this.dateSelector?.focusCurrentItem()
    }

    /**
     * Serializes the field into a JSON-compatible object.
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            ...super.toJSON(),
            dateSelector      : me.dateSelector?.toJSON(),
            dateSelectorConfig: me.serializeConfig(me.dateSelectorConfig),
            hidePickerOnSelect: me.hidePickerOnSelect,
            isoDate           : me.isoDate,
            maxValue          : me.maxValue,
            minValue          : me.minValue,
            submitDateObject  : me.submitDateObject
        }
    }

    /**
     * Checks for client-side field errors
     * @param {Boolean} silent=true
     * @returns {Boolean} Returns true in case there are no client-side errors
     */
    validate(silent=true) {
        let me          = this,
            returnValue = super.validate(silent);

        if (returnValue) {
            if (me.invalidInput) {
                me._error = me.errorTextInvalidDate;
                returnValue = false
            }
        }

        !returnValue && !me.clean && me.updateError(me._error, silent);

        return returnValue
    }
}

export default Neo.setupClass(DateField);
