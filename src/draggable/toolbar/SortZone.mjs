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
         * @member {Object} indexMap=null
         * @protected
         */
        indexMap: null,
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
        let me    = this,
            owner = me.owner,
            itemStyle;

        owner.items.forEach((item, index) => {
            itemStyle = item.style || {};

            Object.assign(itemStyle, {
                height  : null,
                left    : null,
                position: null,
                top     : null,
                width   : null
            });

            if (index === me.startIndex) {
                itemStyle.visibility = null;
            }

            item.style = itemStyle;
        });

        Object.assign(me, {
            currentIndex: -1,
            indexMap    : null,
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
        let me         = this,
            moveFactor = 0.55, // we can not use 0.5, since items would jump back & forth
            index      = me.currentIndex,
            itemRects  = me.itemRects,
            deltaX     = data.clientX - me.offsetX - me.itemRects[index].left;

        if (index > 0 && deltaX < 0) {
            if (Math.abs(deltaX) > itemRects[index - 1].width * moveFactor) {
                me.currentIndex--;
                me.switchItems(index, me.currentIndex);
            }
        }

        else if (index < itemRects.length - 1 && deltaX > 0) {
            if (deltaX > itemRects[index + 1].width * moveFactor) {
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
            index, indexMap, itemStyle, ownerStyle, rect;

        if (owner.sortable) {
            index = owner.indexOf(button.id);

            indexMap = {};

            owner.items.forEach((item, index) => {
                indexMap[index] = index;
            });

            Object.assign(me, {
                currentIndex: index,
                indexMap    : indexMap,
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
        let tmp;

        if (index2 < index1) {
            tmp    = index1;
            index1 = index2;
            index2 = tmp;
        }

        let me    = this,
            map   = me.indexMap,
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

        tmp         = map[index1];
        map[index1] = map[index2];
        map[index2] = tmp;
    }

    /**
     *
     * @param {Number} index
     * @param {Object} rect
     */
    updateItem(index, rect) {
        let me    = this,
            map   = me.indexMap,
            owner = me.owner,
            style = owner.items[map[index]].style;

        Object.assign(style, {
            height: `${rect.height}px`,
            left  : `${rect.left}px`,
            top   : `${rect.top}px`,
            width : `${rect.width}px`
        });

        owner.items[map[index]].style = style;
    }
}

Neo.applyClassConfig(SortZone);

export {SortZone as default};