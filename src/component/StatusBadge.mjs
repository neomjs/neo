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
        labelNeutal_: 'Neutral',
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
                    showLabel = me.labelNeutal;
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
}

Neo.applyClassConfig(StatusBadge);

export default StatusBadge;
