import BaseSortZone from '../../../container/SortZone.mjs';
import VdomUtil     from  '../../../../util/VDom.mjs';

/**
 * @class Neo.draggable.grid.header.toolbar.SortZone
 * @extends Neo.draggable.container.SortZone
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
            {body}        = grid,
            bodyWrapperId = Neo.getId('grid-body-wrapper'),
            gridRows      = body.getVdomRoot().cn,
            columnIndex   = me.dragElement['aria-colindex'] - 1,
            {dataField}   = body.columnPositions.getAt(columnIndex),
            cells         = body.getColumnCells(dataField),
            rows          = [],
            config        = await super.createDragProxy(data, false),
            rect          = await grid.getDomRect(),
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
                {cls: ['neo-grid-body-wrapper'], id: bodyWrapperId, cn: [
                    {cls: ['neo-grid-body'], cn: rows},
                    {cls: ['neo-grid-scrollbar'], style: {height: body.vdom.cn[0].height}}
                ]}
            ]}
        ]};

        config.listeners = {
            mounted() {
                Neo.main.DomAccess.scrollTo({
                    id      : bodyWrapperId,
                    value   : body.scrollTop,
                    windowId: me.windowId
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
        this.owner.parent.columns.move(fromIndex, toIndex)
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

        await owner.passSizeToBody();

        await this.timeout(20);

        owner.parent.body.createViewData()
    }

    /**
     * @param {Object} data
     */
    async onDragStart(data) {
        await super.onDragStart(data);

        if (this.moveColumnContent) {
            let me             = this,
                {body}         = me.owner.parent,
                columnIndex    = me.dragElement['aria-colindex'] - 1,
                columnPosition = body.columnPositions.getAt(columnIndex),
                {dataField}    = columnPosition,
                cells          = body.getColumnCells(dataField);

            columnPosition.hidden = true;

            cells.forEach(cell => {
                cell.style.visibility = 'hidden'
            });

            body.update()
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
                {body}            = me.owner.parent,
                {columnPositions} = body,
                column1Position   = columnPositions.getAt(index1),
                column2Position   = columnPositions.getAt(index2),
                column1Cells      = body.getColumnCells(column1Position.dataField),
                column2Cells      = body.getColumnCells(column2Position.dataField);

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

            body.update()
        }
    }
}

export default Neo.setupClass(SortZone);
