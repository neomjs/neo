import BaseSortZone from '../../../toolbar/SortZone.mjs';
import NeoArray     from  '../../../../util/Array.mjs';

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
     * @param {Number} fromIndex
     * @param {Number} toIndex
     */
    moveTo(fromIndex, toIndex) {
        super.moveTo(fromIndex, toIndex);

        // It is crucial to use _columns to not get a shallow copy
        NeoArray.move(this.owner.parent._columns, fromIndex, toIndex);
    }

    /**
     * @param {Object} data
     */
    async onDragEnd(data) {
        await super.onDragEnd(data);

        let {owner} = this;

        owner.updateDepth = 2;
        owner.update();

        owner.parent.body.createViewData()
    }
}

export default Neo.setupClass(SortZone);
