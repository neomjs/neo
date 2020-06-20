import Picker from './Picker.mjs';

/**
 * used by form.field.Date
 * @class Neo.form.field.trigger.Date
 * @extends Neo.form.field.trigger.Picker
 */
class Date extends Picker {
    static getConfig() {return {
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
         */
        iconCls: 'fa fa-calendar-alt'
    }}
}

Neo.applyClassConfig(Date);

export {Date as default};