import BaseSortZone from '../../../toolbar/SortZone.mjs';
import NeoArray     from  '../../../../util/Array.mjs';
import VdomUtil     from  '../../../../util/VDom.mjs';

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
         * @member {Boolean} moveColumnContent=true
         */
        moveColumnContent: true,
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
     * @param {Object}  data
     * @param {Boolean} createComponent=true
     * @returns {Object|Neo.draggable.DragProxyComponent}
     */
    async createDragProxy(data, createComponent=true) {
        if (!this.moveColumnContent) {
            return await super.createDragProxy(data, createComponent)
        }

        let me          = this,
            grid        = me.owner.parent,
            {view}      = grid,
            gridRows    = view.getVdomRoot().cn,
            columnIndex = me.dragElement['aria-colindex'] - 1,
            {dataField} = view.columnPositions[columnIndex],
            cells       = view.getColumnCells(dataField),
            rows        = [],
            config      = await super.createDragProxy(data, false),
            rect        = await grid.getDomRect(),
            row;

        config.cls = ['neo-grid-wrapper', me.owner.getTheme()];

        config.style.height = rect.height + 'px';

        cells.forEach((cell, index) => {
            row = VdomUtil.clone({cls: gridRows[index].cls, cn: [cell]}); // clone to remove ids

            row.style = {
                height: view.rowHeight + 'px'
            };

            delete row.cn[0].style.left;

            rows.push(row)
        });

        config.vdom =
        {cn: [
            {cls: ['neo-grid-container'], cn: [
                {...config.vdom, cls: ['neo-grid-header-toolbar', 'neo-toolbar']},
                {cls: ['neo-grid-view'], cn: rows}
            ]}
        ]};

        if (createComponent) {
            return me.dragProxy = Neo.create(config)
        }

        return config
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

    /**
     * @param {Object} data
     */
    async onDragStart(data) {
        await super.onDragStart(data);

        if (this.moveColumnContent) {
            let me          = this,
                {view}      = me.owner.parent,
                columnIndex = me.dragElement['aria-colindex'] - 1,
                {dataField} = view.columnPositions[columnIndex],
                cells       = view.getColumnCells(dataField);

            cells.forEach(cell => {
                cell.style.display = 'none'
            });

            view.update()
        }
    }

    /**
     * @param {Number} index1
     * @param {Number} index2
     */
    switchItems(index1, index2) {
        if (this.moveColumnContent) {
            let {view}          = this.owner.parent,
                columnPositions = view._columnPositions, // no clone
                column1Cells    = view.getColumnCells(columnPositions[index1].dataField),
                column2Cells    = view.getColumnCells(columnPositions[index2].dataField),
                x;

            x = columnPositions[index1].x;
            columnPositions[index1].x = columnPositions[index2].x;
            columnPositions[index2].x = x;

            NeoArray.move(columnPositions, index1, index2);

            column1Cells.forEach(node => {
                node.style.left = columnPositions[index2].x + 'px'
            });

            column2Cells.forEach(node => {
                node.style.left = columnPositions[index1].x + 'px'
            });

            view.update()
        }

        super.switchItems(index1, index2);
    }
}

export default Neo.setupClass(SortZone);
