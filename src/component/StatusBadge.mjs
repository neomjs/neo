import Base     from '../component/Base.mjs';
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
         * @member {String[]} currentStateIcon=null
         */
        currentStateIcon: null,
        /**
         * @member {String[]} currentSideIcon=null
         */
        currentSideIcon: null,
        /**
         * false calls Neo.Main.setRoute()
         * @member {Boolean} deactivateStateIcons=false
         */
        deactivateStateIcons_: false,
        /**
         * false calls Neo.Main.setRoute()
         * @member {Boolean} deactivateSideIcons=false
         */
        deactivateSideIcons_: false,
        /**
         * @member {String} iconAlert='fa-triangle-exclamation'
         */
        iconAlert_: 'fa fa-triangle-exclamation',
        /**
         * @member {String} iconError='fa-xmark'
         */
        iconError_: 'fa fa-xmark',
        /**
         * @member {String} iconInfo='fa-info'
         */
        iconInfo_: 'fa fa-info',
        /**
         * @member {String} iconNeutral='fa-circle'
         */
        iconNeutral_: 'fa fa-circle',
        /**
         * @member {String} iconSuccess='fa-check'
         */
        iconSuccess_: 'fa fa-check',
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
         * @member {String} sideIconAlert='fa fa-registered'
         */
        sideIconAlert_: 'fa fa-registered',
        /**
         * @member {String} sideIconError='fa fa-registered'
         */
        sideIconError_: 'fa fa-registered',
        /**
         * @member {String} sideIconInfo='fa fa-registered'
         */
        sideIconInfo_: 'fa fa-registered',
        /**
         * @member {String} sideIconNeutral='fa fa-registered'
         */
        sideIconNeutral_: 'fa fa-registered',
        /**
         * @member {String} sideIconSuccess='fa fa-registered'
         */
        sideIconSuccess_: 'fa fa-registered',
        /**
         * @member {String} state_='neutral'
         */
        state_: 'neutral',
        /**
         * @member {Object} _vdom
         */
        _vdom:
            {
                type: 'div', cn: [
                    {tag: 'span', cls: ['neo-state-glyph']},
                    {tag: 'span', cls: ['neo-state-text']},
                    {tag: 'span', cls: ['neo-state-glyph']}
                ]
            }
    }

    /**
     * Triggered after the deactivateStateIcons config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetDeactivateStateIcons(value, oldValue) {
        this.updateStateIconNode(this.currentStateIcon)
    }

    /**
     * Triggered after the deactivateSideIcons config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetDeactivateSideIcons(value, oldValue) {
        this.updateSideIconNode(this.currentSideIcon)
    }

    /**
     * Triggered after the StateIcon config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetSideIcon(value, oldValue) {
        this.updateSideIconNode(value, oldValue)
    }

    /**
     * Triggered after the iconAlert config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetIconAlert(value, oldValue) {
        if (this.state === 'alert') {
            this.updateStateIconNode(value)
        }
    }

    /**
     * Triggered after the iconError config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetIconError(value, oldValue) {
        if (this.state === 'error') {
            this.updateStateIconNode(value)
        }
    }

    /**
     * Triggered after the iconInfo config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetIconInfo(value, oldValue) {
        if (this.state === 'info') {
            this.updateStateIconNode(value)
        }
    }

    /**
     * Triggered after the iconNeutral config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetIconNeutral(value, oldValue) {
        if (this.state === 'neutral') {
            this.updateStateIconNode(value)
        }
    }

    /**
     * Triggered after the sideIconSuccess config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetSideIconSuccess(value, oldValue) {
        if (this.state === 'success') {
            this.updateSideIconNode(value)
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
            this.updateLabelNode(value)
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
            this.updateLabelNode(value)
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
            this.updateLabelNode(value)
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
            this.updateLabelNode(value)
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
            this.updateLabelNode(value)
        }
    }


    /**
     * Triggered after the state config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetState(value, oldValue) {

        let me        = this,
            cls       = me.cls,
            isEmpty   = !value || value === '',
            vdomRoot  = me.getVdomRoot(),
            labelNode = vdomRoot.cn[1];

        NeoArray.remove(cls, 'neo-state-' + oldValue);
        NeoArray.add(cls, 'neo-state-' + value);

        me.cls = cls;

        labelNode.removeDom = isEmpty;

        if (!isEmpty) {
            let showLabel     = '';
            let showStateIcon = '';
            let showSideIcon  = '';

            switch (value) {
                case 'alert':
                    showLabel     = me.labelAlert;
                    showStateIcon = me.iconAlert;
                    showSideIcon  = me.sideIconAlert;
                    break;
                case 'error':
                    showLabel     = me.labelError;
                    showStateIcon = me.iconError;
                    showSideIcon  = me.sideIconError;
                    break;
                case 'info':
                    showLabel     = me.labelInfo;
                    showStateIcon = me.iconInfo;
                    showSideIcon  = me.sideIconInfo;
                    break;
                case 'neutral':
                    showLabel     = me.labelNeutral;
                    showStateIcon = me.iconNeutral;
                    showSideIcon  = me.sideIconNeutral;
                    break;
                case 'success':
                    showLabel     = me.labelSuccess;
                    showStateIcon = me.iconSuccess;
                    showSideIcon  = me.sideIconSuccess;
                    break;
            }

            labelNode.innerHTML = showLabel;

            me.updateStateIconNode(showStateIcon);
            me.updateSideIconNode(showSideIcon);
        }

        me.update()
    }

    /**
     * Triggered after the StateIcon config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetStateIcon(value, oldValue) {
        this.updateStateIconNode(value, oldValue)
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
    getSideIconNode() {
        return this.getVdomRoot().cn[2]
    }

    /**
     * Convenience shortcut
     * @returns {Object}
     */
    getStateIconNode() {
        return this.getVdomRoot().cn[0]
    }

    /**
     * Convenience shortcut
     * @returns {Object}
     */
    updateLabelNode(value) {
        let labelNode = this.getVdomRoot().cn[1];

        labelNode.innerHTML = value;
        labelNode.removeDom = !Boolean(value);

        this.update()
    }

    /**
     * Convenience shortcut
     * @returns {Object}
     */
    updateSideIconNode(value) {
        let me           = this,
            iconNode     = me.getSideIconNode(),
            currentValue = me.currentSideIcon;

        if (value && !Array.isArray(value)) {
            value = value.split(' ').filter(Boolean)
        }

        if (currentValue && !Array.isArray(currentValue)) {
            currentValue = value.split(' ').filter(Boolean)
        }

        NeoArray.remove(iconNode.cls, currentValue);
        NeoArray.add(iconNode.cls, value);

        iconNode.removeDom = !value || value === '' || me.deactivateSideIcons;

        me.currentSideIcon = value;
        me.update()
    }

    /**
     * Convenience shortcut
     * @returns {Object}
     */
    updateStateIconNode(value) {
        let me           = this,
            iconNode     = me.getStateIconNode(),
            currentValue = me.currentStateIcon;

        if (value && !Array.isArray(value)) {
            value = value.split(' ').filter(Boolean)
        }

        if (currentValue && !Array.isArray(currentValue)) {
            currentValue = value.split(' ').filter(Boolean)
        }

        NeoArray.remove(iconNode.cls, currentValue);
        NeoArray.add(iconNode.cls, value);

        iconNode.removeDom = !value || value === '' || me.deactivateStateIcons;

        me.currentStateIcon = value;
        me.update()
    }

}

Neo.setupClass(StatusBadge);

export default StatusBadge;
