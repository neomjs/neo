import Container   from '../../../../../src/container/Base.mjs';
import LivePreview from '../../learn/LivePreview.mjs';

/**
 * @class Portal.view.home.preview.PageCodeContainer
 * @extends Neo.container.Base
 */
class PageCodeContainer extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.home.preview.PageCodeContainer'
         * @protected
         */
        className: 'Portal.view.home.preview.PageCodeContainer',

        ntype: 'page-code-container',
        cls: ['page-code-container'],

        value_    : null,

        /**
         * @member {Object[]} items
         */

        layout: {ntype: 'vbox', align: 'stretch', pack: 'center'},
        items : [{
            module: LivePreview,
            cls   : ['live-preview']
        }]
    }

    afterSetValue(newValue) {
        this.items[0].value = newValue;
    }
}

Neo.setupClass(PageCodeContainer);

export default PageCodeContainer;
