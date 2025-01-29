import BaseSortZone from '../../../toolbar/SortZone.mjs';
import NeoArray     from  '../../../../util/Array.mjs';

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
        ntype: 'grid-header-toolbar-sortzone',
        /**
         * @member {String|null} itemMargin=null
         * @protected
         */
        itemMargin: '1px',
        /**
         * @member {Boolean} moveVertical=false
         */
        moveVertical: false
    }

    /**
     * @param {Neo.util.Rectangle} rect
     * @param {Neo.util.Rectangle} parentRect
     */
    adjustProxyRectToParent(rect, parentRect) {
        rect.x = rect.x - parentRect.x - 1;
        rect.y = rect.y - parentRect.y - 1
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

        owner.items.forEach((item, index) => {
            item.vdom['aria-colindex'] = index + 1; // 1 based
        });

        owner.updateDepth = 2;
        owner.update();

        await owner.passSizeToView();

        await this.timeout(20);

        owner.parent.view.createViewData()
    }
}

export default Neo.setupClass(SortZone);
