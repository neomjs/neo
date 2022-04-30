import ClassSystemUtil from '../util/ClassSystem.mjs';
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
        console.log(this);
    }

    /**
     * Triggered after the page config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetPage(value, oldValue) {
        console.log('afterSetPage', value);
    }

    /**
     * Triggered before the store config gets changed.
     * @param {Neo.data.Store|Object|null} value
     * @param {Neo.data.Store|null} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        oldValue?.destroy();

        return ClassSystemUtil.beforeSetInstance(value);
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

        if (me.page < me.getMaxPages()) {
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
