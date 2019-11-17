import Button from '../component/Button.mjs';

/**
 * @class Neo.tab.HeaderButton
 * @extends Neo.container.Toolbar
 */
class HeaderButton extends Button {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.tab.HeaderButton'
         * @private
         */
        className: 'Neo.tab.HeaderButton',
        /**
         * @member {String} ntype='tab-header-button'
         * @private
         */
        ntype: 'tab-header-button',
        /**
         * @member {Array} cls=['neo-button', 'neo-tab-button']
         */
        cls: ['neo-tab-header-button', 'neo-button'],
        /**
         * @member {Boolean} useActiveTabIndicator_=true
         */
        useActiveTabIndicator_: true,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            tag: 'button',
            cn : [{
                tag: 'span',
                cls: ['neo-button-glyph']
            }, {
                tag: 'span',
                cls: ['neo-button-text']
            }, {
                cls: ['neo-tab-button-indicator']
            }]
        }
    }}

    /**
     * Tiggered after the useActiveTabIndicator config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @private
     */
    afterSetUseActiveTabIndicator(value, oldValue) {
        this.updateUseActiveTabIndicator();
    }

    /**
     *
     * @param {Boolean} [silent=false]
     */
    updateUseActiveTabIndicator(silent=false) {
        let me   = this,
            vdom = me.vdom;

        vdom.cn[2].removeDom = !me.useActiveTabIndicator;

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }
}

Neo.applyClassConfig(HeaderButton);

export {HeaderButton as default};