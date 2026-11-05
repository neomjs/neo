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
         * @member {String|null} role='button'
         * @reactive
         */
        role: 'button',
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {'aria-haspopup': 'dialog', 'aria-label': 'Choose Date'}
    }
}

export default Neo.setupClass(DateTrigger);
