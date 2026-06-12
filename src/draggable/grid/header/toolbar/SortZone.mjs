import BaseSortZone from '../../../container/SortZone.mjs';
import VdomUtil from '../../../../util/VDom.mjs';

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
     * Creates the drag proxy.
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

        let me = this,
            grid = me.owner.gridContainer,
            body = me.gridBody,
            viewId = Neo.getId('grid-view'),
            columnIndex = me.dragElement['aria-colindex'] - 1,
            { dataField } = body.columnPositions.getAt(columnIndex),
            cells = body.getColumnCells(dataField),
            rows = [],
            config = await super.createDragProxy(data, false),
            rect = await grid.getDomRect(),
            row, rowComponent;

        config.cls = ['neo-grid-container', me.owner.getTheme()];

        config.style.height = `${rect.height - 2}px`; // minus border-bottom & border-top

        let moveDeltas = [],
            proxyCell, proxyCellId;

        me.movedComponents = [];

        cells.forEach((cell, index) => {
            rowComponent = body.items[index];

            row = VdomUtil.clone({ // clone to remove ids
                cls: rowComponent.vdom.cls,
                style: rowComponent.vdom.style
            });

            proxyCell = VdomUtil.clone(cell);
            delete proxyCell.id;
            delete proxyCell.style.left;

            proxyCellId = Neo.getId('proxy-cell');
            proxyCell.id = proxyCellId;

            if (cell.cn && cell.cn.length > 0) {
                let content = cell.cn[0],
                    contentId = content.id || content.componentId;

                if (contentId) {
                    proxyCell.cn = [];

                    moveDeltas.push({
                        action: 'moveNode',
                        id: contentId,
                        index: 0,
                        parentId: proxyCellId
                    });

                    me.movedComponents.push({
                        id: contentId,
                        originalParentId: cell.id
                    })
                }
            }

            row.cn = [proxyCell];
            rows.push(row)
        });

        config.vdom =
        {
            cn: [
                {
                    cls: ['neo-grid-container', ...grid.cls], cn: [
                        { ...config.vdom, cls: ['neo-grid-header-toolbar', 'neo-toolbar'] },
                        {
                            cls: ['neo-grid-view'], id: viewId, cn: [
                                { cls: ['neo-grid-body'], cn: rows },
                                { cls: ['neo-grid-scrollbar'], style: { height: body.vdom.height } }
                            ]
                        }
                    ]
                }
            ]
        };

        config.listeners = {
            mounted() {
                Neo.main.DomAccess.scrollTo({
                    id: viewId,
                    value: body.scrollTop,
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
     * @param {Number} fromIndex
     * @param {Number} toIndex
     */
    moveTo(fromIndex, toIndex) {
        super.moveTo(fromIndex, toIndex);

        // super.moveTo reorders the owner toolbar's own items (local space); the global columns
        // collection needs the locked-region offset so center / end toolbars move the right columns.
        let offset          = this.columnIndexOffset(),
            {gridContainer} = this.owner;

        gridContainer.columns.move(fromIndex + offset, toIndex + offset);

        // collection.move() is event-silent (no mutate fires), so the region-grouped column
        // arrays — the engine's region+index oracle — must refresh explicitly here.
        gridContainer.refreshRegionColumns()
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
                action: 'moveNode',
                id: item.id,
                index: 0,
                parentId: item.originalParentId
            }));

            await Neo.applyDeltas(me.windowId, restoreDeltas);
            me.movedComponents = null
        }

        await super.processDragEnd(data);

        if (!me.dragElement) {
            return
        }

        let { owner } = me,
            grid = owner.gridContainer,
            { columns } = grid,
            column = null,
            toIndex = -1,
            newLocked = null,
            i = 0,
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
            if (Neo.isNumber(me.lastDragClientX) && me.regionRects) {
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
                item.vdom['aria-colindex'] = index + 1 // 1 based
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
        // the restore has settled.
        if (owner.scrollLeft > 0) {
            await me.timeout(30);

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

        await super.onDragMove(data)
    }

    /**
     * @param {Object} data
     */
    async onDragStart(data) {
        let me = this;

        // Avoid conflicts with grid.header.plugin.Resizable
        if (!me.owner.dragResortable) return;

        // Freeze the drag-start scroll BEFORE the base class snapshots and adjusts the item and
        // proxy rects: adjustProxyRectToParent re-bases them all into owner-content space with it.
        me.dragStartScrollLeft = me.owner.scrollLeft || 0;

        await super.onDragStart(data);

        // Capture the dragged column's identity at drag-start. `aria-colindex` is toolbar-local
        // AND stale after the drop, so the global columns collection can only be safely indexed
        // by re-resolving the dragged column itself at drag-end.
        me.dragColumnField = me.dragComponent?.dataField || null;

        // Snapshot the locked-body rects BEFORE any mid-drag re-flow: hiding the dragged column's
        // cells re-flows the locked bodies, so a drag-end read can place an in-region release
        // outside its own (shrunken) region body and silently eject the column.
        let grid = me.owner.gridContainer;

        if (grid.bodyStart || grid.bodyEnd) {
            me.regionRects = {
                start: grid.bodyStart ? await grid.bodyStart.getDomRect() : null,
                end  : grid.bodyEnd   ? await grid.bodyEnd.getDomRect()   : null
            }
        }

        if (me.dragComponent && me.moveColumnContent) {
            let body = me.gridBody,
                columnIndex = me.dragElement['aria-colindex'] - 1,
                columnPosition = body.columnPositions.getAt(columnIndex),
                { dataField } = columnPosition,
                cells = body.getColumnCells(dataField);

            columnPosition.hidden = true;

            cells.forEach(cell => {
                cell.style.visibility = 'hidden'
            });

            // Force a deep update to propagate Row component VDOM changes (visibility) to the worker.
            body.updateDepth = -1;
            body.update()
        }

        // Scroll-extent sentinel: with the items absolutised, the toolbar's scrollable overflow
        // is defined purely by their boxes — every switch reflow can shrink it, and the browser
        // then clamps the element's native scrollLeft below the true scroll position. The owner
        // must NOT be expanded to content size (it has to stay a real scroll container — see
        // `expandOwnerOnDrag` in the base class), so instead a 1px absolute node pins the
        // pre-drag content extent for the duration of the drag. The clamp becomes impossible:
        // max scroll never shrinks, headers and cells stay on the same scroll truth through
        // every switch and switch-back. processDragEnd removes it before the layout restore.
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

            me.owner.update()
        }
    }

    /**
     * @param {Number} index1
     * @param {Number} index2
     */
    switchItems(index1, index2) {
        super.switchItems(index1, index2);

        let me = this;

        if (me.moveColumnContent) {
            let { itemRects } = me,
                body = me.gridBody,
                { columnPositions } = body,
                column1Position = columnPositions.getAt(index1),
                column2Position = columnPositions.getAt(index2),
                column1Cells = body.getColumnCells(column1Position.dataField),
                column2Cells = body.getColumnCells(column2Position.dataField);

            Object.assign(column1Position, {
                width: itemRects[index2].width,
                x: itemRects[index2].x
            });

            Object.assign(column2Position, {
                width: itemRects[index1].width,
                x: itemRects[index1].x
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
}

export default Neo.setupClass(SortZone);
