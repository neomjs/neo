import Base from '../component/Base.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * @class Neo.component.StatusBadge
 * @extends Neo.component.Base
 */
class StatusBadge extends Base {
    /**
     * Valid values for state
     * @member {String[]} states=['alert','error','info','neutral','success']
     * @protected
     * @static
     */
    static states = ['alert', 'error', 'info', 'neutral', 'success']

    static config = {
        /**
         * @member {String} className='Neo.component.StatusBadge'
         * @protected
         */
        className: 'Neo.component.StatusBadge',
        /**
         * @member {String} ntype='status-badge'
         * @protected
         */
        ntype: 'status-badge',
        /**
         * @member {String[]} baseCls=['neo-status-badge']
         * @protected
         */
        baseCls: ['neo-status-badge'],
        /**
         * @member {String} labelAlert_='Alert'
        */
        labelAlert_: 'Alert',
        /**
         * @member {String} labelError_='Error'
        */
        labelError_: 'Error',
        /**
         * @member {String} labelInfo_='Info'
        */
        labelInfo_: 'Info',
        /**
         * @member {String} labelNeutral_='Neutral'
        */
        labelNeutral_: 'Neutral',
        /**
         * @member {String} labelSuccess_='Success'
        */
        labelSuccess_: 'Success',


        /**
         * @member {String} state_='neutral'
         */
        state_: 'neutral',
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {
            tag: 'div', type: 'div', cn: [
                { tag: 'span', cls: ['neo-state-glyph'] },
                { tag: 'span', cls: ['neo-state-text'] },
                { tag: 'span', cls: ['neo-state-glyph'] }
            ]
        }
    }

    /**
     * Triggered after the labelAlert config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetLabelAlert(value, oldValue) {
        if (this.state === 'alert') {
            this.updateLabelNode(value);
        }
    }

    /**
     * Triggered after the labelError config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetLabelError(value, oldValue) {
        if (this.state === 'error') {
            this.updateLabelNode(value);
        }
    }

    /**
     * Triggered after the labelInfo config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetLabelInfo(value, oldValue) {
        if (this.state === 'info') {
            this.updateLabelNode(value);
        }
    }

    /**
     * Triggered after the labelNeutral config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetLabelNeutral(value, oldValue) {
        if (this.state === 'neutral') {
            this.updateLabelNode(value);
        }
    }

    /**
     * Triggered after the labelSuccess config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetLabelSuccess(value, oldValue) {
        if (this.state === 'success') {
            this.updateLabelNode(value);
        }
    }    

    /**
     * Triggered after the state config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetState(value, oldValue) {

        let cls = this.cls,
            me = this,
            isEmpty = !value || value === '',
            vdomRoot = me.getVdomRoot(),
            labelNode = vdomRoot.cn[1]

        NeoArray.remove(cls, 'neo-state-' + oldValue);
        NeoArray.add(cls, 'neo-state-' + value);

        this.cls = cls

        labelNode.removeDom = isEmpty;

        if (!isEmpty) {
            let showLabel = '';
            switch (value) {
                case 'alert':
                    showLabel = me.labelAlert;
                    break;
                case 'error':
                    showLabel = me.labelError;
                    break;
                case 'info':
                    showLabel = me.labelInfo;
                    break;
                case 'neutral':
                    showLabel = me.labelNeutral;
                    break;
                case 'success':
                    showLabel = me.labelSuccess;
                    break;
            }
            labelNode.innerHTML = showLabel;
        }

        me.update();
    }

    /**
     * Triggered before the state config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetState(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'state')
    }

    /**
     * Convenience shortcut
    * @returns {Object}
    */
    updateLabelNode(value) {
        let alertLabelNode = this.getVdomRoot().cn[1];

        alertLabelNode.innerHTML = value;
        alertLabelNode.removeDom = !Boolean(value);

        this.update();
    }

}

Neo.applyClassConfig(StatusBadge);

export default StatusBadge;
