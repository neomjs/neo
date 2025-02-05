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
         * @member {String|null} itemMargin='1px'
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

        let me            = this,
            grid          = me.owner.parent,
            {view}        = grid,
            gridRows      = view.getVdomRoot().cn,
            columnIndex   = me.dragElement['aria-colindex'] - 1,
            {dataField}   = view.columnPositions.getAt(columnIndex),
            cells         = view.getColumnCells(dataField),
            rows          = [],
            config        = await super.createDragProxy(data, false),
            rect          = await grid.getDomRect(),
            viewWrapperId = Neo.getId('grid-view-wrapper'),
            row;

        config.cls = ['neo-grid-wrapper', me.owner.getTheme()];

        config.style.height = `${rect.height - 2}px`; // minus border-bottom & border-top

        cells.forEach((cell, index) => {
            row = VdomUtil.clone({ // clone to remove ids
                cls  : gridRows[index].cls,
                cn   : [cell],
                style: gridRows[index].style
            });

            delete row.cn[0].style.left;

            rows.push(row)
        });

        config.vdom =
        {cn: [
            {cls: ['neo-grid-container'], cn: [
                {...config.vdom, cls: ['neo-grid-header-toolbar', 'neo-toolbar']},
                {cls: ['neo-grid-view-wrapper'], id: viewWrapperId, cn: [
                    {cls: ['neo-grid-view'], cn: rows},
                    {cls: ['neo-grid-scrollbar'], style: {height: view.vdom.cn[1].height}}
                ]}
            ]}
        ]};

        config.listeners = {
            mounted() {
                Neo.main.DomAccess.scrollTo({
                    id      : viewWrapperId,
                    value   : view.scrollPosition.y,
                    windowId: this.windowId
                })
            }
        };

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
            let me             = this,
                {view}         = me.owner.parent,
                columnIndex    = me.dragElement['aria-colindex'] - 1,
                columnPosition = view.columnPositions.getAt(columnIndex),
                {dataField}    = columnPosition,
                cells          = view.getColumnCells(dataField);

            columnPosition.hidden = true;

            cells.forEach(cell => {
                cell.style.visibility = 'hidden'
            });

            view.update()
        }
    }

    /**
     * @param {Number} index1
     * @param {Number} index2
     */
    switchItems(index1, index2) {
        super.switchItems(index1, index2);

        if (this.moveColumnContent) {
            let me                = this,
                {itemRects}       = me,
                {view}            = me.owner.parent,
                {columnPositions} = view,
                column1Position   = columnPositions.getAt(index1),
                column2Position   = columnPositions.getAt(index2),
                column1Cells      = view.getColumnCells(column1Position.dataField),
                column2Cells      = view.getColumnCells(column2Position.dataField);

            Object.assign(column1Position, {
                width: itemRects[index2].width,
                x    : itemRects[index2].x + 1
            });

            Object.assign(column2Position, {
                width: itemRects[index1].width,
                x    : itemRects[index1].x + 1
            });

            columnPositions.move(index1, index2);

            column1Cells.forEach(node => {
                node.style.left  = column1Position.x     + 'px';
                node.style.width = column1Position.width + 'px'
            });

            column2Cells.forEach(node => {
                node.style.left  = column2Position.x     + 'px';
                node.style.width = column2Position.width + 'px'
            });

            view.update()
        }
    }
}

export default Neo.setupClass(SortZone);
