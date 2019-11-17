import Base from './Base.mjs';

/**
 * Increases the value of a NumberField
 * @class Neo.form.field.trigger.SpinUp
 * @extends Neo.form.field.trigger.Base
 */
class SpinUp extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.field.trigger.SpinUp'
         * @private
         */
        className: 'Neo.form.field.trigger.SpinUp',
        /**
         * @member {String} ntype='trigger-spinup'
         * @private
         */
        ntype: 'trigger-spinup',
        /**
         * @member {String|null} iconCls='fa fa-chevron-right'
         */
        iconCls: 'fa fa-chevron-right',
        /**
         * Internal flag used by field.getTrigger()
         * @member {String} type='spinup'
         * @private
         */
        type: 'spinup'
    }}

    onTriggerClick(data) {
        this.field.onSpinButtonUpClick();
    }
}

Neo.applyClassConfig(SpinUp);

export {SpinUp as default};