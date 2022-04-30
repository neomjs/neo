import Toolbar from './Base.mjs';

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
         * @member {Number} page_=1
         */
        page_: 1,
        /**
         * @member {Number} pageSize_=30
         */
        pageSize_: 30,
        /**
         * @member {Neo.data.Store|null} store_=null
         */
        store_: null
    }}

    /**
     * @param config
     */
    construct(config) {
        super.construct(config);
        this.createToolbarItems();
    }

    /**
     *
     */
    createToolbarItems() {
        let me = this;

        me.items = [{
            handler: me.onFirstPageButtonClick.bind(me),
            iconCls: 'fa fa-angles-left'
        }, {
            handler: me.onPrevPageButtonClick.bind(me),
            iconCls: 'fa fa-angle-left',
            style  : {marginLeft: '10px'}
        }, {
            handler: me.onNextPageButtonClick.bind(me),
            iconCls: 'fa fa-angle-right',
            style  : {marginLeft: '10px'}
        }, {
            handler: me.onLastPageButtonClick.bind(me),
            iconCls: 'fa fa-angles-right',
            style  : {marginLeft: '10px'}
        }];
    }

    /**
     * @returns {Number}
     */
    getMaxPages() {
        return Math.floor(this.store.totalCount / this.pageSize);
    }

    /**
     *
     */
    onFirstPageButtonClick() {
        this.page = 1;
    }

    /**
     *
     */
    onLastPageButtonClick() {
        this.page = this.getMaxPages();
    }

    /**
     *
     */
    onNextPageButtonClick() {
        let me = this;

        if (me.page <= me.getMaxPages()) {
            me.page++;
        }
    }

    /**
     *
     */
    onPrevPageButtonClick() {
        if (this.page > 1) {
            this.page--;
        }
    }
}

Neo.applyClassConfig(Paging);

export default Paging;
