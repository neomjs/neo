import {isDescriptor, mergeFrom} from '../../../../../src/core/ConfigSymbols.mjs';
import Component                 from './Component.mjs';
import Container                 from '../../../../../src/container/Base.mjs';
import Toolbar                   from '../../../../../src/toolbar/Base.mjs';

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
         * @member {String} buttonTextField='name'
         */
        buttonTextField: 'name',
        /**
         * @member {Object} contentConfig_
         * @reactive
         */
        contentConfig_: {
            [isDescriptor]: true,
            merge         : 'deep',
            value         : {
                module: Component
            }
        },
        /**
         * @member {Object} items
         */
        items: {
            [isDescriptor]: true,
            clone         : 'deep',
            merge         : 'deep',
            value         : {
                content: {
                    [mergeFrom]: 'contentConfig',
                    reference  : 'content',
                    weight     : 10,
                    listeners  : {
                        edit   : 'onContentEdit',
                        refresh: 'onContentRefresh'
                    }
                },
                toolbar: {
                    module: Toolbar,
                    flex  : 'none',
                    cls   : ['content-bottom-toolbar'],
                    layout: 'grid',
                    tag   : 'nav',
                    weight: 20,
                    items : {
                        'prev-page-button': {
                            cls      : ['content-bottom-toolbar-previous'],
                            handler  : 'onPreviousPageButtonClick',
                            hidden   : true,
                            iconCls  : 'fa fa-chevron-left',
                            reference: 'prev-page-button',
                            ui       : 'secondary'
                        },
                        'next-page-button': {
                            cls         : ['content-bottom-toolbar-next'],
                            handler     : 'onNextPageButtonClick',
                            hidden      : true,
                            iconCls     : 'fa fa-chevron-right',
                            iconPosition: 'right',
                            reference   : 'next-page-button',
                            ui          : 'secondary'
                        }
                    }
                }
            }
        },
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
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        if (me.nextPageRecord) {
            me.afterSetNextPageRecord(me.nextPageRecord)
        }

        if (me.previousPageRecord) {
            me.afterSetPreviousPageRecord(me.previousPageRecord)
        }
    }

    /**
     * Triggered after the nextPageRecord config got changed
     * @param {Object} value
     * @param {Object} [oldValue]
     */
    afterSetNextPageRecord(value, oldValue) {
        let me = this;

        if (me.nextPageButton) {
            if (value) {
                me.nextPageButton.set({hidden: false, text: value[me.buttonTextField]})
            } else {
                me.nextPageButton.hidden = true
            }
        }
    }

    /**
     * Triggered after the previousPageRecord config got changed
     * @param {Object} value
     * @param {Object} [oldValue]
     */
    afterSetPreviousPageRecord(value, oldValue) {
        let me = this;

        if (me.prevPageButton) {
            if (value) {
                me.prevPageButton.set({hidden: false, text: value[me.buttonTextField]})
            } else {
                me.prevPageButton.hidden = true
            }
        }
    }
}

export default Neo.setupClass(PageContainer);