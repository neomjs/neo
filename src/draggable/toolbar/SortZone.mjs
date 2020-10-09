import BaseSortZone from '../../draggable/DragZone.mjs';

/**
 * @class Neo.draggable.toolbar.SortZone
 * @extends Neo.draggable.list.SortZone
 */
class SortZone extends BaseSortZone {
    static getConfig() {return {
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
    }}
}

Neo.applyClassConfig(SortZone);

export {SortZone as default};