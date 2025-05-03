import DragZone from './DragZone.mjs';

/**
 * @class Neo.draggable.tree.SortZone
 * @extends Neo.draggable.tree.DragZone
 */
class SortZone extends DragZone {
    static config = {
        /**
         * @member {String} className='Neo.draggable.tree.SortZone'
         * @protected
         */
        className: 'Neo.draggable.tree.SortZone',
        /**
         * @member {String} ntype='tree-sortzone'
         * @protected
         */
        ntype: 'tree-sortzone'
    }
}

export default Neo.setupClass(SortZone);
