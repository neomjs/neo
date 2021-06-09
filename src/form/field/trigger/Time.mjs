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
         * @member {Neo.component.Clock|null} clock=null
         */
        clock: null
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
            size    : null
        });

        vdom.cn = [me.clock.vdom];
        me.vdom = vdom;
    }
}

Neo.applyClassConfig(Time);

export {Time as default};
