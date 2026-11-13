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
         * The id of the card this tab shows, rendered as `aria-controls`. `tab.Container` keeps it in
         * sync; `null` while the card is a lazy config that has not loaded yet.
         * @member {String|null} cardId_=null
         * @reactive
         */
        cardId_: null,
        /**
         * Opts this tab into pointer and Delete-key closing through its TabContainer.
         * @member {Boolean} closable_=false
         * @reactive
         */
        closable_: false,
        /**
         * The close mark's tooltip; the mark is hidden from the tab's accessible name.
         * @member {String} closeText_='Close tab'
         * @reactive
         */
        closeText_: 'Close tab',
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
        let me         = this,
            vdomConfig = super.getVdomConfig();

        vdomConfig.role             = me.role;
        vdomConfig['aria-selected'] = me.pressed === true;
        vdomConfig['aria-keyshortcuts'] = me.closable ? 'Delete' : null;

        if (me.cardId) {
            vdomConfig['aria-controls'] = me.cardId
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
        }, {
            tag          : 'span',
            cls          : ['neo-tab-close'],
            id           : `${this.id}__close`,
            text         : '×',
            title        : this.closeText,
            'aria-hidden': true,
            removeDom    : !this.closable
        });

        return children;
    }

    /**
     * @summary Identifies a close-mark click independently of generated header children.
     * @param {Object} data Serialized DOM event.
     * @returns {Boolean}
     */
    isCloseTarget(data) {
        return this.closable && data.path?.some(node => node.id === `${this.id}__close`)
    }

    /**
     * @summary Leaves close intent to the TabContainer without running button handlers, routes or ripples.
     * @param {Object} data Serialized DOM event.
     */
    onClick(data) {
        !this.isCloseTarget(data) && super.onClick(data)
    }

    /**
     * Keeps the generated indicator child in sync when the toolbar changes this config at runtime.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseActiveTabIndicator(value, oldValue) {
        this.updateUseActiveTabIndicator()
    }

    /**
     * Updates the generated indicator child.
     * @param {Boolean} [silent=false]
     */
    updateUseActiveTabIndicator(silent=false) {
        let indicator = this.vdom?.cn?.find(item => item.cls?.includes('neo-tab-button-indicator'));

        if (indicator) {
            indicator.removeDom = !this.useActiveTabIndicator;
            !silent && this.update()
        }
    }

    /**
     * @param {Object} data
     */
    showRipple(data) {
        !this.pressed && super.showRipple(data);
    }
}

export default Neo.setupClass(EffectTabButton);
