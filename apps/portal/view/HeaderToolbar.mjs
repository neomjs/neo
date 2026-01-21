import Base from '../../../src/toolbar/Base.mjs';
import HeaderCanvas from './HeaderCanvas.mjs';
import HeaderToolbarController from './HeaderToolbarController.mjs';

/**
 * @class Portal.view.HeaderToolbar
 * @extends Neo.container.Base
 */
class HeaderToolbar extends Base {
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
         * @member {Neo.controller.Component} controller=HeaderToolbarController
         */
        controller: HeaderToolbarController,
        /**
         * @member {Object[]} domListeners
         */
        domListeners: [{
            click     : 'onButtonClick',
            mouseleave: 'onMouseLeave',
            mousemove : {fn: 'onMouseMove', local: true}
        }, {
            mouseenter: 'onButtonMouseEnter',
            mouseleave: 'onButtonMouseLeave',
            delegate  : '.neo-button'
        }],
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            handler: 'onButtonClick',
            ntype  : 'button',
            ui     : 'ghost'
        },
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
        }, {
            module   : HeaderCanvas,
            reference: 'header-canvas'
        }],
        /**
         * @member {Object} style={position: 'relative'}
         */
        style: {position: 'relative'}
    }
}

export default Neo.setupClass(HeaderToolbar);
