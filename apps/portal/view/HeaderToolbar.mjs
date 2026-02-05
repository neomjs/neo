import BaseHeaderToolbar from '../../../src/app/header/Toolbar.mjs';

/**
 * @class Portal.view.HeaderToolbar
 * @extends Neo.app.header.Toolbar
 */
class HeaderToolbar extends BaseHeaderToolbar {
    static config = {
        /**
         * @member {String} className='Portal.view.HeaderToolbar'
         * @protected
         */
        className: 'Portal.view.HeaderToolbar',
        /**
         * @member {String[]} cls=['portal-header-toolbar']
         * @reactive
         */
        cls: ['portal-header-toolbar'],
        /**
         * @member {Object[]} items
         */
        items: [{
            cls     : ['logo'],
            iconCls : 'neo-logo-blue',
            minWidth: 60,
            reference: 'home-button',
            route   : '/home',
            text    : 'Neo.mjs'
        }, '->', {
            reference: 'learn-button',
            text     : 'Learn',
            route    : '/learn'
        }, {
            bind     : {badgeText: 'blogPostCount'},
            reference: 'news-header-button',
            route    : '/news',
            text     : 'News'
        }, {
            reference: 'examples-button',
            route    : '/examples',
            text     : 'Examples'
        }, {
            reference: 'services-button',
            route    : '/services',
            text     : 'Services'
        }, {
            ntype    : 'container',
            layout   : 'hbox',
            reference: 'header-social-icons',

            itemDefaults: {
                handler: 'onButtonClick',
                ntype  : 'button',
                ui     : 'ghost'
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
            }]
        }]
    }
}

export default Neo.setupClass(HeaderToolbar);
