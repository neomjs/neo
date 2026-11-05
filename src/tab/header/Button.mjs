import BaseButton from '../../button/Base.mjs';

/**
 * @class Neo.tab.header.Button
 * @extends Neo.button.Base
 */
class Button extends BaseButton {
    static config = {
        /**
         * @member {String} className='Neo.tab.header.Button'
         * @protected
         */
        className: 'Neo.tab.header.Button',
        /**
         * @member {String} ntype='tab-header-button'
         * @protected
         */
        ntype: 'tab-header-button',
        /**
         * @member {String[]} baseCls=['neo-button','neo-tab-button']
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
         * Specify a role tag attribute for the vdom root.
         * @member {String|null} role='tab'
         * @reactive
         */
        role: 'tab',
        /**
         * @member {Boolean} useActiveTabIndicator_=true
         * @reactive
         */
        useActiveTabIndicator_: true,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'button', cn: [
            {tag: 'span', cls: ['neo-button-glyph']},
            {tag: 'span', cls: ['neo-button-text']},
            {cls: ['neo-button-badge']},
            {cls: ['neo-button-ripple-wrapper'], cn: [
                    {cls: ['neo-button-ripple']}
                ]},
            {cls: ['neo-tab-button-indicator']}
        ]}
    }

    /**
     * Triggered after the cardId config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetCardId(value, oldValue) {
        this.changeVdomRootKey('aria-controls', value)
    }

    /**
     * Triggered after the pressed config got changed. Every tab states its selection, so an
     * inactive tab reads `aria-selected="false"` rather than nothing.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetPressed(value, oldValue) {
        super.afterSetPressed(value, oldValue);

        let me = this;

        me.vdom['aria-selected'] = value;

        me.update()
    }

    /**
     * Triggered after the useActiveTabIndicator config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseActiveTabIndicator(value, oldValue) {
        this.updateUseActiveTabIndicator()
    }

    /**
     * @param {Object} data
     */
    showRipple(data) {
        !this.pressed && super.showRipple(data)
    }

    /**
     * @param {Boolean} silent=false
     */
    updateUseActiveTabIndicator(silent=false) {
        let me = this;

        me.vdom.cn[4].removeDom = !me.useActiveTabIndicator;
        !silent && me.update()
    }
}

export default Neo.setupClass(Button);
