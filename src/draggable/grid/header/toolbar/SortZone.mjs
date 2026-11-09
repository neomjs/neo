import BaseSortZone from '../../../container/SortZone.mjs';
import VdomUtil     from '../../../../util/VDom.mjs';

/**
 * @summary Manages drag-and-drop column reordering for Grids.
 *
 * This class handles the complexity of visualizing column moves in a highly optimized, multi-threaded environment.
 *
 * **Key Architectural Patterns:**
 *
 * 1.  **Surgical DOM Move (High-Fidelity Proxy):**
 *     For component-based columns (e.g., Sparklines using OffscreenCanvas), creating clones for the drag proxy
 *     is expensive and breaks context. Instead, this class uses `Neo.applyDeltas` to temporarily *move* the
 *     live DOM content (the first child of the cell) from the Grid into the Proxy. This preserves the
 *     component's state and canvas context without overhead. The content is restored to the Grid on drop.
 *
 * 2.  **Disjoint Updates (Deep Refresh):**
 *     The Grid uses disjoint `Neo.grid.Row` components which update silently. To ensure the Grid body
 *     reflects drag operations (like hiding the original column or shuffling cells), this class forces
 *     a deep update (`updateDepth: -1`) on the `Grid.Body`. This flushes the state of all Row components
 *     to the VDOM worker in a single batch.
 *
 * 3.  **Group Units:**
 *     A header group's cell drags the group's whole run of headers as one unit ({@link #startUnitDrag}). The
 *     unit passes whole units only, other groups and ungrouped headers, so it never lands inside another group,
 *     and its proxy shows the group cell over its headers and their cells.
 *
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
         * The owner toolbar is a real horizontal scroll container (clipped by the header wrapper,
         * scrolled in lockstep with the grid via `Neo.main.addon.GridHorizontalScrollSync`).
         * Expanding it to content size mid-drag would destroy its scrollable overflow, so the
         * overdrag scroll would fall through to the grid container — dragging the locked regions
         * off-screen and detaching the body from the scroll pipeline. The absolutely positioned
         * drag items keep the toolbar's scrollable overflow alive instead (their containing block
         * is the toolbar via {@link #positionOwnerRelative}).
         * @member {Boolean} expandOwnerOnDrag=false
         */
        expandOwnerOnDrag: false,
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
        moveVertical: false,
        /**
         * The item rects get converted into owner(toolbar)-relative space via {@link #adjustProxyRectToParent},
         * so the owner toolbar must become the containing block for the drag. In a multi-region (locked
         * columns) grid the toolbars sit at different x-origins inside the positioned grid container —
         * without this, the owner-relative left values resolve against the grid container and every
         * header item renders shifted by its toolbar's own origin.
         * @member {Boolean} positionOwnerRelative=true
         */
        positionOwnerRelative: true
    }

    /**
     * The owner toolbar's absolute scrollLeft at drag start. {@link #adjustProxyRectToParent}
     * re-bases the drag-start snapshot rects (items and proxy alike) from owner-relative into
     * owner-CONTENT space with it, so they align with `columnPositions.x` and the zone's absolute
     * `scrollLeft` term at any mid-drag scroll position.
     * @member {Number} dragStartScrollLeft=0
     * @protected
     */
    dragStartScrollLeft = 0

    /**
     * The run of headers a group drag moves as one unit, `null` while a single header drags
     * @member {{first: Number, groupId: String, head: Object, length: Number}|null} dragUnit=null
     * @protected
     */
    dragUnit = null

    /**
     * Resolves the `grid.Body` paired with this SortZone's owner header toolbar, keyed by the
     * toolbar's `layoutLock` region. The prior single `grid.body` lookup only saw the center body,
     * so locked-column cells — which live in the start / end bodies — were missed once the grid
     * split into separate locked-start / center / locked-end bodies. Mirrors the body resolution
     * in `grid.header.Toolbar`.
     * @returns {Neo.grid.Body}
     */
    get gridBody() {
        let {gridContainer, layoutLock} = this.owner;

        if (layoutLock === 'start') return gridContainer.bodyStart;
        if (layoutLock === 'end')   return gridContainer.bodyEnd;
        return gridContainer.body
    }

    /**
     * @summary Resolves the target lock-region for a column drop by mapping the release x-coordinate
     * against the locked-start / locked-end body x-ranges.
     *
     * The neighbor-based inference in {@link #onDragEnd} keys within-region resorting off the dragged
     * column's siblings, but a cross-toolbar drag (e.g. center → locked-start) is keyed by *where* the
     * pointer is released, not by neighbors. This maps the release x-coordinate to the region whose body
     * it falls within; anything outside the locked bodies resolves to the center (unlocked) region.
     *
     * @param {Number}      dropX             Pointer x-coordinate at release (client space).
     * @param {Object}      regionRects       Per-region client rects; either side may be null when absent.
     * @param {Object|null} regionRects.start Locked-start body rect (`{left, right}`) or null.
     * @param {Object|null} regionRects.end   Locked-end body rect (`{left, right}`) or null.
     * @returns {'start'|'end'|null}          Target lock region, or null for the center (unlocked) region.
     */
    getDropRegion(dropX, regionRects) {
        let {start, end} = regionRects;

        if (start && dropX >= start.left && dropX <= start.right) return 'start';
        if (end   && dropX >= end.left   && dropX <= end.right)   return 'end';

        return null
    }

    /**
     * @summary The owner toolbar's column-index offset into the global `gridContainer.columns` collection.
     *
     * The header splits into start / center / end toolbars, each indexing its own columns from 0,
     * while `gridContainer.columns` is the single global collection that {@link #moveTo} reorders. A
     * locked-region toolbar's local index must therefore be offset by the column counts of the regions
     * that precede it (start → 0; center → start count; end → start + center counts). In the no-locked
     * common case the offset is 0, so single-region grids are unaffected.
     *
     * @returns {Number}
     */
    columnIndexOffset() {
        let {gridContainer, layoutLock} = this.owner;

        if (layoutLock === 'start') return 0;
        if (layoutLock === 'end')   return gridContainer.lockedStartColumns.length + gridContainer.centerColumns.length;
        return gridContainer.lockedStartColumns.length // center
    }

    /**
     * Converts a viewport-space item rect into owner(toolbar)-CONTENT space. The owner toolbar is
     * the containing block during the drag (see {@link #positionOwnerRelative}), so the conversion
     * is the origin subtraction (no border compensation, the toolbar has none) plus the toolbar's
     * drag-start scroll: absolutely positioned children resolve against the padding box and move
     * with the scrolled content, so content-space left values render correctly at any scroll state
     * — and match `columnPositions.x`, which lives in the same space.
     * @param {Neo.util.Rectangle} rect
     * @param {Neo.util.Rectangle} parentRect
     */
    adjustProxyRectToParent(rect, parentRect) {
        rect.x = rect.x - parentRect.x + this.dragStartScrollLeft;
        rect.y = rect.y - parentRect.y
    }

    /**
     * @summary A proxy row's copy of a cell, placed `left` px into the proxy. A cell holding component content gets an
     * empty copy, and the live content moves into it once the proxy mounts.
     * @param {Object}   cell
     * @param {Number}   left
     * @param {Object[]} moveDeltas Collects the content moves
     * @returns {Object}
     * @protected
     */
    cloneProxyCell(cell, left, moveDeltas) {
        let me        = this,
            content   = cell.cn?.[0],
            contentId = content && (content.id || content.componentId),
            proxyCell = VdomUtil.clone(cell);

        proxyCell.id    = Neo.getId('proxy-cell');
        proxyCell.style = {...proxyCell.style, left: `${left}px`};

        if (contentId) {
            proxyCell.cn = [];

            moveDeltas.push({action: 'moveNode', id: contentId, index: 0, parentId: proxyCell.id});
            me.movedComponents.push({id: contentId, originalParentId: cell.id})
        }

        return proxyCell
    }

    /**
     * Creates the drag proxy.
     *
     * The proxy is a slice of the grid: the dragged header over its column's cells. A group unit's proxy shows the
     * group cell over its headers and their columns, each at its offset from the unit's first column.
     *
     * **Surgical DOM Move Implementation:**
     * Detects if a cell contains component content (checking `cell.cn`). If found, it creates an empty
     * container in the proxy's VDOM and schedules a `moveNode` delta to transfer the live content
     * from the Grid to the Proxy after mounting. This bypasses VDOM cloning for heavy components.
     *
     * @param {Object}  data
     * @param {Boolean} createComponent=true
     * @returns {Object|Neo.draggable.DragProxyComponent}
     */
    async createDragProxy(data, createComponent = true) {
        if (!this.moveColumnContent) {
            return await super.createDragProxy(data, createComponent)
        }

        let me         = this,
            {dragUnit} = me,
            grid       = me.owner.gridContainer,
            body       = me.gridBody,
            viewId     = Neo.getId('grid-view'),
            // The dragged buttons name their columns; ARIA attributes are written for assistive technology, never read
            buttons    = me.getDraggedButtons(),
            columns    = buttons.map(button => body.getColumnCells(button.dataField)),
            offsets    = buttons.map((button, index) => me.itemRects[me.startIndex + index].x - me.itemRects[me.startIndex].x),
            config     = await super.createDragProxy(data, false),
            rect       = await grid.getDomRect(),
            moveDeltas = [],
            header, rows;

        config.cls = ['neo-grid-container', me.owner.getTheme()];

        config.style.height = `${rect.height - 2}px`; // minus border-bottom & border-top

        me.movedComponents = [];

        // A column scrolled out of the rendered range has no cells: its slot in the proxy stays empty
        rows = body.items.slice(0, Math.max(...columns.map(cells => cells.length))).map((rowComponent, rowIndex) => ({
            ...VdomUtil.clone({cls: rowComponent.vdom.cls, style: rowComponent.vdom.style}),
            cn: columns.map((cells, index) => cells[rowIndex] && me.cloneProxyCell(cells[rowIndex], offsets[index], moveDeltas)).filter(Boolean)
        }));

        if (dragUnit) {
            let [head] = config.vdom.cn;

            head.style = {...head.style, left: 0, width: '100%'};

            header = [
                {cls: ['neo-grid-header-group-row'], style: {display: 'block'}, cn: [{cls: ['neo-grid-header-group-part'], cn: [head]}]},
                {
                    cls  : ['neo-grid-header-toolbar', 'neo-toolbar'],
                    style: {height: `${me.itemRects[me.startIndex].height}px`, position: 'relative'},
                    cn   : buttons.map((button, index) => {
                        let clone = VdomUtil.clone(button.vdom);

                        clone.style = {
                            ...clone.style,
                            height  : '100%',
                            left    : `${offsets[index]}px`,
                            position: 'absolute',
                            top     : 0,
                            width   : `${me.itemRects[me.startIndex + index].width}px`
                        };

                        return clone
                    })
                }
            ]
        } else {
            header = [{...config.vdom, cls: ['neo-grid-header-toolbar', 'neo-toolbar']}]
        }

        config.vdom = {
            cn: [{
                cls: ['neo-grid-container', ...grid.cls],
                cn : [
                    ...header,
                    {
                        cls: ['neo-grid-view'], id: viewId, cn: [
                            {cls: ['neo-grid-body'], cn: rows},
                            {cls: ['neo-grid-scrollbar'], style: {height: body.vdom.height}}
                        ]
                    }
                ]
            }]
        };

        config.listeners = {
            mounted() {
                Neo.main.DomAccess.scrollTo({
                    id      : viewId,
                    value   : body.scrollTop,
                    windowId: me.windowId
                });

                if (moveDeltas.length > 0) {
                    Neo.applyDeltas(me.windowId, moveDeltas)
                }
            }
        };

        if (createComponent) {
            return me.dragProxy = Neo.create(config)
        }

        return config
    }

    /**
     * @summary Keeps a grouped header's proxy over its group: the main thread clamps the proxy to the part of the
     * group's span that the toolbar shows at its current scroll. An ungrouped header keeps the toolbar's boundary.
     *
     * The span comes from the drag-start rects in owner-content space, so no DOM is read. The zone keeps the toolbar's
     * boundary for itself: an over-drag still scrolls at the toolbar's edges while the group continues beyond them.
     * @returns {Promise<void>}
     */
    async clampProxyToGroup() {
        let me     = this,
            bounds = me.boundaryContainerRect,
            // A group unit is the group: it keeps the toolbar's boundary
            groupId = !me.dragUnit && me.itemRects && bounds && me.getHeaderGroupId(me.currentIndex),
            group, groupLeft, groupRight, left, right, width;

        if (!groupId) {
            return
        }

        group      = me.itemRects.filter((rect, index) => me.getHeaderGroupId(index) === groupId);
        groupLeft  = me.ownerRect.x - me.scrollLeft + Math.min(...group.map(rect => rect.x));
        groupRight = me.ownerRect.x - me.scrollLeft + Math.max(...group.map(rect => rect.x + rect.width));
        width      = me.itemRects[me.currentIndex].width;
        left       = Math.max(bounds.left,  groupLeft);
        right      = Math.min(bounds.right, groupRight);

        // A group scrolled nearly out of view can show less of itself than the proxy is wide: the bound then grows
        // toward where the group continues, so the proxy reaches past the toolbar's edge but never past its group
        if (right - left < width) {
            left  = Math.max(groupLeft, right - width);
            right = Math.min(groupRight, left + width)
        }

        await Neo.main.addon.DragDrop.setConfigs({
            appName              : me.appName,
            windowId             : me.windowId,
            boundaryContainerRect: {
                bottom: bounds.bottom,
                height: bounds.height,
                left,
                right,
                top   : bounds.top,
                width : right - left,
                x     : left,
                y     : bounds.top
            }
        })
    }

    /**
     * @summary Preserves a scrolled header's content extent before the proxy or item lift can shrink it, and clamps a
     * grouped header's proxy to its group once the proxy exists.
     * The base has converted the item rects into owner-content space, but has not yet absolutised the headers.
     * Pin their content extent and wait for that node to reach the DOM before continuing.
     * The existing drag-end path removes the reservation when normal layout takes over again.
     * @param {Object} data The admitted drag-start event.
     * @returns {Promise<void>}
     */
    async dragStart(data) {
        let me = this;

        if (me.dragStartScrollLeft > 0 && me.itemRects?.length) {
            let extent = Math.max(...me.itemRects.map(rect => rect.x + rect.width));

            me.owner.vdom.cn.push({
                cls  : ['neo-sortzone-extent-sentinel'],
                style: {
                    height  : '1px',
                    left    : `${extent - 1}px`,
                    position: 'absolute',
                    top     : 0,
                    width   : '1px'
                }
            });

            await me.owner.promiseUpdate()
        }

        await super.dragStart(data);
        await me.clampProxyToGroup()
    }

    /**
     * @summary Commits a drop: the dragged header moves to `toIndex`, or a group unit's run moves so its first header
     * lands there.
     * @param {Number} fromIndex
     * @param {Number} toIndex
     */
    moveTo(fromIndex, toIndex) {
        let me     = this,
            length = me.dragUnit?.length || 1,
            index;

        // One header at a time, in the order that leaves the run's remaining headers where they were
        if (toIndex < fromIndex) {
            for (index = 0; index < length; index++) {
                me.moveItem(fromIndex + index, toIndex + index)
            }
        } else {
            for (index = length - 1; index >= 0; index--) {
                me.moveItem(fromIndex + index, toIndex + index)
            }
        }

        // collection.move() is event-silent (no mutate fires), so the region-grouped column
        // arrays — the engine's region+index oracle — must refresh explicitly here.
        me.owner.gridContainer.refreshRegionColumns()
    }

    /**
     * @summary Moves one header and its column.
     * @param {Number} fromIndex
     * @param {Number} toIndex
     * @protected
     */
    moveItem(fromIndex, toIndex) {
        super.moveTo(fromIndex, toIndex);

        // super.moveTo reorders the owner toolbar's own items (local space); the global columns
        // collection needs the locked-region offset so center / end toolbars move the right columns.
        this.owner.gridContainer.columns.move(fromIndex + this.columnIndexOffset(), toIndex + this.columnIndexOffset())
    }

    /**
     * Runs exactly once per drag via the {@link Neo.draggable.container.SortZone#onDragEnd} re-entry latch.
     * @param {Object} data
     */
    async processDragEnd(data) {
        let me = this;

        // Avoid conflicts with grid.header.plugin.Resizable
        if (!me.owner.dragResortable) return;

        // Remove the drag-start scroll-extent sentinel before the layout restore: the items
        // re-enter the flow and own the scrollable overflow again from here on.
        let ownerCn       = me.owner.vdom.cn,
            sentinelIndex = ownerCn.findIndex(node => node.cls?.includes('neo-sortzone-extent-sentinel'));

        if (sentinelIndex > -1) {
            ownerCn.splice(sentinelIndex, 1);
            me.owner.update()
        }

        // Restore moved nodes BEFORE destroying the proxy to ensure they return to the Grid.
        if (me.movedComponents?.length > 0) {
            let restoreDeltas = me.movedComponents.map(item => ({
                action  : 'moveNode',
                id      : item.id,
                index   : 0,
                parentId: item.originalParentId
            }));

            await Neo.applyDeltas(me.windowId, restoreDeltas);
            me.movedComponents = null
        }

        // The base shows the dragged header again: a unit's other headers return with it
        me.getDraggedButtons().slice(1).forEach(button => {
            button.isDestroyed || (button.wrapperStyle = {...button.wrapperStyle, visibility: null})
        });

        // The base commits the drop through moveTo, which moves a unit's whole run
        await super.processDragEnd(data);

        me.dragUnit = null;

        // A cancel resolves no column, so the region inference below re-locks none. The body still re-syncs like a
        // drop that moved nothing: the drag's switches moved its cells along with the headers.
        if (data.cancelled) {
            me.dragColumnField = null
        }

        if (!me.dragElement) {
            return
        }

        let { owner }   = me,
            grid        = owner.gridContainer,
            { columns } = grid,
            column      = null,
            toIndex     = -1,
            newLocked   = null,
            i           = 0,
            prevCol, nextCol;

        // Re-resolve the dragged column inside the global collection AFTER super.onDragEnd applied
        // the move. The prior `aria-colindex` read was toolbar-local and pre-drag-stale, so in a
        // locked multi-region grid it indexed an unrelated (often locked) column, whose `locked`
        // config the inference below then mutated — silently corrupting region membership.
        if (me.dragColumnField) {
            for (; i < columns.count; i++) {
                if (columns.getAt(i).dataField === me.dragColumnField) {
                    column  = columns.getAt(i);
                    toIndex = i;
                    break
                }
            }

            me.dragColumnField = null
        }

        if (column) {
            prevCol = toIndex > 0 ? columns.getAt(toIndex - 1) : null;
            nextCol = toIndex < columns.count - 1 ? columns.getAt(toIndex + 1) : null;

            // Inference logic: Default to unlocked unless completely surrounded by a locked zone
            // or placed at the absolute outer edge of a locked zone.
            if (prevCol?.locked === 'start' && nextCol?.locked === 'start') {
                newLocked = 'start'
            } else if (prevCol?.locked === 'end' && nextCol?.locked === 'end') {
                newLocked = 'end'
            } else if (toIndex === 0 && nextCol?.locked === 'start') {
                newLocked = 'start'
            } else if (toIndex === columns.count - 1 && prevCol?.locked === 'end') {
                newLocked = 'end'
            }

            // Positional truth: the release x-coordinate names the target lock-region for EVERY drop —
            // within-region drops included. The earlier only-override-on-difference shape let the
            // neighbor inference unlock a column dropped at the inner edge of its own locked region
            // (prev locked, next unlocked -> null), silently ejecting it. The neighbor-based
            // inference above remains as the fallback when no release coordinate is available.
            // The rects come from the drag-start snapshot: live drag-end rects reflect the mid-drag
            // re-flow (hidden dragged column), not the geometry the user dropped against.
            // A grouped leaf only ever moves inside its group, so it keeps the group's region wherever it is released.
            if (column.headerGroup) {
                newLocked = column.locked
            } else if (Neo.isNumber(me.lastDragClientX) && me.regionRects) {
                newLocked = me.getDropRegion(me.lastDragClientX, me.regionRects)
            }
        }

        me.lastDragClientX = null;
        me.regionRects     = null;

        me.traceEvent({t: 'lockVerdict', field: column?.dataField || null, prev: column?.locked || null, next: newLocked});

        if (column && column.locked !== newLocked) {
            // This implicitly triggers grid.Container#onColumnLockChange,
            // which handles sorting, DOM syncing, and layout calculations.
            column.locked = newLocked
        } else {
            owner.items.forEach((item, index) => {
                item.vdom['aria-colindex'] = index + 1 + owner.ariaColumnOffset // 1 based, grid-wide
            });

            owner.updateDepth = 2;
            owner.update();

            await owner.passSizeToBody();

            await this.timeout(20);

            me.gridBody.createViewData(false, true)
        }

        // Scrolled-state drop re-sync: restoring the items out of `position: absolute` passes
        // through a reflow frame where the owner toolbar has no scrollable overflow, so the
        // browser clamps the toolbar element's native scrollLeft to 0 — while the dedicated
        // scrollbar element and the body's scroll var still hold the drop-time value (the addon
        // only re-copies on scrollbar scroll EVENTS, and a same-value scrollTo fires none).
        // Until the next manual scroll, headers and cells render offset by the full scroll
        // amount, and a drag started in that window has its term contradict the toolbar's
        // actual position. Re-apply the worker-side scroll truth to the toolbar element once
        // the restore has settled: its own update above can still be in flight.
        if (owner.scrollLeft > 0) {
            await owner.promiseUpdate();

            await Neo.main.DomAccess.scrollTo({
                direction: 'left',
                id       : owner.id,
                value    : owner.scrollLeft,
                windowId : me.windowId
            })
        }
    }

    /**
     * @param {Object} data
     */
    async onDragMove(data) {
        let me = this;

        // Avoid conflicts with grid.header.plugin.Resizable
        if (!me.owner.dragResortable) return;

        // Track the release x-coordinate so onDragEnd can resolve the cross-toolbar drop region.
        me.lastDragClientX = data.clientX;

        // Past its group's edge a grouped header waits in the edge's slot. Never while an over-drag step awaits its
        // scroll, the step decides then, and never before the gesture's own boundary arrives: like every other switch,
        // the walk waits for the start to finish, and a start still queued keeps the move for its replay (super). A
        // group unit has no group around it to overflow.
        let side = me.isScrolling || me.dragUnit || me.dragStartPending || !me.boundaryContainerRect ? 0 : me.groupOverflow(data.clientX);

        if (side) {
            me.moveToGroupEdge(side);
            return
        }

        await super.onDragMove(data)
    }

    /**
     * @param {Object} data
     */
    async onDragStart(data) {
        if ([...(data.targetPath || []), ...data.path].some(node => node.cls?.includes('neo-grid-menu-trigger'))) return;

        let me = this;

        // Avoid conflicts with grid.header.plugin.Resizable
        if (!me.owner.dragResortable) return;

        // Freeze the drag-start scroll BEFORE the base class snapshots and adjusts the item and
        // proxy rects: adjustProxyRectToParent re-bases them all into owner-content space with it.
        me.dragStartScrollLeft = me.owner.scrollLeft || 0;

        await super.onDragStart(data);

        // A start the base refused leaves no unit behind
        if (!me.itemRects) {
            me.dragUnit = null;
            return
        }

        // Capture the dragged column's identity at drag-start. Indices go stale with the drop, so the
        // global columns collection can only be safely indexed by re-resolving the dragged column
        // itself at drag-end. A group unit never leaves its region, so it resolves none.
        me.dragColumnField = me.dragUnit ? null : me.dragComponent?.dataField || null;

        // Snapshot the locked-body rects BEFORE any mid-drag re-flow: hiding the dragged column's
        // cells re-flows the locked bodies, so a drag-end read can place an in-region release
        // outside its own (shrunken) region body and silently eject the column.
        let grid    = me.owner.gridContainer,
            buttons = me.getDraggedButtons();

        if (!me.dragUnit && (grid.bodyStart || grid.bodyEnd)) {
            me.regionRects = {
                start: grid.bodyStart ? await grid.bodyStart.getDomRect() : null,
                end  : grid.bodyEnd   ? await grid.bodyEnd.getDomRect()   : null
            }
        }

        // The base hides the dragged header: a unit's other headers leave the row with it, and its group cell too, since
        // the proxy carries both
        buttons.slice(1).forEach(button => {
            button.wrapperStyle = {...button.wrapperStyle, visibility: 'hidden'}
        });

        me.dragUnit && grid.headerWrapper?.groupRow?.project();

        if (me.dragComponent && me.moveColumnContent) {
            let body = me.gridBody;

            buttons.forEach(({dataField}) => {
                body.columnPositions.get(dataField).hidden = true;

                body.getColumnCells(dataField).forEach(cell => {
                    cell.style.visibility = 'hidden'
                })
            });

            // Force a deep update to propagate Row component VDOM changes (visibility) to the worker.
            body.updateDepth = -1;
            body.update()
        }
    }

    /**
     * @summary Starts a group drag: the group's run of headers moves as one unit, under a proxy headed by its group
     * cell. The unit passes whole units only, so it never lands inside another group, and the drop commits the order
     * the drag previewed.
     * @param {Object} data The group cell's drag start event
     * @param {Object} unit
     * @param {Number} unit.first   The run's first header, as an index into this toolbar's items
     * @param {String} unit.groupId
     * @param {Object} unit.head    The group cell's vdom, which the proxy and the drag geometry start from
     * @param {Number} unit.length  The run's header count
     * @returns {Promise<void>}
     */
    async startUnitDrag(data, unit) {
        // The last drag's end clears its unit, so this one is set once that end has run
        await this.startDrag(data, () => {this.dragUnit = unit})
    }

    /**
     * @summary The header group of the header at a drag position, `null` outside any group.
     * @param {Number} index A position in the drag's current order
     * @returns {String|null}
     */
    getHeaderGroupId(index) {
        let me     = this,
            button = me.ownerItems?.[me.indexMap?.[index]];

        // The column carries the group: the header button is only its view
        return me.owner.gridContainer?.columns?.get(button?.dataField)?.headerGroup?.id ?? null
    }

    /**
     * @summary Where an ungrouped header lands when it steps toward a grouped neighbour: past that group's last header.
     * @param {Number} index     The dragged header's position
     * @param {Number} neighbour The position next to it, in the drag's direction
     * @returns {Number} `neighbour` itself, unless an ungrouped header meets a group
     */
    getSwitchTarget(index, neighbour) {
        let me      = this,
            groupId = me.getHeaderGroupId(neighbour),
            step    = Math.sign(neighbour - index),
            target  = neighbour;

        if (groupId && !me.getHeaderGroupId(index)) {
            while (me.getHeaderGroupId(target + step) === groupId) {
                target += step
            }
        }

        return target
    }

    /**
     * @summary The whole unit next to a dragged group unit: another group's run, or one ungrouped header.
     * @param {Number} start The unit's first position
     * @param {Number} step  -1 for the unit before it, 1 for the one after it
     * @returns {{from: Number, to: Number}|null} Its first and last positions, `null` at the toolbar's edge
     */
    getNeighbourUnit(start, step) {
        let me    = this,
            first = step < 0 ? start - 1 : start + me.dragUnit.length,
            groupId, last;

        if (first < 0 || first >= me.itemRects.length) {
            return null
        }

        groupId = me.getHeaderGroupId(first);
        last    = first;

        while (groupId && me.getHeaderGroupId(last + step) === groupId) {
            last += step
        }

        return {from: Math.min(first, last), to: Math.max(first, last)}
    }

    /**
     * @summary An ungrouped header has to travel past a whole group before it switches with it, and a group unit past
     * the whole unit next to it.
     * @param {Number} index     The dragged header's position, a unit's first one
     * @param {Number} neighbour The position next to it, in the drag's direction
     * @returns {Number}
     */
    getSwitchExtent(index, neighbour) {
        let me = this;

        if (me.dragUnit) {
            let unit = me.getNeighbourUnit(index, Math.sign(neighbour - index));

            return unit ? me.itemRects[unit.to].x + me.itemRects[unit.to].width - me.itemRects[unit.from].x : Infinity
        }

        let target = me.getSwitchTarget(index, neighbour);

        if (target === neighbour) {
            return super.getSwitchExtent(index, neighbour)
        }

        let [first, last] = [me.itemRects[neighbour], me.itemRects[target]].sort((a, b) => a.x - b.x);

        return last.x + last.width - first.x
    }

    /**
     * @summary Which side of its group the pointer of a grouped header's drag is on: `-1` before the group's first
     * header, `1` past its last one, `0` over the group or for an ungrouped header.
     *
     * Past an edge the header waits in that edge's slot ({@link #moveToGroupEdge}), under its clamped proxy. The span is
     * measured in the toolbar's content space, so an over-drag past the visible edge keeps reordering while the group
     * continues beyond it.
     * @param {Number} clientX
     * @returns {Number}
     */
    groupOverflow(clientX) {
        let me          = this,
            {itemRects} = me,
            groupId     = itemRects && Neo.isNumber(clientX) && me.getHeaderGroupId(me.currentIndex),
            group, x;

        if (!groupId) {
            return 0
        }

        x     = clientX - me.ownerRect.x + me.scrollLeft;
        group = itemRects.filter((rect, index) => me.getHeaderGroupId(index) === groupId);

        return x < Math.min(...group.map(rect => rect.x)) ? -1 : x > Math.max(...group.map(rect => rect.x + rect.width)) ? 1 : 0
    }

    /**
     * @summary Walks a grouped header to its group's first (`side` -1) or last (`side` 1) slot, where its clamped proxy
     * rests while the pointer is past that edge. A release there keeps the slot.
     * @param {Number} side -1 or 1
     * @protected
     */
    moveToGroupEdge(side) {
        let me      = this,
            groupId = me.getHeaderGroupId(me.currentIndex),
            index;

        // Neither an over-drag's auto-scroll loop nor the duplicate-move guard may outlive the walk
        me.isOverDragging = false;
        me.lastInBoundX   = me.lastInBoundY = null;

        while (me.getHeaderGroupId(me.currentIndex + side) === groupId) {
            index = me.currentIndex;

            me.currentIndex += side;
            me.switchItems(index, me.currentIndex);

            // A refused switch would spin here forever
            if (me.currentIndex === index) {
                break
            }
        }
    }

    /**
     * @summary Swaps two neighbouring headers, and their body cells along with them.
     * @param {Number} index1
     * @param {Number} index2
     */
    swapNeighbours(index1, index2) {
        let me = this;

        super.switchItems(index1, index2);

        if (me.moveColumnContent) {
            let { itemRects }       = me,
                body                = me.gridBody,
                { columnPositions } = body,
                column1Position     = columnPositions.getAt(index1),
                column2Position     = columnPositions.getAt(index2),
                column1Cells        = body.getColumnCells(column1Position.dataField),
                column2Cells        = body.getColumnCells(column2Position.dataField);

            Object.assign(column1Position, {
                width: itemRects[index2].width,
                x    : itemRects[index2].x
            });

            Object.assign(column2Position, {
                width: itemRects[index1].width,
                x    : itemRects[index1].x
            });

            columnPositions.move(index1, index2);

            column1Cells.forEach(node => {
                node.style.left = column1Position.x + 'px';
                node.style.width = column1Position.width + 'px'
            });

            column2Cells.forEach(node => {
                node.style.left = column2Position.x + 'px';
                node.style.width = column2Position.width + 'px'
            });

            // Force a deep update to propagate Row component VDOM changes (position) to the worker.
            body.updateDepth = -1;
            body.update()
        }
    }

    /**
     * @summary Moves the dragged header to its neighbour's position, keeping every header group in one piece.
     *
     * A grouped header only switches inside its group, and an ungrouped one passes a whole group in one switch, so a
     * group never splits around a header that does not belong to it. `onDragMove` advances `currentIndex` to `index2`
     * before it asks for the switch, and the drop commits to `currentIndex`: a refused switch moves it back to `index1`,
     * the dragged header's own position, and a switch past a group moves it on to the group's far end.
     * @param {Number} index1 The dragged header's position
     * @param {Number} index2 The position next to it, in the drag's direction
     */
    switchItems(index1, index2) {
        let me      = this,
            groupId = me.getHeaderGroupId(index1),
            step    = Math.sign(index2 - index1),
            index, target;

        if (me.dragUnit) {
            me.switchUnit(index1, step);
            return
        }

        if (groupId && groupId !== me.getHeaderGroupId(index2)) {
            me.currentIndex = index1;
            return
        }

        target = me.getSwitchTarget(index1, index2);

        for (index = index1; index !== target; index += step) {
            me.swapNeighbours(index, index + step)
        }

        me.currentIndex = target
    }

    /**
     * @summary Moves a group unit past the whole unit next to it: each of that unit's headers steps across the run,
     * nearest first, so both slide as blocks and keep their order.
     * @param {Number} start The unit's first position
     * @param {Number} step  -1 toward the start, 1 toward the end
     */
    switchUnit(start, step) {
        let me        = this,
            {length}  = me.dragUnit,
            neighbour = me.getNeighbourUnit(start, step),
            count, index, position;

        if (!neighbour) {
            me.currentIndex = start;
            return
        }

        count = neighbour.to - neighbour.from + 1;

        if (step < 0) {
            for (index = neighbour.to; index >= neighbour.from; index--) {
                for (position = index; position < index + length; position++) {
                    me.swapNeighbours(position, position + 1)
                }
            }
        } else {
            for (index = neighbour.from; index <= neighbour.to; index++) {
                for (position = index; position > index - length; position--) {
                    me.swapNeighbours(position - 1, position)
                }
            }
        }

        me.currentIndex = start + step * count;

        // The group cells follow their leaves' live positions, so the passed group slides with its leaves
        me.owner.gridContainer?.headerWrapper?.groupRow?.project()
    }

    /**
     * @summary The headers a drag moves: the dragged one, or a group unit's run.
     * @returns {Neo.component.Base[]}
     * @protected
     */
    getDraggedButtons() {
        let {dragComponent, dragUnit, ownerItems} = this;

        if (dragUnit) {
            return ownerItems.slice(dragUnit.first, dragUnit.first + dragUnit.length)
        }

        return dragComponent ? [dragComponent] : []
    }

    /**
     * @summary A group unit's drag starts on its group cell: the cell is the drag element, so the drag geometry and
     * the proxy start from it.
     * @param {Neo.component.Base} draggedItem
     * @param {Object|null}        handleNode
     * @returns {Object}
     */
    getDragElement(draggedItem, handleNode=null) {
        return this.dragUnit?.head || super.getDragElement(draggedItem, handleNode)
    }

    /**
     * @summary A group unit drags its run's first header: the run follows it.
     * @param {Object} data
     * @returns {Neo.component.Base|null}
     */
    resolveDraggedItem(data) {
        let {dragUnit} = this;

        return dragUnit ? this.owner.items[dragUnit.first] : super.resolveDraggedItem(data)
    }
}

export default Neo.setupClass(SortZone);
