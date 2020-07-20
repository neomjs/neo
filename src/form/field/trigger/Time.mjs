import Picker from './Picker.mjs';

/**
 * Used by form.field.Time
 * @class Neo.form.field.trigger.Time
 * @extends Neo.form.field.trigger.Picker
 */
class Time extends Picker {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.field.trigger.Time'
         * @protected
         */
        className: 'Neo.form.field.trigger.Time',
        /**
         * @member {String} ntype='trigger-time'
         * @protected
         */
        ntype: 'trigger-time',
        /**
         * @member {String|null} iconCls='fa fa-clock'
         */
        iconCls: 'fa fa-clock'
    }}
}

Neo.applyClassConfig(Time);

export {Time as default};