import Base   from '../../../../src/toolbar/Base.mjs';
import Button from '../../../../src/button/Base.mjs';

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
            module: Button,
            text  : 'Logo'
        }]
    }
}

Neo.applyClassConfig(HeaderToolbar);

export default HeaderToolbar;
