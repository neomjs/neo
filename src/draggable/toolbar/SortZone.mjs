import DragZone from './DragZone.mjs';
import VDomUtil from '../../util/VDom.mjs';

/**
 * @class Neo.draggable.toolbar.SortZone
 * @extends Neo.draggable.toolbar.DragZone
 */
class SortZone extends DragZone {
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

    /**
     *
     * @param {Object} data
     */
    onDragStart(data) {
        let me = this;

        console.log('onDragStart', data);
        console.log(me.owner.getTheme());

        if (me.owner.sortable) {
            me.dragElement = VDomUtil.findVdomChild(me.owner.vdom, data.path[0].id).vdom;
            me.dragStart(data);
        }
    }
}

Neo.applyClassConfig(SortZone);

export {SortZone as default};