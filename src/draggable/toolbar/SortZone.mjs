import DragZone from '../container/SortZone.mjs';

/**
 * @class Neo.draggable.toolbar.SortZone
 * @extends Neo.draggable.container.SortZone
 */
class SortZone extends DragZone {
    static config = {
        /**
         * @member {String} className='Neo.draggable.toolbar.SortZone'
         * @protected
         */
        className: 'Neo.draggable.toolbar.SortZone',
        /**
         * @member {String} ntype='toolbar-sortzone'
         * @protected
         */
        ntype: 'toolbar-sortzone'
    }
}

export default Neo.setupClass(SortZone);
