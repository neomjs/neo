import Base from '../core/Base.mjs';

/**
 * @class Neo.grid.ScrollManager
 * @extends Neo.core.Base
 * @singleton
 */
class ScrollManager extends Base {
    static config = {
        /**
         * @member {String} className='Neo.grid.ScrollManager'
         * @protected
         */
        className: 'Neo.grid.ScrollManager',
        /**
         * @member {Number} scrollLeft_=0
         * @protected
         */
        scrollLeft_: 0,
        /**
         * @member {Number} scrollTop_=0
         * @protected
         */
        scrollTop_: 0,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {Neo.grid.Container|null} gridContainer=null
     * @protected
     */
    gridContainer = null
    /**
     * @member {Neo.grid.View|null} gridView=null
     * @protected
     */
    gridView = null
}

export default Neo.setupClass(ScrollManager);
