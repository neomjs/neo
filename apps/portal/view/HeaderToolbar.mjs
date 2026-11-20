import BaseHeaderToolbar from '../../../src/app/header/Toolbar.mjs';

/**
 * @summary Portal top navigation bar keeping the logo, four section links, and Theme/GitHub/Discord actions on one 58px row across desktop and phone viewports.
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
            ariaLabel: 'Neo.mjs Home',
            // Keep `x-small` (`Viewport#getSize` <= 640px) aligned with `@media (max-width: 640px)` in HeaderToolbar.css
            bind     : {text: data => data.size === 'x-small' ? null : 'Neo.mjs'},
            cls      : ['logo'],
            iconCls  : 'neo-logo-blue',
            reference: 'home-button',
            route    : '/'
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
            text     : 'Connect'
        }, {
            cls      : ['portal-header-actions'],
            ntype    : 'container',
            layout   : 'hbox',
            reference: 'header-social-icons',

            itemDefaults: {
                handler: 'onButtonClick',
                ntype  : 'button',
                ui     : 'ghost'
            },

            items: [{
                ariaLabel: 'Switch Theme',
                handler  : 'onSwitchTheme',
                iconCls  : 'fa-solid fa-moon',
                reference: 'theme-switch-button',
                tooltip  : {
                    text     : 'Switch Theme',
                    showDelay: 0
                }
            }, {
                ariaLabel: 'GitHub',
                iconCls  : 'fa-brands fa-github',
                reference: 'github-header-button',
                url      : 'https://github.com/neomjs/neo',
                tooltip  : {
                    text     : 'GitHub',
                    showDelay: 0
                }
            }, {
                ariaLabel: 'Join Discord',
                iconCls  : 'fa-brands fa-discord',
                reference: 'discord-header-button',
                url      : 'https://discord.gg/6p8paPq',
                tooltip  : {
                    text     : 'Join Discord',
                    showDelay: 0
                }
            }]
        }]
    }
}

export default Neo.setupClass(HeaderToolbar);
