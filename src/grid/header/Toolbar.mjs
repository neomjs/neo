import BaseToolbar from '../../toolbar/Base.mjs';

/**
 * @class Neo.grid.header.Toolbar
 * @extends Neo.toolbar.Base
 */
class Toolbar extends BaseToolbar {
    static config = {
        /**
         * @member {String} className='Neo.grid.header.Toolbar'
         * @protected
         */
        className: 'Neo.grid.header.Toolbar',
        /**
         * @member {String} ntype='grid-header-toolbar'
         * @protected
         */
        ntype: 'grid-header-toolbar',
        /**
         * @member {String[]} baseCls=['neo-grid-header-toolbar','neo-toolbar']
         */
        baseCls: ['neo-grid-header-toolbar', 'neo-toolbar'],
        /**
         * @member {Boolean} dragResortable=true
         * @reactive
         */
        dragResortable: true,
        /**
         * @member {Neo.grid.Container|null} gridContainer=null
         * @protected
         */
        gridContainer: null,
        /**
         * @member {Object} itemDefaults={ntype: 'grid-header-button'}
         * @reactive
         */
        itemDefaults: {
            ntype: 'grid-header-button'
        },
        /**
         * The section of the multi-body layout this toolbar belongs to.
         * Valid values: 'start', 'end', or null (center).
         * @member {String|null} layoutLock=null
         * @protected
         */
        layoutLock: null,
        /**
         * @member {String} role='row'
         * @reactive
         */
        role: 'row',
        /**
         * Worker-side mirror of the grid's horizontal scroll position (absolute, in center-content
         * pixels). Fed by `grid.ScrollManager#onContainerScroll` on every horizontal scroll, and
         * optimistically by {@link #scrollToIndex} during drag overdrag. {@link #afterSetScrollLeft}
         * forwards it into the column-drag SortZone's scroll-correction term. The DOM-side header
         * scroll itself is synced main-thread by `Neo.main.addon.GridHorizontalScrollSync`.
         * @member {Number} scrollLeft_=0
         * @reactive
         */
        scrollLeft_: 0,
        /**
         * @member {Boolean} showHeaderFilters_=false
         * @reactive
         */
        showHeaderFilters_: false,
        /**
         * Convenience shortcut to pass sortable to all toolbar items.
         * If set to true, header clicks will sort the matching column (ASC, DESC, null)
         * @member {Boolean} sortable_=true
         * @reactive
         */
        sortable_: true,
        /**
         * Convenience shortcut to pass useTriStateSorting to all toolbar items.
         * True enables restoring the initial sort state (ASC, DESC, null)
         * @member {Boolean} useTriStateSorting_=false
         * @reactive
         */
        useTriStateSorting_: false,
        /**
         * @member {Object} _vdom
         */
        _vdom:
            { 'aria-rowindex': 1, cn: [{ cn: [] }] }
    }

    /**
     * The latest scroll value commanded by {@link #scrollToIndex} and not yet confirmed by its
     * pipeline echo. While set (and a drag is active), {@link #beforeSetScrollLeft} rejects any
     * non-matching incoming write as a stale out-of-order echo. Null when no command is in
     * flight; self-clears on the first write outside an active drag.
     * @member {Number|null} pendingScrollTarget=null
     * @protected
     */
    pendingScrollTarget = null

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        value && this.passSizeToBody()
    }

    /**
     * Triggered after the showHeaderFilters config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowHeaderFilters(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            me.items.forEach(item => {
                item.setSilent({
                    showHeaderFilter: value
                })
            });

            me.updateDepth = -1; // filters can be deeply nested
            me.update()
        }
    }

    /**
     * Triggered after the scrollLeft config got changed.
     * Forwards the absolute scroll position into the column-drag SortZone's correction term.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetScrollLeft(value, oldValue) {
        let {sortZone} = this;

        if (oldValue !== undefined && sortZone) {
            sortZone.scrollLeft = value;

            // Term observability while a drag is in flight (itemRects = the mid-drag marker)
            sortZone.itemRects && sortZone.traceEvent({t: 'scrollSync', sl: value})
        }
    }

    /**
     * Command/echo reconciliation for the drag overdrag loop. While a drag is active and a
     * commanded scroll is in flight ({@link #scrollToIndex} records it), incoming config writes
     * are echoes from the scroll pipeline — and echoes can arrive out of order under burst
     * scrolling (one command per walk beat). A stale echo regressing the term re-arms the
     * loop's nearest-math and force-switches the dragged column: a feedback runaway. The gate
     * accepts only the echo matching the latest command; anything else mid-drag is stale and
     * rejected. Outside an active drag the gate is off (and self-clears), so user scrolling is
     * never filtered.
     * @param {Number} value
     * @param {Number} oldValue
     * @returns {Number}
     * @protected
     */
    beforeSetScrollLeft(value, oldValue) {
        let me        = this,
            {pendingScrollTarget, sortZone} = me;

        if (sortZone?.itemRects) {
            // Mid-drag this config is COMMAND-DRIVEN: scrollToIndex() writes the backing field
            // directly and registers its command here; pipeline echoes may only CONFIRM the
            // latest command. Sub-pixel tolerance: browsers may quantize a fractional
            // commanded scrollLeft, so the echo can differ by less than a pixel and be ours.
            if (Neo.isNumber(pendingScrollTarget) && Math.abs(value - pendingScrollTarget) < 1) {
                me.pendingScrollTarget = null;
                return value
            }

            // Everything else mid-drag is stale or foreign — INCLUDING a late echo from an
            // OLDER command arriving after the latest echo already cleared the pending state;
            // accepting it would regress the term and re-arm the overdrag loop.
            return oldValue
        }

        me.pendingScrollTarget = null;
        return value
    }

    /**
     * Triggered after the sortable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetSortable(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            me.items.forEach(item => {
                item.setSilent({
                    sortable: value
                })
            });

            me.updateDepth = 2;
            me.update()
        }
    }

    /**
     * Triggered after the useTriStateSorting config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseTriStateSorting(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            me.items.forEach(item => {
                item.setSilent({
                    useTriStateSorting: value
                })
            });

            me.updateDepth = 2;
            me.update()
        }
    }

    /**
     *
     */
    createItems() {
        let me = this,
            { mounted } = me;

        me.itemDefaults.showHeaderFilter = me.showHeaderFilters;

        me.items.forEach(item => {
            if (!Object.hasOwn(item, 'sortable')) {
                item.sortable = me.sortable
            }

            if (!Object.hasOwn(item, 'useTriStateSorting')) {
                item.useTriStateSorting = me.useTriStateSorting
            }
        });

        super.createItems();

        let { items } = me,
            style;

        items.forEach((item, index) => {
            item.vdom['aria-colindex'] = index + 1; // 1 based

            style = item.wrapperStyle;

            // todo: only add px if number
            if (item.maxWidth) { style.maxWidth = item.maxWidth + 'px' }
            if (item.minWidth) { style.minWidth = item.minWidth + 'px' }
            if (item.width) { style.width = item.width + 'px' }

            item.wrapperStyle = style
        });

        me.promiseUpdate().then(() => {
            // To prevent duplicate calls, we need to check the mounted state before the update call
            mounted && me.passSizeToBody()
        })
    }

    /**
     * @param {Object} config
     */
    createSortZone(config) {
        let me = this;

        Neo.merge(config, {
            boundaryContainerId: [me.id, me.parent.id],
            ignoreDragSelector: '.neo-resizable',
            scrollLeft: me.scrollLeft
        });

        super.createSortZone(config)
    }

    /**
     * @param {String} dataField
     * @returns {Neo.button.Base|null}
     */
    getColumn(dataField) {
        for (const item of this.items) {
            if (item.dataField === dataField) {
                return item
            }
        }

        return null
    }

    /**
     * @returns {Promise<any>}
     */
    loadSortZoneModule() {
        return import('../../draggable/grid/header/toolbar/SortZone.mjs')
    }

    /**
     * @param {Boolean} silent=false
     * @returns {Promise<void>}
     */
    async passSizeToBody(silent = false) {
        let me = this,
            gridContainer = me.gridContainer,
            layoutLock = me.layoutLock,
            body = layoutLock === 'start' ? gridContainer.bodyStart : (layoutLock === 'end' ? gridContainer.bodyEnd : gridContainer.body),
            { items } = me,
            columnPositions = [],
            currentX = 0,
            hasDynamicWidth = false,
            layoutFinished = true,
            i = 0,
            len = items.length,
            item, rects, w, width;

        for (; i < len; i++) {
            item = items[i];
            w = item.width;

            if (item.flex || !w || (Neo.isString(w) && !w.endsWith('px'))) {
                hasDynamicWidth = true;
                break
            }
        }

        if (hasDynamicWidth) {
            rects = await me.getDomRect(items.map(item => item.id));

            // If the css sizing is not done, columns after the first one can get x === firstX
            for (i = 1; i < len; i++) {
                if (rects[i].x === rects[0].x) {
                    layoutFinished = false;
                    break
                }
            }
        }

        // Delay for slow connections, where the container-sizing is not done yet
        if (!layoutFinished) {
            await me.timeout(100);
            await me.passSizeToBody(silent)
        } else {
            if (hasDynamicWidth) {
                for (i = 0; i < len; i++) {
                    columnPositions.push({
                        dataField: items[i].dataField,
                        width: rects[i].width,
                        x: currentX
                    });

                    currentX += rects[i].width
                }
            } else {
                for (i = 0; i < len; i++) {
                    item = items[i];
                    width = item.hidden ? 0 : parseInt(item.width, 10);

                    columnPositions.push({
                        dataField: item.dataField,
                        width,
                        x: currentX
                    });

                    currentX += width
                }
            }

            body.columnPositions.clear();
            body.columnPositions.add(columnPositions);

            body[silent ? 'setSilent' : 'set']({
                availableWidth: currentX
            });

            !silent && body.updateMountedAndVisibleColumns()
        }
    }

    /**
     * @summary Scrolls the grid horizontally so the column slot at `index` becomes fully visible,
     * by driving the dedicated horizontal scrollbar element — the grid's single scroll SSOT.
     *
     * Consumer: the column-drag overdrag loop (`draggable.container.SortZone#scrollToIndex`).
     * Routing through the scrollbar (instead of a scrollIntoView on a header button, which scrolls
     * whatever ancestor can move — in a locked grid that is the grid container, dragging the locked
     * regions off-screen and never re-rendering the body) means the production pipeline performs
     * the sync: `Neo.main.addon.GridHorizontalScrollSync` mirrors the value onto this toolbar's
     * element and the body's `--grid-scroll-left` var in-frame, while `grid.ScrollManager` ingests
     * it for buffered column mounting. Locked regions stay frozen; both scroll directions work.
     *
     * Only the center (unlocked) toolbar scrolls — locked-region toolbars no-op, since their
     * content never overflows their region.
     *
     * @param {Number} index The slot index inside this toolbar
     * @param {Object} [itemRect] The slot's rect in center-content space (the drag snapshot)
     * @param {Number} itemRect.left
     * @param {Number} itemRect.width
     * @returns {Promise<void>}
     */
    async scrollToIndex(index, itemRect) {
        let me = this;

        if (me.layoutLock || !itemRect) {
            return
        }

        let {gridContainer} = me,
            scrollbar       = gridContainer.horizontalScrollbar,
            current         = me.scrollLeft,
            // The center clip width: the grid minus the locked regions (= the scrollbar's scrollport)
            clipWidth       = gridContainer.body.containerWidth
                - (gridContainer.bodyStart?.availableWidth || 0)
                - (gridContainer.bodyEnd?.availableWidth   || 0),
            target          = null;

        if (itemRect.left < current) {
            target = itemRect.left
        } else if (itemRect.left + itemRect.width > current + clipWidth) {
            target = itemRect.left + itemRect.width - clipWidth
        }

        if (scrollbar && target !== null) {
            // Record the command FIRST: beforeSetScrollLeft gates every subsequent config write
            // against it — only the echo matching this latest command passes; out-of-order echoes
            // from earlier commands are rejected (they would regress the term and re-arm the
            // overdrag loop: the runaway switch storm).
            me.pendingScrollTarget = target;

            // Optimistic worker-side mirror, deliberately BYPASSING the config gate (a config
            // write would consume the pending command as if the echo had already arrived): the
            // SortZone term and the backing field update directly; the trace marks the command.
            me._scrollLeft = target;

            if (me.sortZone) {
                me.sortZone.scrollLeft = target;
                me.sortZone.itemRects && me.sortZone.traceEvent({t: 'scrollSync', sl: target})
            }

            await Neo.main.DomAccess.scrollTo({
                direction: 'left',
                id       : scrollbar.id,
                value    : target,
                windowId : me.windowId
            })
        }
    }

    /**
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            ...super.toJSON(),
            scrollLeft: me.scrollLeft,
            showHeaderFilters: me.showHeaderFilters,
            sortable: me.sortable,
            useTriStateSorting: me.useTriStateSorting
        }
    }
}

export default Neo.setupClass(Toolbar);
