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
        itemRects: null,
        /**
         * @member {Number} startIndex=-1
         */
        startIndex: -1
    }}

    /**
     *
     * @param {Object} data
     */
    onDragEnd(data) {
        Object.assign(this, {
            startIndex: -1
        });

        super.onDragEnd(data);
    }

    /**
     *
     * @param {Object} data
     */
    onDragStart(data) {
        let me     = this,
            button = Neo.getComponent(data.path[0].id),
            owner  = me.owner,
            itemStyle, ownerStyle, rect;

        if (owner.sortable) {
            Object.assign(me, {
                startIndex: owner.indexOf(button.id)
            });

            Neo.main.DomAccess.getBoundingClientRect({
                id: [owner.id].concat(owner.items.map(e => e.id))
            }).then(itemRects => {
                me.itemRects = itemRects;

                ownerStyle = owner.style;

                Object.assign(ownerStyle, {
                    height: `${itemRects[0].height}px`,
                    width : `${itemRects[0].width}px`
                });

                owner.style = ownerStyle;

                owner.items.forEach((item, index) => {
                    itemStyle = item.style || {};
                    rect      = itemRects[index + 1];

                    Object.assign(itemStyle, {
                        height  : `${rect.height}px`,
                        left    : `${rect.left}px`,
                        position: 'absolute',
                        top     : `${rect.top}px`,
                        width   : `${rect.width}px`
                    });

                    item.style = itemStyle;
                });

                me.dragElement = VDomUtil.findVdomChild(owner.vdom, button.id).vdom;
                me.dragStart(data);

                setTimeout(() => {
                    itemStyle = button.style || {};
                    itemStyle.visibility = 'hidden';
                    button.style = itemStyle;
                }, 30);
            });
        }
    }
}

Neo.applyClassConfig(SortZone);

export {SortZone as default};