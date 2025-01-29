import BaseSortZone from '../../../toolbar/SortZone.mjs';

/**
 * @class Neo.draggable.table.header.toolbar.SortZone
 * @extends Neo.draggable.toolbar.SortZone
 */
class SortZone extends BaseSortZone {
    static config = {
        /**
         * @member {String} className='Neo.draggable.table.header.toolbar.SortZone'
         * @protected
         */
        className: 'Neo.draggable.table.header.toolbar.SortZone',
        /**
         * @member {String} ntype='table-header-toolbar-sortzone'
         * @protected
         */
        ntype: 'table-header-toolbar-sortzone',
        /**
         * @member {String|null} itemMargin=null
         * @protected
         */
        itemMargin: '-2px 1px 1px 1px',
        /**
         * @member {Boolean} moveVertical=false
         */
        moveVertical: false,
        /**
         * @member {Number} offsetY=0
         */
        offsetY: 5
    }

    /**
     * @param {Neo.util.Rectangle} rect
     * @param {Neo.util.Rectangle} parentRect
     */
    adjustProxyRectToParent(rect, parentRect) {
        rect.x = rect.x - parentRect.x - 1;
        rect.y = rect.y - parentRect.y
    }

    /**
     * @param {Object} data
     */
    async onDragEnd(data) {
        await super.onDragEnd(data);

        let {owner} = this;

        owner.updateDepth = 2;
        owner.update();

        owner.parent.view.createViewData(owner.parent.view.store.items)
    }
}

export default Neo.setupClass(SortZone);
