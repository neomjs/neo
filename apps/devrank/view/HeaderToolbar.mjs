import Toolbar from '../../../src/app/header/Toolbar.mjs';

/**
 * @class DevRank.view.HeaderToolbar
 * @extends Neo.app.header.Toolbar
 */
class HeaderToolbar extends Toolbar {
    static config = {
        /**
         * @member {String} className='DevRank.view.HeaderToolbar'
         * @protected
         */
        className: 'DevRank.view.HeaderToolbar',
        /**
         * @member {String[]} cls=['devrank-header-toolbar']
         * @reactive
         */
        cls: ['devrank-header-toolbar'],
        /**
         * @member {Object[]} items
         */
        items: [{
            cls     : ['logo'],
            iconCls : 'neo-logo-blue',
            minWidth: 60,
            reference: 'home-button',
            route   : '/home',
            text    : 'DevRank'
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
}

export default Neo.setupClass(HeaderToolbar);
