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
         * @member {Boolean} alwaysFireDragMove=true
         */
        alwaysFireDragMove: true,
        /**
         * @member {Number} currentIndex=-1
         * @protected
         */
        currentIndex: -1,
        /**
         * @member {Array|null} itemRects=null
         * @protected
         */
        itemRects: null,
        /**
         * @member {Object} ownerRect=null
         * @protected
         */
        ownerRect: null,
        /**
         * @member {Number} startIndex=-1
         * @protected
         */
        startIndex: -1
    }}

    /**
     *
     * @param {Object} data
     */
    onDragEnd(data) {
        Object.assign(this, {
            currentIndex: -1,
            startIndex  : -1
        });

        super.onDragEnd(data);
    }

    /**
     *
     * @param {Object} data
     */
    onDragMove(data) {
        let me     = this,
            index  = me.currentIndex,
            deltaX = data.clientX - me.offsetX - me.itemRects[index].left;

        console.log(index, deltaX);

        if (index > 0 && deltaX < 0) {
            if (Math.abs(deltaX) > me.itemRects[index - 1].width / 2) {
                me.currentIndex--;
                me.switchItems(index, me.currentIndex);
            }
        }
    }

    /**
     *
     * @param {Object} data
     */
    onDragStart(data) {
        let me     = this,
            button = Neo.getComponent(data.path[0].id),
            owner  = me.owner,
            index, itemStyle, ownerStyle, rect;

        if (owner.sortable) {
            index = owner.indexOf(button.id);

            Object.assign(me, {
                currentIndex: index,
                startIndex  : index
            });

            Neo.main.DomAccess.getBoundingClientRect({
                id: [owner.id].concat(owner.items.map(e => e.id))
            }).then(itemRects => {
                me.ownerRect = itemRects[0];
                itemRects.shift();
                me.itemRects = itemRects;

                ownerStyle = owner.style;

                Object.assign(ownerStyle, {
                    height: `${itemRects[0].height}px`,
                    width : `${itemRects[0].width}px`
                });

                owner.style = ownerStyle;

                owner.items.forEach((item, index) => {
                    itemStyle = item.style || {};
                    rect      = itemRects[index];

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

    /**
     *
     * @param {Number} index1
     * @param {Number} index2
     */
    switchItems(index1, index2) {
        let me  = this,
            tmp = {...me.itemRects[index2]};

        me.updateItem(index1, tmp);
        me.updateItem(index2, me.itemRects[index1]);

        me.itemRects[index2] = me.itemRects[index1];
        me.itemRects[index1] = tmp;

        console.log(me.itemRects[index1], me.itemRects[index2]);
    }

    /**
     *
     * @param {Number} index
     * @param {Object} rect
     */
    updateItem(index, rect) {
        let me    = this,
            owner = me.owner,
            style = owner.items[index].style;

        Object.assign(style, {
            height: `${rect.height}px`,
            left  : `${rect.left}px`,
            top   : `${rect.top}px`,
            width : `${rect.width}px`
        });

        owner.items[index].style = style;
    }
}

Neo.applyClassConfig(SortZone);

export {SortZone as default};