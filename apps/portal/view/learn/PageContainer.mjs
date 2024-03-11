import Container   from '../../../../src/container/Base.mjs';
import ContentView from './ContentView.mjs';
import Toolbar     from '../../../../src/toolbar/Base.mjs';

/**
 * @class Portal.view.learn.PageContainer
 * @extends Neo.container.Base
 */
class PageContainer extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.PageContainer'
         * @protected
         */
        className: 'Portal.view.learn.PageContainer',
        /**
         * @member {String[]} baseCls=['learn-content-container','neo-container']
         * @protected
         */
        baseCls: ['learn-content-container', 'neo-container'],
        /**
         * @member {Object} bind
         */
        bind: {
            recordId: data => data.selectedPageRecordId
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : ContentView,
            reference: 'content',
            listeners: {
                edit   : 'onContentEdit',
                refresh: 'onContentRefresh'
            }
        }, {
            module: Toolbar,
            items : [{
                reference: 'previous-page',
                text     : 'Previous Page'
            }, '->', {
                reference: 'next-page',
                text     : 'Next Page'
            }]
        }],
        /**
         * @member {String|null} recordId_
         */
        recordId_: null
    }

    /**
     * Triggered after the recordId config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetRecordId(value, oldValue) {
        let me    = this,
            store = me.getModel().getStore('contentTree');

        console.log('afterSetRecordId', value, store);
    }
}

Neo.setupClass(PageContainer);

export default PageContainer;
