import Base from '../container/Base.mjs';

/**
 * @class Neo.grid.View
 * @extends Neo.container.Base
 */
class View extends Base {
    static config = {
        /**
         * @member {String} className='Neo.grid.View'
         * @protected
         */
        className: 'Neo.grid.View',
        /**
         * @member {String} ntype='grid-view'
         * @protected
         */
        ntype: 'grid-view',
        /**
         * @member {String[]} baseCls=['neo-grid-view', 'neo-hide-scrollbar']
         * @protected
         */
        baseCls: ['neo-grid-view', 'neo-hide-scrollbar'],
        /**
         * @member {Object} layout={ntype: 'hbox', align: 'stretch'}
         * @protected
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * The current scroll top position of the grid view
         * @member {Number} scrollTop_=0
         */
        scrollTop_: 0
    }

    /**
     * @returns {Object}
     */
    getVdomUpdateMeta() {
        return {
            scrollTop: this.scrollTop
        }
    }
}

export default Neo.setupClass(View);
