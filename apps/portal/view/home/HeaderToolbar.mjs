import Base  from '../../../../src/toolbar/Base.mjs';
import Label from '../../../../src/component/Label.mjs';

/**
 * @class Portal.view.home.HeaderToolbar
 * @extends Neo.container.Base
 */
class HeaderToolbar extends Base {
    static config = {
        /**
         * @member {String} className='Portal.view.home.HeaderToolbar'
         * @protected
         */
        className: 'Portal.view.home.HeaderToolbar',
        /**
         * @member {String[]} cls=['learnneo-header-toolbar']
         */
        cls: ['learnneo-header-toolbar'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Label,
            cls   : ['logo'],
            text  : 'neo.mjs'
        }, '->', {
            text: 'Docs',
            ui  : 'ghost'
        }, {
            text: 'Learn',
            ui  : 'ghost'
        }, {
            cls    : ['github-button'],
            iconCls: 'fa-brands fa-github',
            ui     : 'ghost',
            url    : 'https://github.com/neomjs/neo',
            tooltip: {
                html: 'GitHub',
                showDelay: '0',
                hideDelay: '0'
            }
        }, {
            iconCls: 'fa-brands fa-slack',
            ui     : 'ghost',
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
