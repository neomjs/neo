import Toolbar from '../container/Toolbar.mjs';

/**
 * @class Neo.toolbar.Paging
 * @extends Neo.container.Toolbar
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
