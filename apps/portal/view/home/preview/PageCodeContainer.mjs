import Container   from '../../../../../src/container/Base.mjs';
import LivePreview from '../../../../../src/code/LivePreview.mjs';

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
        /**
         * @member {String} ntype='page-code-container'
         * @protected
         */
        ntype: 'page-code-container',
        /**
         * @member {String[]} cls=['page-code-container']
         * @protected
         */
        cls: ['page-code-container'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch',pack:'center'}
         */
        layout: {ntype: 'vbox', align: 'stretch', pack: 'center'},
        /**
         * @member {Object[]} items
         */
        items : [{
            module: LivePreview,
            cls   : ['live-preview']
        }],
        /**
         * @member {String|null} value_=null
         */
        value_: null,
    }

    /**
     * Triggered after the size config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        this.items[0].value = value
    }
}

Neo.setupClass(PageCodeContainer);

export default PageCodeContainer;
