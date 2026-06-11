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
            // Optimistic worker-side mirror: afterSetScrollLeft feeds the SortZone term BEFORE the
            // DOM scroll-event echo arrives via grid.ScrollManager (which re-sets the same value).
            me.scrollLeft = target;

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
