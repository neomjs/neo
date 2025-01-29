import BaseSortZone from '../../../toolbar/SortZone.mjs';
import VDomUtil     from '../../../../util/VDom.mjs';

/**
 * @class Neo.draggable.grid.header.toolbar.SortZone
 * @extends Neo.draggable.toolbar.SortZone
 */
class SortZone extends BaseSortZone {
    static config = {
        /**
         * @member {String} className='Neo.draggable.grid.header.toolbar.SortZone'
         * @protected
         */
        className: 'Neo.draggable.grid.header.toolbar.SortZone',
        /**
         * @member {String} ntype='grid-header-toolbar-sortzone'
         * @protected
         */
        ntype: 'grid-header-toolbar-sortzone'
    }

    /**
     * @param {Object} data
     */
    onDragStart(data) {
        let me         = this,
            button     = Neo.getComponent(data.path[0].id),
            {owner}    = me,
            itemStyles = me.itemStyles = [],
            {layout}   = owner,
            ownerStyle = owner.style || {},
            index, indexMap, itemStyle, ownerRect, rect;

        if (owner.sortable) {
            index    = owner.indexOf(button.id);
            indexMap = {};

            Object.assign(me, {
                currentIndex           : index,
                dragElement            : VDomUtil.find(owner.vdom, button.id).vdom,
                dragProxyConfig        : {...me.dragProxyConfig, cls : [...owner.cls]},
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
                    height: item.style?.height,
                    width : item.style?.width
                })
            });

            owner.getDomRect([owner.id].concat(owner.items.map(e => e.id))).then(itemRects => {
                me.ownerRect = ownerRect = itemRects[0];

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

                    rect.x -= ownerRect.x;
                    rect.y -= ownerRect.y;

                    item.style = Object.assign(itemStyle, {
                        height       : `${rect.height}px`,
                        left         : `${rect.left}px`,
                        margin       : '1px',
                        pointerEvents: 'none',
                        position     : 'absolute',
                        top          : `${rect.top}px`,
                        width        : `${rect.width}px`
                    })
                });

                // we need to add a short (1 frame) delay to ensure the item has switched to an absolute position
                me.timeout(5).then(() => {
                    itemStyle = button.style || {};
                    itemStyle.visibility = 'hidden';
                    button.style = itemStyle
                })
            })
        }
    }
}

export default Neo.setupClass(SortZone);
