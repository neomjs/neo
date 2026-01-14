import Base from '../../../src/toolbar/Base.mjs';
import HeaderCanvas from './HeaderCanvas.mjs';

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
         * @member {Object[]} domListeners
         */
        domListeners: [{
            click     : 'onClick',
            mouseleave: 'onMouseLeave',
            mousemove : {fn: 'onMouseMove', local: true}
        }],
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            ntype: 'button',
            ui   : 'ghost'
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            cls     : ['logo'],
            iconCls : 'neo-logo-blue',
            minWidth: 60,
            route   : '/home',
            text    : 'Neo.mjs'
        }, '->', {
            text : 'Learn',
            route: '/learn'
        }, {
            bind     : {badgeText: 'blogPostCount'},
            reference: 'news-header-button',
            route    : '/news',
            text     : 'News'
        }, {
            route: '/examples',
            text : 'Examples'
        }, {
            route: '/services',
            text : 'Services'
        }, {
            ntype    : 'container',
            layout   : 'hbox',
            reference: 'header-social-icons',

            itemDefaults: {
                ntype: 'button',
                ui   : 'ghost'
            },

            items: [{
                iconCls: 'fa-brands fa-github',
                url    : 'https://github.com/neomjs/neo',
                tooltip: {
                    text     : 'GitHub',
                    showDelay: 0,
                    hideDelay: 0
                }
            }, {
                iconCls: 'fa-brands fa-slack',
                url    : 'https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA',
                tooltip: {
                    text     : 'Join Slack',
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

    /**
     * @param {Object} data
     */
    onClick(data) {
        this.getReference('header-canvas')?.onClick(data)
    }

    /**
     * @param {Object} data
     */
    onMouseLeave(data) {
        this.getReference('header-canvas')?.onMouseLeave(data)
    }

    /**
     * @param {Object} data
     */
    onMouseMove(data) {
        this.getReference('header-canvas')?.onMouseMove(data)
    }
}

export default Neo.setupClass(HeaderToolbar);
