import Toolbar from '../../../src/app/header/Toolbar.mjs';

/**
 * @class DevIndex.view.HeaderToolbar
 * @extends Neo.app.header.Toolbar
 */
class HeaderToolbar extends Toolbar {
    static config = {
        /**
         * @member {String} className='DevIndex.view.HeaderToolbar'
         * @protected
         */
        className: 'DevIndex.view.HeaderToolbar',
        /**
         * @member {Boolean} animateVisuals_=true
         * @reactive
         */
        animateVisuals_: true,
        /**
         * @member {Object} bind
         */
        bind: {
            animateVisuals: data => !data.slowHeaderVisuals,
            isScrolling   : data => data.isScrolling
        },
        /**
         * @member {String[]} cls=['devindex-header-toolbar']
         * @reactive
         */
        cls: ['devindex-header-toolbar'],
        /**
         * @member {Boolean} isScrolling_=false
         * @reactive
         */
        isScrolling_: false,
        /**
         * @member {Object[]} items
         */
        items: [{
            cls     : ['logo'],
            iconCls : 'neo-logo-blue',
            minWidth: 60,
            reference: 'home-button',
            route   : '/home',
            text    : 'DevIndex'
        }, '->', {
            reference: 'learn-button',
            route    : '/learn',
            text     : 'Learn'
        }, {
            ntype    : 'container',
            layout   : 'hbox',
            reference: 'header-social-icons',

            itemDefaults: {
                ntype: 'button',
                ui   : 'ghost'
            },

            items: [{
                handler: 'onSwitchTheme',
                iconCls: 'fa-solid fa-moon',
                reference: 'theme-switch-button',
                tooltip: {
                    text     : 'Switch Theme',
                    showDelay: 0,
                    hideDelay: 0
                }
            }, {
                iconCls: 'fa-brands fa-github',
                url    : 'https://github.com/neomjs/neo',
                tooltip: {
                    text     : 'GitHub',
                    showDelay: 0,
                    hideDelay: 0
                }
            }, {
                iconCls: 'fa-brands fa-discord',
                url    : 'https://discord.gg/6p8paPq',
                tooltip: {
                    text     : 'Join Discord',
                    showDelay: 0,
                    hideDelay: 0
                }
            }, {
                handler  : 'onControlsToggleButtonClick',
                iconCls  : 'fas fa-bars',
                reference: 'controls-toggle-button',
                tooltip  : {
                    text     : 'Toggle Controls',
                    showDelay: 0,
                    hideDelay: 0
                }
            }]
        }]
    }
    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetAnimateVisuals(value, oldValue) {
        if (value !== undefined) {
            this.getReference('header-canvas')?.renderer?.updateConfig({usePulse: value})
        }
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetIsScrolling(value, oldValue) {
        if (value !== undefined) {
            this.getReference('header-canvas')?.renderer?.updateTimeScale({value: value ? 2 : 1})
        }
    }
}

export default Neo.setupClass(HeaderToolbar);
