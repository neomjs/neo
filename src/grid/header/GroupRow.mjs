import Component from '../../component/Base.mjs';
import VDomUtil  from '../../util/VDom.mjs';

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
 * A group cell also drags its whole group, while its region's toolbar is `dragResortable`. The toolbar's drag zone moves
 * the group's run of leaves as one unit among the region's other groups and ungrouped columns, which slide aside as it
 * passes them, so a group never lands inside another one and never leaves its region
 * ({@link Neo.draggable.grid.header.toolbar.SortZone#startUnitDrag}).
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
     * The group, region and leaf count of each rendered group cell, by the cell's id. A drag resolves its group here.
     * @member {Map<String, {groupId: String, length: Number, region: String}>} cellGroups
     * @protected
     */
    cellGroups = new Map()

    /**
     * True once the first projection has reached the DOM and the centre part has taken the grid's scroll position
     * @member {Boolean} #aligned=false
     */
    #aligned = false

    /**
     * The drag zone each region part is registered under with the main thread, by part id
     * @member {Map<String, String>} #parts
     */
    #parts = new Map()

    /**
     * The part ids whose registration is on its way to the main thread
     * @member {Set<String>} #partsPending
     */
    #partsPending = new Set()

    /**
     * @summary A region's top-level units in column order: each run of a group's leaves is one unit, and each
     * ungrouped column is one.
     * @param {Object[]}                 columns   The region's columns
     * @param {Neo.collection.Base|null} positions The region body's `columnPositions`
     * @returns {Object[]} `{columns, group, index, width, x}` per unit, `group` null for an ungrouped column and `index`
     * the unit's first column in `columns`
     */
    static getUnits(columns, positions) {
        let units = [],
            unit  = null;

        columns?.forEach((column, index) => {
            let group    = column.headerGroup || null,
                position = positions?.get(column.dataField),
                width    = position?.width || 0;

            if (group && unit?.group?.id === group.id) {
                unit.columns.push(column);
                unit.width += width
            } else {
                unit = {columns: [column], group, index, width, x: position?.x || 0};
                units.push(unit)
            }
        });

        return units
    }

    /**
     * @summary A region's columns: locked start, centre or locked end.
     * @param {String} region `'start'`, `'center'` or `'end'`
     * @returns {Object[]}
     */
    getRegionColumns(region) {
        let {centerColumns, lockedEndColumns, lockedStartColumns} = this.gridContainer || {};

        return region === 'start' ? lockedStartColumns : region === 'end' ? lockedEndColumns : centerColumns
    }

    /**
     * @summary Listens for drags on the group cells.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.addDomListeners(
            {'drag:start': me.onGroupDragStart, scope: me, delegate: '.neo-grid-header-group-cell'}
        )
    }

    /**
     * @summary Starts a group drag in its region: the region toolbar's drag zone moves the group's run of headers as
     * one unit. The zone owns the rest of the gesture: the main thread routes its moves, its release and its Escape there.
     * @param {Object} data
     */
    onGroupDragStart(data) {
        let me      = this,
            cell    = data.path?.find(node => me.cellGroups.has(node.id)),
            group   = cell && me.cellGroups.get(cell.id),
            toolbar = group && me.gridContainer.headerWrapper.getToolbars().find(item => (item.layoutLock || 'center') === group.region),
            first   = toolbar?.sortZone ? toolbar.items.findIndex(item =>
                me.gridContainer.columns.get(item.dataField)?.headerGroup?.id === group.groupId) : -1;

        first > -1 && toolbar.sortZone.startUnitDrag(data, {
            first,
            groupId: group.groupId,
            head   : VDomUtil.find(me.vdom, cell.id)?.vdom,
            length : group.length
        })
    }

    /**
     * @summary Registers a region's part with the main thread under its toolbar's drag zone, so a group cell's gesture
     * resolves to that zone from its first frame on: Escape reaches it even while the drag's start is pending. The
     * part's cells turn draggable once the registration has landed.
     * @param {String}                 partId
     * @param {Neo.draggable.DragZone} zone
     * @returns {Promise<void>}
     */
    async registerPart(partId, zone) {
        let me = this;

        me.#partsPending.add(partId);

        // Optional like the zones' own registration: a worker without the main-thread addon registers nothing
        await Neo.main.addon.DragDrop?.registerZone?.({
            appName          : me.appName,
            dragElementRootId: partId,
            dragZoneId       : zone.id,
            windowId         : me.windowId
        });

        me.#partsPending.delete(partId);

        if (!me.isDestroyed) {
            me.#parts.set(partId, zone.id);
            me.project()
        }
    }

    /**
     * @summary Rebuilds every region's group cells from its columns and its body's `columnPositions`.
     *
     * One part per region toolbar, in the toolbars' order, so the parts and the toolbars occupy the same grid columns.
     * A part clips its cells and an empty track as wide as its region's columns, so the centre part scrolls as far as
     * the leaves do. The cells sit in the part itself: a reorder moves them inside the scrolled element, whose scroll
     * {@link Neo.main.DeltaUpdates#flushLayoutHeals} keeps, while it would reset the scroll of a scrolled ancestor. A
     * cell's `aria-colindex` is its first column's grid-wide index, and its `aria-colspan` its column count. A cell is
     * draggable while its region's toolbar is `dragResortable` and its part is registered under the toolbar's drag zone
     * ({@link #registerPart}).
     *
     * A rebuilt part carries the `scrollLeft` that `onScrollCapture` recorded on its predecessor, so the update cannot
     * diff the scrolled centre part back to the origin.
     */
    project() {
        let me              = this,
            {gridContainer} = me,
            {headerWrapper} = gridContainer || {};

        if (!headerWrapper) {
            return
        }

        let scrolled     = new Map(me.vdom.cn.map(part => [part.id, part.scrollLeft])),
            toolbars     = headerWrapper.getToolbars(),
            unregistered = [];

        me.cellGroups.clear();

        me.vdom.cn = toolbars.map(toolbar => {
            let region = toolbar.layoutLock || 'center',
                id     = gridContainer.getGroupHeaderPartId(region),
                offset = toolbar.ariaColumnOffset,
                zone   = toolbar.dragResortable && toolbar.sortZone,
                ready  = !!zone && me.#parts.get(id) === zone.id,
                // A dragged group's proxy carries its cell, so the cell leaves the row until the drop
                dragged = zone?.dragUnit?.groupId,
                cls     = ready ? ['neo-grid-header-group-cell', 'neo-draggable'] : ['neo-grid-header-group-cell'],
                cells   = GroupRow.getUnits(me.getRegionColumns(region), toolbar.body?.columnPositions).filter(unit => unit.group);

            zone && !ready && !me.#partsPending.has(id) && unregistered.push([id, zone]);

            return {
                id,
                cls       : ['neo-grid-header-group-part', `neo-grid-header-group-part-${region}`],
                role      : 'none',
                scrollLeft: scrolled.get(id),
                cn        : [{
                    id   : `${id}__track`,
                    cls  : ['neo-grid-header-group-track'],
                    role : 'none',
                    style: {width: `${toolbar.body?.availableWidth || 0}px`}
                }, ...cells.map(({columns, group, index, width, x}) => {
                    let cellId = `${group.id}__cell`;

                    me.cellGroups.set(cellId, {groupId: group.id, length: columns.length, region});

                    return {
                        id             : cellId,
                        cls            : [...cls],
                        role           : 'columnheader',
                        'aria-colindex': offset + index + 1,
                        'aria-colspan' : columns.length,
                        style          : {left: `${x}px`, visibility: group.id === dragged ? 'hidden' : null, width: `${width}px`},
                        text           : group.text
                    }
                })]
            }
        });

        unregistered.forEach(([id, zone]) => me.registerPart(id, zone));

        me.promiseUpdate().then(() => {
            // The scroll sync moves the centre part from the next scroll on. A row created while the grid is already
            // scrolled starts where the header is.
            let {scrollLeft} = gridContainer.headerToolbar;

            if (!me.#aligned && !me.isDestroyed) {
                me.#aligned = true;

                scrollLeft > 0 && Neo.main.DomAccess.scrollTo({
                    direction: 'left',
                    id       : gridContainer.getGroupHeaderPartId('center'),
                    value    : scrollLeft,
                    windowId : me.windowId
                })
            }
        })
    }
}

export default Neo.setupClass(GroupRow);
