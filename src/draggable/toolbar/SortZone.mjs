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
            itemRects   : null,
            ownerRect   : null,
            startIndex  : -1
        });

        super.onDragEnd(data);
    }

    /**
     *
     * @param {Object} data
     */
    onDragMove(data) {
        let me        = this,
            index     = me.currentIndex,
            itemRects = me.itemRects,
            deltaX    = data.clientX - me.offsetX - me.itemRects[index].left;

        if (index > 0 && deltaX < 0) {
            if (Math.abs(deltaX) > itemRects[index - 1].width / 2) {
                me.currentIndex--;
                me.switchItems(index, me.currentIndex);
            }
        }

        else if (index < itemRects.length - 1 && deltaX > 0) {
            if (deltaX > itemRects[index + 1].width / 2) {
                me.currentIndex++;
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
        if (index2 < index1) {
            let tmp = index1;
            index1 = index2;
            index2 = tmp;
        }

        console.log('#####switchItems', index1, index2, [...this.itemRects]);
        let me    = this,
            rect1 = {...me.itemRects[index1]},
            rect2 = {...me.itemRects[index2]};

        me.updateItem(index1, rect2);
        me.updateItem(index2, rect1);

        Object.assign(me.itemRects[index1], {
            width: rect2.width
        });

        Object.assign(me.itemRects[index2], {
            left : rect1.left + rect1.width,
            width: rect1.width
        });
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