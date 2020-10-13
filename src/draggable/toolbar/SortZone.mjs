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
        ntype: 'toolbar-sortzone',
        /**
         * @member {Array|null} itemRects=null
         * @protected
         */
        itemRects: null
    }}

    /**
     *
     * @param {Object} data
     */
    onDragStart(data) {
        let me     = this,
            button = Neo.getComponent(data.path[0].id),
            owner  = me.owner,
            style  = button.style || {},
            ownerStyle;

        if (owner.sortable) {
            Neo.main.DomAccess.getBoundingClientRect({
                id: owner.items.map(e => e.id)
            }).then(itemRects => {
                me.itemRects = itemRects;

                ownerStyle = owner.style || {};
                ownerStyle.position = 'relative';
                owner.style = ownerStyle;

                me.dragElement = VDomUtil.findVdomChild(owner.vdom, button.id).vdom;
                me.dragStart(data);

                setTimeout(() => {
                    style.visibility = 'hidden';
                    button.style = style;
                }, 30);
            });
        }
    }
}

Neo.applyClassConfig(SortZone);

export {SortZone as default};