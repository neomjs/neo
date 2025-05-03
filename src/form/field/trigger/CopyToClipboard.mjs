import Base     from './Base.mjs';
import NeoArray from '../../../util/Array.mjs';

/**
 * Copy to clipboard Trigger to copy the input value of TextFields or subclasses to clipboard.
 * @class Neo.form.field.trigger.CopyToClipboard
 * @extends Neo.form.field.trigger.Base
 */
class CopyToClipboard extends Base {
    static config = {
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
         * @member {String[]} baseCls=['neo-field-trigger','neo-trigger-clipboard']
         */
        baseCls: ['neo-field-trigger', 'neo-trigger-clipboard'],
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
         * @member {String} type='copyToClipboard'
         * @protected
         */
        type: 'copyToClipboard',
        /**
         * @member {Number} weight_=21
         */
        weight: 21
    }

    /**
     * Triggered after the hidden config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetHidden(value, oldValue) {
        let {cls} = this;
        NeoArray[value? 'add' : 'remove'](cls, 'neo-is-hidden');
        this.cls = cls
    }

    /**
     * @returns {Boolean} true in case the trigger should be hidden
     */
    getHiddenState() {
        return !this.field.value || this.field.value.length === 0
    }

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

        me.hidden = me.getHiddenState()
    }

    /**
     * @param {Object} opts
     */
    onFieldChange(opts) {
        this.hidden = this.getHiddenState()
    }

    /**
     * @param {Object} data
     */
    onTriggerClick(data) {
        let me = this;

        Neo.main.DomAccess.selectNode({
            appName: me.appName,
            id     : me.field.getInputEl().id
        }).then(data => {
            Neo.main.DomAccess.execCommand({
                appName: me.appName,
                command: 'copy'
            })
        })
    }
}

export default Neo.setupClass(CopyToClipboard);
