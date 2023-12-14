import Base  from '../../../src/toolbar/Base.mjs';
import Label from '../../../src/component/Label.mjs';

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
            cls  : ['logo'],
            route: '/home',
            text : 'neo.mjs'
        }, '->', {
            text : 'Learn',
            route: '/learn'
        }, {
            text     : 'Blog',
            reference: 'blog-header-button',
            route    : '/blog'
        }, {
            text: 'Docs'
        }, {
            cls    : ['github-button'],
            iconCls: 'fa-brands fa-github',
            url    : 'https://github.com/neomjs/neo',
            tooltip: {
                html: 'GitHub',
                showDelay: '0',
                hideDelay: '0'
            }
        }, {
            iconCls: 'fa-brands fa-slack',
            url    : 'https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA',
            tooltip: {
                html: 'Join Slack',
                showDelay: '0',
                hideDelay: '0'
            }
        }]
    }
}

Neo.applyClassConfig(HeaderToolbar);

export default HeaderToolbar;
