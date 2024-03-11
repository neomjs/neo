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
            recordIndex: data => data.selectedPageRecordIndex
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
                reference: 'prev-page-button',
                text     : 'Previous Page'
            }, '->', {
                reference: 'next-page-button',
                text     : 'Next Page'
            }]
        }],
        /**
         * @member {String|null} recordIndex_
         */
        recordIndex_: null
    }

    /**
     * Triggered after the recordIndex config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetRecordIndex(value, oldValue) {
        let me         = this,
            model      = me.getModel(),
            countPages = model.getData('countPages'),
            store      = model.getStore('contentTree'),
            i, nextRecord, prevRecord, record;

        // the logic assumes that the tree store is sorted
        for (i=value-1; i >= 0; i--) {
            record = store.getAt(i);

            if (record.isLeaf) {
                prevRecord = record;
                break
            }
        }

        if (prevRecord) {
            me.getReference('prev-page-button').text = prevRecord.name
        }

        // the logic assumes that the tree store is sorted
        for (i=value+1; i < countPages; i++) {
            record = store.getAt(i);

            if (record.isLeaf) {
                nextRecord = record;
                break
            }
        }

        if (nextRecord) {
            me.getReference('next-page-button').text = nextRecord.name
        }
    }
}

Neo.setupClass(PageContainer);

export default PageContainer;
