import Component from '../../component/Base.mjs';

/**
 * @summary The header row above a grid's leaf headers: one cell per run of columns that share a `headerGroup`.
 *
 * It exists only while a column carries a `headerGroup` ({@link Neo.grid.Container#flattenColumns}).
 * {@link Neo.grid.header.Wrapper} owns it as its first item and, while it exists, lays itself out as a CSS grid: the
 * region toolbars fill the second row, and this row spans the first as a subgrid, so each region's part sits exactly
 * over its toolbar. The leaf row underneath stays the flat row of buttons that sorting, resizing, filters, menus and
 * drag work on.
 *
 * A group cell is a projection of its region body's `columnPositions`. It starts at its first column's `x` and spans
 * its columns' widths, so a resize, a flex re-layout or a reorder re-projects it without measuring anything twice.
 *
 * @class Neo.grid.header.GroupRow
 * @extends Neo.component.Base
 */
class GroupRow extends Component {
    static config = {
        /**
         * @member {String} className='Neo.grid.header.GroupRow'
         * @protected
         */
        className: 'Neo.grid.header.GroupRow',
        /**
         * @member {String} ntype='grid-header-group-row'
         * @protected
         */
        ntype: 'grid-header-group-row',
        /**
         * @member {String[]} baseCls=['neo-grid-header-group-row']
         * @protected
         */
        baseCls: ['neo-grid-header-group-row'],
        /**
         * @member {Neo.grid.Container|null} gridContainer=null
         */
        gridContainer: null,
        /**
         * The group row is the first of the header's two ARIA rows
         * @member {String} role='row'
         */
        role: 'row',
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {'aria-rowindex': 1, cn: []}
    }

    /**
     * @summary The id of a region's part, the node that holds that region's group cells.
     * @param {String} region 'start', 'center' or 'end'
     * @returns {String}
     */
    getPartId(region) {
        return `${this.id}__${region}`
    }

    /**
     * @summary Rebuilds every region's group cells from its columns and its body's `columnPositions`.
     *
     * One part per region toolbar, in the toolbars' order, so the parts and the toolbars occupy the same grid columns.
     * A cell's `aria-colindex` is its first column's grid-wide index, and its `aria-colspan` its column count.
     */
    project() {
        let me                       = this,
            {gridContainer}          = me,
            {centerColumns, headerWrapper, lockedEndColumns, lockedStartColumns} = gridContainer || {};

        if (!headerWrapper) {
            return
        }

        me.vdom.cn = headerWrapper.getToolbars().map(toolbar => {
            let region    = toolbar.layoutLock || 'center',
                columns   = region === 'start' ? lockedStartColumns : region === 'end' ? lockedEndColumns : centerColumns,
                positions = toolbar.body?.columnPositions,
                offset    = toolbar.ariaColumnOffset,
                cells     = [],
                run       = null;

            columns?.forEach((column, index) => {
                let group    = column.headerGroup,
                    position = positions?.get(column.dataField),
                    width    = position?.width || 0;

                if (group && run?.group.id === group.id) {
                    run.count++;
                    run.width += width
                } else {
                    run = group ? {count: 1, group, index, width, x: position?.x || 0} : null;
                    run && cells.push(run)
                }
            });

            return {
                id  : me.getPartId(region),
                cls : ['neo-grid-header-group-part', `neo-grid-header-group-part-${region}`],
                role: 'none',
                cn  : cells.map(({count, group, index, width, x}) => ({
                    cls            : ['neo-grid-header-group-cell'],
                    role           : 'columnheader',
                    'aria-colindex': offset + index + 1,
                    'aria-colspan' : count,
                    style          : {left: `${x}px`, width: `${width}px`},
                    text           : group.text
                }))
            }
        });

        me.update()
    }
}

export default Neo.setupClass(GroupRow);
