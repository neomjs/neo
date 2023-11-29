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
            ui     : 'tertiary'
        }, {
            iconCls: 'fa-brands fa-slack',
            ui     : 'tertiary'
        }]
    }
}

Neo.applyClassConfig(HeaderToolbar);

export default HeaderToolbar;
