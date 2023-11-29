import Base  from '../../../../src/toolbar/Base.mjs';
import Label from '../../../../src/component/Label.mjs';

/**
 * @class LearnNeo.view.home.HeaderToolbar
 * @extends Neo.container.Base
 */
class HeaderToolbar extends Base {
    static config = {
        /**
         * @member {String} className='LearnNeo.view.home.HeaderToolbar'
         * @protected
         */
        className: 'LearnNeo.view.home.HeaderToolbar',
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
            ui  : 'tertiary'
        }, {
            text: 'Learn',
            ui  : 'tertiary'
        }, {
            cls    : ['github-button'],
            iconCls: 'fa-brands fa-github',
            ui     : 'tertiary',
            url    : 'https://github.com/neomjs/neo'
        }, {
            iconCls: 'fa-brands fa-slack',
            ui     : 'tertiary',
            url    : 'https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA'
        }]
    }
}

Neo.applyClassConfig(HeaderToolbar);

export default HeaderToolbar;
