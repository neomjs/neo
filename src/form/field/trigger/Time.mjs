import Clock  from '../../../component/Clock.mjs';
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
         * @member {String[]} cls=['neo-timefield-trigger','neo-field-trigger']
         */
        cls: ['neo-timefield-trigger', 'neo-field-trigger'],
        /**
         * @member {Neo.component.Clock|null} clock=null
         */
        clock: null,
        /**
         * @member {String|null} iconCls=null
         */
        iconCls: null,
        /**
         * Internal flag used by field.getTrigger()
         * @member {String} type='time'
         */
        type: 'time',
        /**
         * Format: hh:mm
         * @member {String|null} value_=null
         */
        value_: null
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me   = this,
            vdom = me.vdom;

        me.clock = Neo.create({
            module  : Clock,
            appName : me.appName,
            parentId: me.id,
            fontSize: .6,
            size    : null
        });

        vdom.cn = [me.clock.vdom];
        me.vdom = vdom;
    }

    /**
     * Triggered after the value config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        if (value) {
            this.clock.time = value;
        }
    }
}

Neo.applyClassConfig(Time);

export {Time as default};
