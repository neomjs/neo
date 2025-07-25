import Base from '../../../src/toolbar/Base.mjs';

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
            text     : 'Blog',
            reference: 'blog-header-button',
            route    : '/blog'
        }, {
            text : 'Examples',
            route: '/examples'
        }, {
            text : 'Services',
            route: '/services'
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
        }]
    }
}

export default Neo.setupClass(HeaderToolbar);
