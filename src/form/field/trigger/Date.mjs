import Picker from './Picker.mjs';

/**
 * used by form.field.Date
 * @class Neo.form.field.trigger.Date
 * @extends Neo.form.field.trigger.Picker
 */
class DateTrigger extends Picker {
    static config = {
        /**
         * @member {String} className='Neo.form.field.trigger.Date'
         * @protected
         */
        className: 'Neo.form.field.trigger.Date',
        /**
         * @member {String} ntype='trigger-date'
         * @protected
         */
        ntype: 'trigger-date',
        /**
         * @member {String|null} iconCls='fa fa-calendar-alt'
         * @reactive
         */
        iconCls: 'fa fa-calendar-alt',
        /**
         * @member {Object} keys
         */
        keys: {
            Enter: 'onTriggerKeyDown',
            Space: 'onTriggerKeyDown'
        },
        /**
         * @member {String|null} role='button'
         * @reactive
         */
        role: 'button',
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {'aria-haspopup': 'dialog', 'aria-label': 'Choose Date', tabIndex: 0}
    }

    /**
     * @summary Links the trigger into the owning field's logical component hierarchy so focus movement between input and trigger stays inside the field.
     * @param {Neo.form.field.Base|null} value
     * @param {Neo.form.field.Base|null} oldValue
     * @protected
     */
    afterSetField(value, oldValue) {
        super.afterSetField(value, oldValue);
        this.parentComponent = value
    }

    /**
     * @summary Activates the date trigger on Enter or Space without bubbling to the owning field.
     * @param {Object} data
     * @protected
     */
    onTriggerKeyDown(data) {
        data.cancelBubble = true;
        this.onTriggerClick(data)
    }
}

export default Neo.setupClass(DateTrigger);
