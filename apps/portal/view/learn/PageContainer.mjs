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
                hidden   : true,
                reference: 'prev-page-button'
            }, '->', {
                hidden   : true,
                reference: 'next-page-button'
            }]
        }],
        /**
         * @member {String|null} recordIndex_
         */
        recordIndex_: null
    }

    /**
     * Convenience shortcut
     * @member {Neo.button.Base} nextPageButton
     */
    get nextPageButton() {
        return this.getReference('next-page-button')
    }

    /**
     * Convenience shortcut
     * @member {Neo.button.Base} prevPageButton
     */
    get prevPageButton() {
        return this.getReference('prev-page-button')
    }

    /**
     * Triggered after the recordIndex config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetRecordIndex(value, oldValue) {
        if (oldValue !== undefined) {
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
                me.prevPageButton.set({hidden: false, text: prevRecord.name})
            } else {
                me.prevPageButton.hidden = true
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
                me.nextPageButton.set({hidden: false, text: nextRecord.name})
            } else {
                me.nextPageButton.hidden = true
            }
        }
    }
}

Neo.setupClass(PageContainer);

export default PageContainer;
