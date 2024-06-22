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
         * @member {String[]} cls=['learnneo-header-toolbar']
         */
        cls: ['learnneo-header-toolbar'],
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
            id      : 'neo-logo-button',
            minWidth: 60,
            iconCls : 'neo-logo-blue',
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
            text : 'Docs',
            route: '/docs'
        }, {
            ntype : 'container',
            layout: 'hbox',

            responsive: {
                medium: { cls: ['separate-bar'], layout: 'vbox' },
                large : { cls: ['inline'],       layout: 'hbox' }
            },

            itemDefaults: {
                ntype: 'button',
                ui   : 'ghost'
            },

            items: [{
                iconCls: 'fa-brands fa-github',
                url    : 'https://github.com/neomjs/neo',
                tooltip: {
                    html     : 'GitHub',
                    showDelay: '0',
                    hideDelay: '0'
                }
            }, {
                iconCls: 'fa-brands fa-slack',
                url    : 'https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA',
                tooltip: {
                    html     : 'Join Slack',
                    showDelay: '0',
                    hideDelay: '0'
                }
            }, {
                iconCls: 'fa-brands fa-discord',
                url    : 'https://discord.gg/6p8paPq',
                tooltip: {
                    html     : 'Join Discord',
                    showDelay: '0',
                    hideDelay: '0'
                }
            }]
        }]
    }
}

Neo.setupClass(HeaderToolbar);

export default HeaderToolbar;
