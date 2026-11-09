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
 * A group cell also drags its whole group, while its region's toolbar is `dragResortable`. The drop moves the group's
 * run of leaves as one block among the region's top-level units, the other groups and the ungrouped columns, so a
 * group never lands inside another one and never leaves its region ({@link #moveGroup}).
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
         * The group cells' drag zone, created once this row first projects draggable cells ({@link #createDragZone})
         * @member {Neo.draggable.DragZone|null} dragZone=null
         * @protected
         */
        dragZone: null,
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
     * The group and region of each rendered group cell, by the cell's id. A drag resolves its group here.
     * @member {Map<String, {groupId: String, region: String}>} cellGroups
     * @protected
     */
    cellGroups = new Map()

    /**
     * True once the first projection has reached the DOM and the centre part has taken the grid's scroll position
     * @member {Boolean} #aligned=false
     */
    #aligned = false

    /**
     * The group drag in progress: its group and region, its pending start, and whether a release or a cancel ended it
     * @member {Object|null} #drag=null
     */
    #drag = null

    /**
     * Resolves to the drag zone once its module has loaded
     * @member {Promise<Neo.draggable.DragZone|null>|null} #dragZoneReady=null
     */
    #dragZoneReady = null

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
     * @summary A region's column order once its group `groupId` is dropped at `x`, or null when the group stays put.
     * The group takes the slot between the units whose centres straddle `x`, so it never lands inside another group.
     * @param {Object}                   data
     * @param {Object[]}                 data.columns   The region's columns
     * @param {String}                   data.groupId   The dragged group
     * @param {Neo.collection.Base|null} data.positions The region body's `columnPositions`
     * @param {Number}                   data.x         The release x in the region's content space
     * @returns {Object[]|null}
     */
    static getGroupDropOrder({columns, groupId, positions, x}) {
        let units   = GroupRow.getUnits(columns, positions),
            dragged = units.find(unit => unit.group?.id === groupId),
            others  = units.filter(unit => unit !== dragged),
            slot    = others.filter(unit => unit.x + unit.width / 2 < x).length,
            order;

        if (!dragged) {
            return null
        }

        order = [...others.slice(0, slot), dragged, ...others.slice(slot)].flatMap(unit => unit.columns);

        return order.some((column, index) => column !== columns[index]) ? order : null
    }

    /**
     * @summary Loads and creates the group cells' drag zone. Its drag element starts as this row, so the zone registers
     * with the main thread under the row: every group cell's gesture resolves to it from its first frame on, and
     * Escape reaches it even while that gesture's start is still pending.
     * @returns {Promise<Neo.draggable.DragZone|null>}
     */
    async createDragZone() {
        let me       = this,
            DragZone = (await import('../../draggable/DragZone.mjs')).default;

        if (me.isDestroyed) {
            return null
        }

        me.dragZone = Neo.create({
            module         : DragZone,
            appName        : me.appName,
            dragElement    : me.vdom,
            moveVertical   : false,
            owner          : me,
            useProxyWrapper: false,
            windowId       : me.windowId
        });

        me.dragZone.on('dragCancel', me.onGroupDragCancel, me);

        return me.dragZone
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        this.dragZone?.destroy();
        super.destroy(...args)
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
     * @summary Moves a group's run of leaves to the slot its release names, then lays the grid out once.
     * @param {Object} drag
     * @param {String} drag.groupId
     * @param {String} drag.region
     * @param {Number} clientX The release x
     * @returns {Promise<Boolean>} true when the columns moved
     */
    async moveGroup({groupId, region}, clientX) {
        let me              = this,
            {gridContainer} = me,
            toolbar         = gridContainer?.headerWrapper?.getToolbars().find(item => (item.layoutLock || 'center') === region),
            columns         = me.getRegionColumns(region),
            rect            = toolbar && Neo.isNumber(clientX) && await toolbar.getDomRect(),
            order           = rect && GroupRow.getGroupDropOrder({
                columns,
                groupId,
                positions: toolbar.body?.columnPositions,
                x        : clientX - rect.x + (toolbar.scrollLeft || 0)
            });

        if (!order || me.isDestroyed) {
            return false
        }

        let all    = gridContainer.columns,
            offset = all.indexOf(columns[0]);

        // A region is one contiguous run of the global collection, so each column takes its slot in turn
        order.forEach((column, index) => {
            let from = all.indexOf(column);

            from !== offset + index && all.move(from, offset + index)
        });

        // `move()` is event-silent: one pass re-derives the regions, the header buttons and the bodies. The buttons'
        // positions are measured once they render in their new order, and this row projects from that measurement.
        gridContainer.onColumnsMutate({});

        await toolbar.measureAfterUpdate();

        return true
    }

    /**
     * @summary Listens for drags on the group cells.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.addDomListeners([
            {'drag:end'  : me.onGroupDragEnd,   scope: me, delegate: '.neo-grid-header-group-cell'},
            {'drag:start': me.onGroupDragStart, scope: me, delegate: '.neo-grid-header-group-cell'}
        ])
    }

    /**
     * @summary Ends a cancelled group drag: nothing moves. The drag zone has already removed its proxy, and a cancel
     * during the pending start removes the late one once that start settles.
     * @param {Object} data
     */
    async onGroupDragCancel(data) {
        let me   = this,
            drag = me.#drag;

        if (drag) {
            me.#drag   = null;
            drag.ended = true;

            await drag.started;

            me.dragZone?.dragEnd({...data, cancelled: true})
        }
    }

    /**
     * @summary Drops the dragged group: its proxy goes, and its leaves move to the release's slot. A release during
     * the pending start waits for it, so the late proxy goes with the drop. A cancelled drag never ends here.
     * @param {Object} data
     */
    async onGroupDragEnd(data) {
        let me   = this,
            drag = me.#drag;

        if (drag) {
            me.#drag   = null;
            drag.ended = true;

            await drag.started
        }

        me.dragZone?.dragEnd(data);

        drag && await me.moveGroup(drag, data.clientX)
    }

    /**
     * @summary Starts a group drag: the cell becomes its group's proxy, held to its region's part of this row.
     * The start waits on the drag zone and on the main thread, so a release or a cancel can end the gesture first.
     * @param {Object} data
     */
    async onGroupDragStart(data) {
        let me    = this,
            cell  = data.path?.find(node => me.cellGroups.has(node.id)),
            group = cell && me.cellGroups.get(cell.id),
            drag, dragZone, element;

        if (!group) {
            return
        }

        drag     = me.#drag = {...group, ended: false, started: null};
        dragZone = await me.#dragZoneReady;

        if (!dragZone || me.isDestroyed) {
            me.#drag === drag && (me.#drag = null);
            return
        }

        // Released while the zone loaded: the release already dropped the group, and no proxy ever appears
        if (drag.ended) {
            return
        }

        element = VDomUtil.find(me.vdom, cell.id)?.vdom;

        dragZone.boundaryContainerId = me.gridContainer.getGroupHeaderPartId(drag.region);
        dragZone.dragElement         = element;
        // The proxy component's own `text` config owns its root text, so the label travels as that config
        dragZone.dragProxyConfig     = {text: element?.text};

        drag.started = dragZone.dragStart(data);

        await drag.started
    }

    /**
     * @summary Rebuilds every region's group cells from its columns and its body's `columnPositions`.
     *
     * One part per region toolbar, in the toolbars' order, so the parts and the toolbars occupy the same grid columns.
     * A part clips its cells and an empty track as wide as its region's columns, so the centre part scrolls as far as
     * the leaves do. The cells sit in the part itself: a reorder moves them inside the scrolled element, whose scroll
     * {@link Neo.main.DeltaUpdates#flushLayoutHeals} keeps, while it would reset the scroll of a scrolled ancestor. A
     * cell's `aria-colindex` is its first column's grid-wide index, and its `aria-colspan` its column count. A cell is
     * draggable while its region's toolbar is `dragResortable`.
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

        let scrolled = new Map(me.vdom.cn.map(part => [part.id, part.scrollLeft])),
            toolbars = headerWrapper.getToolbars();

        me.cellGroups.clear();

        toolbars.some(toolbar => toolbar.dragResortable) && (me.#dragZoneReady ??= me.createDragZone());

        me.vdom.cn = toolbars.map(toolbar => {
            let region = toolbar.layoutLock || 'center',
                id     = gridContainer.getGroupHeaderPartId(region),
                offset = toolbar.ariaColumnOffset,
                cls    = toolbar.dragResortable ? ['neo-grid-header-group-cell', 'neo-draggable'] : ['neo-grid-header-group-cell'],
                cells  = GroupRow.getUnits(me.getRegionColumns(region), toolbar.body?.columnPositions).filter(unit => unit.group);

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

                    me.cellGroups.set(cellId, {groupId: group.id, region});

                    return {
                        id             : cellId,
                        cls            : [...cls],
                        role           : 'columnheader',
                        'aria-colindex': offset + index + 1,
                        'aria-colspan' : columns.length,
                        style          : {left: `${x}px`, width: `${width}px`},
                        text           : group.text
                    }
                })]
            }
        });

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
