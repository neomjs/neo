import DragZone from './DragZone.mjs';

/**
 * @class Neo.draggable.list.SortZone
 * @extends Neo.draggable.list.DragZone
 */
class SortZone extends DragZone {
    static config = {
        /**
         * @member {String} className='Neo.draggable.list.SortZone'
         * @protected
         */
        className: 'Neo.draggable.list.SortZone',
        /**
         * @member {String} ntype='list-sortzone'
         * @protected
         */
        ntype: 'list-sortzone'
    }
}

export default Neo.setupClass(SortZone);
