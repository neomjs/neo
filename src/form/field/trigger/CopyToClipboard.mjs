import Base     from './Base.mjs';
import NeoArray from '../../../util/Array.mjs';

/**
 * Copy to clipboard Trigger to copy the input value of TextFields or subclasses to clipboard.
 * @class Neo.form.field.trigger.CopyToClipboard
 * @extends Neo.form.field.trigger.Base
 */
class CopyToClipboard extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.field.trigger.CopyToClipboard'
         * @protected
         */
        className: 'Neo.form.field.trigger.CopyToClipboard',
        /**
         * @member {String} ntype='trigger-copytoclipboard'
         * @protected
         */
        ntype: 'trigger-copytoclipboard',
        /**
         * @member {String[]} cls=['neo-field-trigger', 'neo-trigger-clipboard']
         */
        cls: ['neo-field-trigger', 'neo-trigger-clipboard'],
        /**
         * @member {String|null} iconCls='fa fa-clipboard'
         */
        iconCls: 'fa fa-clipboard',
        /**
         * @member {Boolean} showOnHover=true
         */
        showOnHover: true,
        /**
         * Internal flag used by field.getTrigger()
         * @member {String} type='copytoclipboard'
         * @protected
         */
        type: 'copyToClipboard',
        /**
         * @member {Number} weight_=21
         */
        weight: 21
    }}

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.field.on({
            change     : me.onFieldChange,
            constructed: me.onFieldChange,
            scope      : me
        });

        me.hidden = me.getHiddenState();
    }

    /**
     * Triggered after the hidden config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetHidden(value) {
        let cls = this.cls;
        NeoArray[value? 'add' : 'remove'](cls, 'neo-is-hidden');
        this.cls = cls;
    }

    /**
     *
     * @returns {Boolean} true in case the trigger should be hidden
     */
    getHiddenState() {
        return !this.field.value || this.field.value.length === 0;
    }

    /**
     *
     * @param {Object} opts
     */
    onFieldChange(opts) {
        this.hidden = this.getHiddenState();
    }

    onTriggerClick(data) {
        Neo.main.DomAccess.selectNode({
            id: this.field.getInputEl().id
        }).then(function(data) {
            Neo.main.DomAccess.execCommand({
                command: 'copy'
            });
        });
    }
}

Neo.applyClassConfig(CopyToClipboard);

export {CopyToClipboard as default};