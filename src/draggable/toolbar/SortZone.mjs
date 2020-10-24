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
         * @member {Array|null} itemStyles=null
         * @protected
         */
        itemStyles: null,
        /**
         * @member {Object} ownerRect=null
         * @protected
         */
        ownerRect: null,
        /**
         * @member {Object} ownerStyle=null
         * @protected
         */
        ownerStyle: null,
        /**
         * @member {Boolean} alwaysFireDragMove=false
         * @protected
         */
        reversedLayoutDirection: false,
        /**
         * Internal flag: onDragStart() will set the value to horizontal or vertical, depending on the current layout.
         * @member {String} sortDirection='horizontal'
         * @protected
         */
        sortDirection: 'horizontal',
        /**
         * @member {Number} startIndex=-1
         * @protected
         */
        startIndex: -1
    }}

    /**
     * Override this method for class extensions (e.g. tab.header.Toolbar)
     * @param {Number} fromIndex
     * @param {Number} toIndex
     */
    moveTo(fromIndex, toIndex) {
        this.owner.moveTo(fromIndex, toIndex);
    }

    /**
     *
     * @param {Object} data
     */
    onDragEnd(data) {
        let me         = this,
            owner      = me.owner,
            itemStyles = me.itemStyles,
            ownerStyle = owner.style || {},
            itemStyle;

        ownerStyle.height = me.ownerStyle.height || null;
        ownerStyle.width  = me.ownerStyle.width  || null;

        owner.style = ownerStyle;

        owner.items.forEach((item, index) => {
            itemStyle = item.style || {};

            Object.assign(itemStyle, {
                height  : itemStyles[index].height || null,
                left    : null,
                position: null,
                top     : null,
                width   : itemStyles[index].width || null
            });

            if (index === me.startIndex) {
                itemStyle.visibility = null;
            }

            item.style = itemStyle;
        });

        if (me.startIndex !== me.currentIndex) {
            me.moveTo(me.startIndex, me.currentIndex);
        }

        Object.assign(me, {
            currentIndex: -1,
            indexMap    : null,
            itemRects   : null,
            itemStyles  : null,
            ownerRect   : null,
            startIndex  : -1
        });

        me.dragEnd(data); // we do not want to trigger the super class call here
    }

    /**
     *
     * @param {Object} data
     */
    onDragMove(data) {
        if (this.itemRects) { // the method can trigger before we got the client rects from the main thread
            let me         = this,
                moveFactor = 0.55, // we can not use 0.5, since items would jump back & forth
                index      = me.currentIndex,
                itemRects  = me.itemRects,
                maxItems   = itemRects.length - 1,
                reversed   = me.reversedLayoutDirection,
                delta, itemWidth;

            if (me.sortDirection === 'horizontal') {
                delta     = data.clientX - me.offsetX - itemRects[index].left;
                itemWidth = 'width';
            } else {
                delta     = data.clientY - me.offsetY - itemRects[index].top;
                itemWidth = 'height';
            }

            if (reversed) {
                if (index > 0 && delta > 0) {
                    if (Math.abs(delta) > itemRects[index - 1][itemWidth] * moveFactor) {
                        me.currentIndex--;
                        me.switchItems(index, me.currentIndex);
                    }
                }

                else if (index < maxItems && delta < 0) {
                    if (Math.abs(delta) > itemRects[index + 1][itemWidth] * moveFactor) {
                        me.currentIndex++;
                        me.switchItems(index, me.currentIndex);
                    }
                }
            } else {
                if (index > 0 && delta < 0) {
                    if (Math.abs(delta) > itemRects[index - 1][itemWidth] * moveFactor) {
                        me.currentIndex--;
                        me.switchItems(index, me.currentIndex);
                    }
                }

                else if (index < maxItems && delta > 0) {
                    if (delta > itemRects[index + 1][itemWidth] * moveFactor) {
                        me.currentIndex++;
                        me.switchItems(index, me.currentIndex);
                    }
                }
            }
        }
    }

    /**
     *
     * @param {Object} data
     */
    onDragStart(data) {
        let me         = this,
            button     = Neo.getComponent(data.path[0].id),
            owner      = me.owner,
            itemStyles = me.itemStyles = [],
            layout     = owner.layout,
            ownerStyle = owner.style || {},
            index, indexMap, itemStyle, rect;

        if (owner.sortable) {
            index    = owner.indexOf(button.id);
            indexMap = {};

            Object.assign(me, {
                currentIndex           : index,
                dragElement            : VDomUtil.findVdomChild(owner.vdom, button.id).vdom,
                dragProxyConfig        : {...me.dragProxyConfig || {}, cls : ['neo-dragproxy', ...owner.cls]},
                indexMap               : indexMap,
                ownerStyle             : {height: ownerStyle.height, width : ownerStyle.width},
                reversedLayoutDirection: layout.direction === 'column-reverse' || layout.direction === 'row-reverse',
                sortDirection          : owner.layout.ntype === 'layout-vbox' ? 'vertical' : 'horizontal',
                startIndex             : index
            });

            me.dragStart(data); // we do not want to trigger the super class call here

            owner.items.forEach((item, index) => {
                indexMap[index] = index;

                itemStyles.push({
                    height: item.style && item.style.height,
                    width : item.style && item.style.width
                });
            });

            Neo.main.DomAccess.getBoundingClientRect({
                id: [owner.id].concat(owner.items.map(e => e.id))
            }).then(itemRects => {
                me.ownerRect = itemRects[0];

                ownerStyle.height = `${itemRects[0].height}px`;
                ownerStyle.width  = `${itemRects[0].width}px`;

                // the only reason we are adjusting the toolbar style is that there is no min height or width present.
                // removing items from the layout could trigger a change in size.
                owner.style = ownerStyle;

                itemRects.shift();
                me.itemRects = itemRects;

                owner.items.forEach((item, index) => {
                    itemStyle = item.style || {};
                    rect      = itemRects[index];

                    item.style = Object.assign(itemStyle, {
                        height  : `${rect.height}px`,
                        left    : `${rect.left}px`,
                        position: 'absolute',
                        top     : `${rect.top}px`,
                        width   : `${rect.width}px`
                    });
                });

                // we need to add a short (1 frame) delay to ensure the item has switched to an absolute position
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
        let me       = this,
            reversed = me.reversedLayoutDirection,
            tmp;

        if ((!reversed && index2 < index1) || (reversed && index1 < index2)) {
            tmp    = index1;
            index1 = index2;
            index2 = tmp;
        }

        let itemRects = me.itemRects,
            map       = me.indexMap,
            rect1     = itemRects[index1],
            rect2     = itemRects[index2],
            rect1Copy = {...rect1},
            rect2Copy = {...rect2};

        if (me.sortDirection === 'horizontal') {
            rect1.width = rect2Copy.width;
            rect2.left  = rect1Copy.left + rect2Copy.width;
            rect2.width = rect1Copy.width;
        } else {
            rect1.height = rect2Copy.height;
            rect2.height = rect1Copy.height;
            rect2.top    = rect1Copy.top + rect2Copy.height;
        }

        tmp         = map[index1];
        map[index1] = map[index2];
        map[index2] = tmp;

        me.updateItem(index1, rect1);
        me.updateItem(index2, rect2);
    }

    /**
     *
     * @param {Number} index
     * @param {Object} rect
     */
    updateItem(index, rect) {
        let me    = this,
            item  = me.owner.items[me.indexMap[index]],
            style = item.style;

        style.left = `${rect.left}px`;
        style.top  = `${rect.top}px`;

        item.style = style;
    }
}

Neo.applyClassConfig(SortZone);

export {SortZone as default};