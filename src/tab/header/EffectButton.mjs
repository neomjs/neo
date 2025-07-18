import EffectButton from '../../button/Effect.mjs';

/**
 * @class Neo.tab.header.EffectButton
 * @extends Neo.button.Effect
 */
class EffectTabButton extends EffectButton {
    static config = {
        /**
         * @member {String} className='Neo.tab.header.EffectButton'
         * @protected
         */
        className: 'Neo.tab.header.EffectButton',
        /**
         * @member {String} ntype='tab-header-effect-button'
         * @protected
         */
        ntype: 'tab-header-effect-button',
        /**
         * @member {String[]} baseCls=['neo-tab-header-button', 'neo-button']
         */
        baseCls: ['neo-tab-header-button', 'neo-button'],
        /**
         * Specify a role tag attribute for the vdom root.
         * @member {String|null} role='tab'
         * @reactive
         */
        role: 'tab',
        /**
         * @member {Boolean} useActiveTabIndicator_=true
         * @reactive
         */
        useActiveTabIndicator_: true
    }

    /**
     * Builds the top-level VDOM object.
     * @returns {Object}
     * @protected
     */
    getVdomConfig() {
        let vdomConfig = super.getVdomConfig();

        vdomConfig.role = this.role;

        if (this.pressed) {
            vdomConfig['aria-selected'] = true;
        }

        return vdomConfig;
    }

    /**
     * Builds the array of child nodes (the 'cn' property).
     * @returns {Object[]}
     * @protected
     */
    getVdomChildren() {
        let children = super.getVdomChildren();

        children.push({
            cls      : ['neo-tab-button-indicator'],
            removeDom: !this.useActiveTabIndicator
        });

        return children;
    }

    /**
     * @param {Object} data
     */
    showRipple(data) {
        !this.pressed && super.showRipple(data);
    }
}

export default Neo.setupClass(EffectTabButton);
