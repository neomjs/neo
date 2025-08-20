import BaseDragZone from '../container/DragZone.mjs';

/**
 * @class Neo.draggable.toolbar.DragZone
 * @extends Neo.draggable.container.DragZone
 */
class DragZone extends BaseDragZone {
    static config = {
        /**
         * @member {String} className='Neo.draggable.toolbar.DragZone'
         * @protected
         */
        className: 'Neo.draggable.toolbar.DragZone',
        /**
         * @member {String} ntype='toolbar-dragzone'
         * @protected
         */
        ntype: 'toolbar-dragzone'
    }
}

export default Neo.setupClass(DragZone);
