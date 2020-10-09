import DragZone from '../../draggable/DragZone.mjs';

/**
 * @class Neo.draggable.list.SortZone
 * @extends Neo.draggable.list.DragZone
 */
class SortZone extends DragZone {
    static getConfig() {return {
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
    }}
}

Neo.applyClassConfig(SortZone);

export {SortZone as default};