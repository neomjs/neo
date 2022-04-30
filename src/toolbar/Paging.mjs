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
         * @member {Neo.data.Store|null} store_=null
         */
        store_: null
    }}
}

Neo.applyClassConfig(Paging);

export default Paging;
