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
            nextPageRecord    : data => data.nextPageRecord,
            previousPageRecord: data => data.previousPageRecord
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
                handler  : 'onPreviousPageButtonClick',
                hidden   : true,
                reference: 'prev-page-button'
            }, '->', {
                handler  : 'onNextPageButtonClick',
                hidden   : true,
                reference: 'next-page-button'
            }]
        }],
        /**
         * @member {Object} nextPageRecord_=null
         */
        nextPageRecord_: null,
        /**
         * @member {Object} previousPageRecord_=null
         */
        previousPageRecord_: null
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
     * Triggered after the nextPageRecord config got changed
     * @param {Object} value
     * @param {Object} oldValue
     */
    afterSetNextPageRecord(value, oldValue) {
        if (oldValue !== undefined) {
            if (value) {
                this.nextPageButton.set({hidden: false, text: value.name})
            } else {
                this.nextPageButton.hidden = true
            }
        }
    }

    /**
     * Triggered after the previousPageRecord config got changed
     * @param {Object} value
     * @param {Object} oldValue
     */
    afterSetPreviousPageRecord(value, oldValue) {
        if (oldValue !== undefined) {
            if (value) {
                this.prevPageButton.set({hidden: false, text: value.name})
            } else {
                this.prevPageButton.hidden = true
            }
        }
    }
}

Neo.setupClass(PageContainer);

export default PageContainer;
