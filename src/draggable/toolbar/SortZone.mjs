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
        let me        = this,
            tabHeader = Neo.getComponent(data.path[0].id),
            style     = tabHeader.style || {};

        console.log('onDragStart', data);
        console.log(tabHeader.getTheme());

        if (me.owner.sortable) {
            me.dragElement = VDomUtil.findVdomChild(me.owner.vdom, tabHeader.id).vdom;
            me.dragStart(data);
        }

        setTimeout(() => {
            style.visibility = 'hidden';
            tabHeader.style = style;
        }, 30);
    }
}

Neo.applyClassConfig(SortZone);

export {SortZone as default};