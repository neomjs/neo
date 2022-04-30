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
        ntype: 'paging-toolbar'
    }}
}

Neo.applyClassConfig(Paging);

export default Paging;
