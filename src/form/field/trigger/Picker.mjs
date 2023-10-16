import Base from './Base.mjs';

/**
 * Used by form.field.Picker
 * @class Neo.form.field.trigger.Picker
 * @extends Neo.form.field.trigger.Base
 */
class Picker extends Base {
    static config = {
        /**
         * @member {String} className='Neo.form.field.trigger.Picker'
         * @protected
         */
        className: 'Neo.form.field.trigger.Picker',
        /**
         * @member {String} ntype='trigger-picker'
         * @protected
         */
        ntype: 'trigger-picker',
        /**
         * @member {String|null} iconCls='fa fa-caret-down'
         */
        iconCls: 'fa fa-caret-down',
        /**
         * Internal flag used by field.getTrigger()
         * @member {String} type='picker'
         * @protected
         */
        type: 'picker'
    }

    /**
     * @param {Object} data
     */
    onTriggerClick(data) {
        this.field.onPickerTriggerClick();
    }

    /**
     * @returns {Boolean} true in case the trigger should be hidden
     */
    getHiddenState() {
        return !this.field.editable;
    }    
}

Neo.applyClassConfig(Picker);

export default Picker;
