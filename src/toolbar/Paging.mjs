import ClassSystemUtil from '../util/ClassSystem.mjs';
import SelectField     from '../form/field/Select.mjs';
import Toolbar         from './Base.mjs';

/**
 * @class Neo.toolbar.Paging
 * @extends Neo.toolbar.Base
 */
class Paging extends Toolbar {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.toolbar.Paging'
         * @protected
         */
        className: 'Neo.toolbar.Paging',
        /**
         * @member {String} ntype='paging-toolbar'
         * @protected
         */
        ntype: 'paging-toolbar',
        /**
         * @member {String[]} cls=['neo-paging-toolbar','neo-toolbar']
         */
        cls: ['neo-paging-toolbar', 'neo-toolbar'],
        /**
         * @member {Number} currentPage_=1
         */
        currentPage_: 1,
        /**
         * @member {Number} pageSize_=30
         */
        pageSize_: 30,
        /**
         * @member {Function} pagesText_=me=>`Page: ${me.page} / ${me.getMaxPages()}`
         */
        pagesText_: me => `Page ${me.currentPage} / ${me.getMaxPages()}`,
        /**
         * @member {Neo.data.Store|null} store_=null
         */
        store_: null,
        /**
         * @member {Function} totalText_=count=>`Total: ${count} records`
         */
        totalText_: count => `Total: ${count} rows`
    }}

    /**
     * @param config
     */
    construct(config) {
        super.construct(config);
        this.createToolbarItems();
    }

    /**
     * Triggered after the currentPage config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetCurrentPage(value, oldValue) {
        if (oldValue) {
            this.store.currentPage = value;
        }
    }

    /**
     * Triggered after the pageSize config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetPageSize(value, oldValue) {
        if (oldValue) {
            this._currentPage = 1; // silent update
            this.store.pageSize = value;
        }
    }

    /**
     * Triggered after the pagesText config got changed
     * @param {Function} value
     * @param {Function} oldValue
     * @protected
     */
    afterSetPagesText(value, oldValue) {
        oldValue && this.updatePagesText();
    }

    /**
     * Triggered after the totalText config got changed
     * @param {Function} value
     * @param {Function} oldValue
     * @protected
     */
    afterSetTotalText(value, oldValue) {
        oldValue && this.updateTotalText();
    }

    /**
     * Triggered before the store config gets changed.
     * @param {Neo.data.Store|Object|null} value
     * @param {Neo.data.Store|null} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        let listeners = {
            load : this.onStoreLoad,
            scope: this
        };

        oldValue?.un(listeners);

        return ClassSystemUtil.beforeSetInstance(value, null, {listeners});
    }

    /**
     *
     */
    createToolbarItems() {
        let me = this;

        me.items = [{
            handler  : me.onFirstPageButtonClick.bind(me),
            iconCls  : 'fa fa-angles-left',
            reference: 'nav-button-first'
        }, {
            handler  : me.onPrevPageButtonClick.bind(me),
            iconCls  : 'fa fa-angle-left',
            reference: 'nav-button-prev',
            style    : {marginLeft: '2px'}
        }, {
            ntype    : 'label',
            reference: 'pages-text',
            style    : {marginLeft: '10px'},
            text     : me.pagesText(me)
        }, {
            handler  : me.onNextPageButtonClick.bind(me),
            iconCls  : 'fa fa-angle-right',
            reference: 'nav-button-next',
            style    : {marginLeft: '10px'}
        }, {
            handler  : me.onLastPageButtonClick.bind(me),
            iconCls  : 'fa fa-angles-right',
            reference: 'nav-button-last',
            style    : {marginLeft: '2px'}
        }, {
            ntype: 'label',
            style: {marginLeft: '50px'},
            text : 'Rows per page:'
        }, {
            module       : SelectField,
            clearable    : false,
            hideLabel    : true,
            listConfig   : {highlightFilterValue: false},
            listeners    : {change: me.onPageSizeFieldChange.bind(me)},
            style        : {margin: 0},
            triggerAction: 'all',
            useFilter    : false,
            value        : 30,
            width        : 70,

            store: {
                model: {
                    fields: [
                        {name: 'id',   type: 'Integer'},
                        {name: 'name', type: 'Integer'}
                    ]
                },
                data: [
                    {id: 1, name:  10},
                    {id: 2, name:  20},
                    {id: 3, name:  30},
                    {id: 4, name:  50},
                    {id: 5, name: 100}
                ]
            }
        }, '->', {
            ntype    : 'label',
            reference: 'total-text',
            text     : me.totalText(me.store.totalCount)
        }];
    }

    /**
     * @returns {Number}
     */
    getMaxPages() {
        return Math.ceil(this.store.totalCount / this.pageSize);
    }

    /**
     *
     */
    onFirstPageButtonClick() {
        this.currentPage = 1;
    }

    /**
     *
     */
    onLastPageButtonClick() {
        this.currentPage = this.getMaxPages();
    }

    /**
     *
     */
    onNextPageButtonClick() {
        let me = this;

        if (me.currentPage < me.getMaxPages()) {
            me.currentPage++;
        }
    }

    /**
     * @param {Object} data
     */
    onPageSizeFieldChange(data) {
        this.pageSize = data.value;
    }

    /**
     *
     */
    onPrevPageButtonClick() {
        if (this.currentPage > 1) {
            this.currentPage--;
        }
    }

    /**
     *
     */
    onStoreLoad() {
        let me = this;

        me.currentPage = me.store.currentPage;

        me.updateNavigationButtons();
        me.updatePagesText();
        me.updateTotalText();
    }

    /**
     *
     */
    updateNavigationButtons() {
        let me          = this,
            currentPage = me.currentPage,
            maxPages    = me.getMaxPages();

        me.down({reference: 'nav-button-first'}).disabled = currentPage === 1;
        me.down({reference: 'nav-button-prev'}) .disabled = currentPage === 1;
        me.down({reference: 'nav-button-next'}) .disabled = currentPage === maxPages;
        me.down({reference: 'nav-button-last'}) .disabled = currentPage === maxPages;
    }

    /**
     *
     */
    updatePagesText() {
        let me = this;

        me.down({reference: 'pages-text'}).text = me.pagesText(me);
    }

    /**
     *
     */
    updateTotalText() {
        let me = this;

        me.down({reference: 'total-text'}).text = me.totalText(me.store.totalCount);
    }
}

Neo.applyClassConfig(Paging);

export default Paging;
