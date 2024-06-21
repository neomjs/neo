import Base from './Base.mjs';

/**
 * Combines spin up & down inside one trigger
 * @class Neo.form.field.trigger.SpinUpDown
 * @extends Neo.form.field.trigger.Base
 */
class SpinUpDown extends Base {
    static config = {
        /**
         * @member {String} className='Neo.form.field.trigger.SpinUpDown'
         * @protected
         */
        className: 'Neo.form.field.trigger.SpinUpDown',
        /**
         * @member {String} ntype='trigger-spinupdown'
         * @protected
         */
        ntype: 'trigger-spinupdown',
        /**
         * @member {String[]} baseCls=['neo-field-trigger','neo-spin-buttons']
         */
        baseCls: ['neo-field-trigger', 'neo-spin-buttons'],
        /**
         * @member {String} spinButtonDownIconCls='fa fa-chevron-down'
         */
        spinButtonDownIconCls: 'fa fa-chevron-down',
        /**
         * @member {String} spinButtonUpIconCls='fa fa-chevron-up'
         */
        spinButtonUpIconCls: 'fa fa-chevron-up',
        /**
         * Internal flag used by field.getTrigger()
         * @member {String} type='spinupdown'
         * @protected
         */
        type: 'spinupdown'
    }

    /**
     *
     */
    onConstructed() {
        let me = this;

        me.vdom.cn = [
            {cls: ['neo-spin-button', 'neo-up',   me.spinButtonUpIconCls]},
            {cls: ['neo-spin-button', 'neo-down', me.spinButtonDownIconCls]}
        ];

        me.update();

        super.onConstructed()
    }

    /**
     * @param {Object} data
     */
    onTriggerClick(data) {
        let me     = this,
            target = data.path[0],
            cls    = target.cls.join(' ');

        if (cls.includes('neo-down')) {
            me.field.onSpinButtonDownClick()
        } else if (cls.includes('neo-up')) {
            me.field.onSpinButtonUpClick()
        }
    }
}

Neo.setupClass(SpinUpDown);

export default SpinUpDown;
