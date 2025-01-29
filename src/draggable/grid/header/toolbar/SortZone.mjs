import BaseSortZone from '../../../toolbar/SortZone.mjs';

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
         * @member {Boolean} adjustProxyRectToParent=true
         */
        adjustProxyRectToParent: true,
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

        owner.parent.view.createViewData()
    }
}

export default Neo.setupClass(SortZone);
