import Component from './Component.mjs';
import Container from '../../../../../src/container/Base.mjs';
import Toolbar   from '../../../../../src/toolbar/Base.mjs';

/**
 * @class Portal.view.shared.content.PageContainer
 * @extends Neo.container.Base
 */
class PageContainer extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.shared.content.PageContainer'
         * @protected
         */
        className: 'Portal.view.shared.content.PageContainer',
        /**
         * @member {String[]} baseCls=['portal-shared-content-page-container','neo-container']
         * @protected
         */
        baseCls: ['portal-shared-content-page-container', 'neo-container'],
        /**
         * @member {Object} bind
         */
        bind: {
            nextPageRecord    : data => data.nextPageRecord,
            previousPageRecord: data => data.previousPageRecord
        },
        /**
         * @member {Neo.component.Base|null} contentComponent=null
         */
        contentComponent: null,
        /**
         * @member {Object} nextPageRecord_=null
         * @reactive
         */
        nextPageRecord_: null,
        /**
         * @member {Object} previousPageRecord_=null
         * @reactive
         */
        previousPageRecord_: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        let me = this;

        config.items = [{
            module   : me.contentComponent || config.contentComponent || Component,
            reference: 'content',
            listeners: {
                edit   : 'onContentEdit',
                refresh: 'onContentRefresh'
            }
        }, {
            module: Toolbar,
            flex  : 'none',
            cls   : ['content-bottom-toolbar'],
            layout: 'grid',
            tag   : 'nav',
            items : [{
                cls      : ['content-bottom-toolbar-previous'],
                handler  : 'onPreviousPageButtonClick',
                hidden   : true,
                iconCls  : 'fa fa-chevron-left',
                reference: 'prev-page-button',
                ui       : 'secondary'
            }, {
                cls         : ['content-bottom-toolbar-next'],
                handler     : 'onNextPageButtonClick',
                hidden      : true,
                iconCls     : 'fa fa-chevron-right',
                iconPosition: 'right',
                reference   : 'next-page-button',
                ui          : 'secondary'
            }]
        }];

        super.construct(config)
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

export default Neo.setupClass(PageContainer);