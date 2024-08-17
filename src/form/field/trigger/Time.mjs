import Clock  from '../../../component/Clock.mjs';
import Picker from './Picker.mjs';

/**
 * Used by form.field.Time
 * @class Neo.form.field.trigger.Time
 * @extends Neo.form.field.trigger.Picker
 */
class Time extends Picker {
    static config = {
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
         * @member {String[]} baseCls=['neo-timefield-trigger','neo-field-trigger']
         */
        baseCls: ['neo-timefield-trigger', 'neo-field-trigger'],
        /**
         * @member {Neo.component.Clock|null} clock=null
         * @protected
         */
        clock: null,
        /**
         * @member {Object|null} clockConfig=null
         */
        clockConfig: null,
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
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.clock = Neo.create({
            module  : Clock,
            appName : me.appName,
            fontSize: .6,
            parentId: me.id,
            showDisc: false,
            size    : null,
            ...me.clockConfig
        });

        me.vdom.cn = [me.clock.vdom];
        me.update()
    }

    /**
     * Triggered after the appName config got changed
     * @param {String} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAppName(value, oldValue) {
        super.afterSetAppName(value, oldValue);

        if (value) {
            this.clock.appName = value
        }
    }

    /**
     * Triggered after the value config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        if (value) {
            this.clock.time = value
        }
    }
}

export default Neo.setupClass(Time);
