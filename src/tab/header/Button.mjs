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
         * Specify a role tag attribute for the vdom root.
         * @member {String|null} role='tab'
         */
        role: 'tab',
        /**
         * @member {Boolean} useActiveTabIndicator_=true
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
     * Triggered after the pressed config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetPressed(value, oldValue) {
        super.afterSetPressed(value, oldValue);

        let me = this;

        if (value) {
            me.vdom['aria-selected'] = true
        } else {
            delete me.vdom['aria-selected']
        }

        me.update()
    }

    /**
     * Triggered after the useActiveTabIndicator config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseActiveTabIndicator(value, oldValue) {
        this.updateUseActiveTabIndicator();
    }

    /**
     * @param {Object} data
     */
    showRipple(data) {
        !this.pressed && super.showRipple(data);
    }

    /**
     * @param {Boolean} silent=false
     */
    updateUseActiveTabIndicator(silent=false) {
        let me   = this,
            vdom = me.vdom;

        vdom.cn[4].removeDom = !me.useActiveTabIndicator;

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }
}

Neo.applyClassConfig(Button);

export default Button;
