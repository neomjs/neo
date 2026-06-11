import BaseContainer from '../../container/Base.mjs';
import Toolbar       from './Toolbar.mjs';

/**
 * @summary The dedicated orchestrator for a grid's header region within the multi-body architecture.
 *
 * `Neo.grid.header.Wrapper` is the header-side counterpart to {@link Neo.grid.View} (which owns the bodies).
 * It is strictly responsible for the lifecycle of the up-to-three header toolbars of a multi-body grid:
 *
 * 1. `headerStart` — the locked-start toolbar (created on demand, owned here).
 * 2. `headerToolbar` — the scrollable centre toolbar (owned as a reactive config by {@link Neo.grid.Container},
 *    placed into this Wrapper for layout).
 * 3. `headerEnd` — the locked-end toolbar (created on demand, owned here).
 *
 * Extracting this responsibility out of `grid.Container` removes header instantiation and column-button
 * orchestration from the macro layout layer, so header concerns no longer thrash unrelated domains (body
 * rendering, selection models) during column mutations. This mirrors `grid.View` owning the body lifecycle.
 *
 * @class Neo.grid.header.Wrapper
 * @extends Neo.container.Base
 */
class Wrapper extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Neo.grid.header.Wrapper'
         * @protected
         */
        className: 'Neo.grid.header.Wrapper',
        /**
         * @member {String} ntype='grid-header-wrapper'
         * @protected
         */
        ntype: 'grid-header-wrapper',
        /**
         * @member {String[]} baseCls=['neo-grid-header-wrapper','neo-header-wrapper']
         * @protected
         */
        baseCls: ['neo-grid-header-wrapper', 'neo-header-wrapper'],
        /**
         * @member {String} flex='none'
         */
        flex: 'none',
        /**
         * Back-reference to the owning grid.Container (the macro layer). The Wrapper reaches up to the
         * container for the column distribution and the centre `headerToolbar` it does not own.
         * @member {Neo.grid.Container|null} gridContainer=null
         */
        gridContainer: null,
        /**
         * The locked-end header toolbar. Created on demand when end-locked columns exist; destroyed once
         * they no longer do. Owned by this Wrapper.
         * @member {Neo.grid.header.Toolbar|null} headerEnd=null
         * @protected
         */
        headerEnd: null,
        /**
         * The locked-start header toolbar. Created on demand when start-locked columns exist; destroyed
         * once they no longer do. Owned by this Wrapper.
         * @member {Neo.grid.header.Toolbar|null} headerStart=null
         * @protected
         */
        headerStart: null,
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         * @protected
         */
        layout: {ntype: 'hbox', align: 'stretch'}
    }

    /**
     * Re-homes and re-orders the column header buttons across the locked-start, centre and locked-end
     * toolbars to match the current column-collection order. Invoked by
     * {@link Neo.grid.Container#onColumnsMutate} after a column mutation.
     *
     * Cross-toolbar moves delegate to {@link Neo.container.Base#insert}, whose cross-parent handling
     * silently detaches the button from its old toolbar (keepMounted) and flushes a single update at
     * the lowest common ancestor (this Wrapper). The vdom diff then sees the move as a move and keeps
     * the DOM node alive — an uncoordinated remove + add pair diffs the two toolbars independently,
     * which destroys the node on the source side before the target side can adopt it.
     * @param {Object[]} lockedStartColumns
     * @param {Object[]} centerColumns
     * @param {Object[]} lockedEndColumns
     */
    applyColumnButtonOrder(lockedStartColumns, centerColumns, lockedEndColumns) {
        let me       = this,
            toolbars = [me.headerStart, me.gridContainer.headerToolbar, me.headerEnd];

        const applyRegion = (columns, toolbar) => {
            columns.forEach((col, targetIndex) => {
                let btn = me.getButton(col.dataField);

                if (btn) {
                    if (btn.parentId !== toolbar.id) {
                        toolbar.insert(targetIndex, btn)
                    } else {
                        let currentIndex = toolbar.indexOf(btn);

                        if (currentIndex !== targetIndex) {
                            toolbar.moveTo(currentIndex, targetIndex)
                        }
                    }
                }
            })
        };

        applyRegion(lockedStartColumns, me.headerStart);
        applyRegion(centerColumns,      me.gridContainer.headerToolbar);
        applyRegion(lockedEndColumns,   me.headerEnd);

        // Buttons carry a toolbar-local aria-colindex, which the header SortZone resolves column
        // positions through at drag start — re-homed and shifted buttons must re-sync it.
        toolbars.forEach(toolbar => {
            if (toolbar) {
                let dirty = false;

                toolbar.items.forEach((item, index) => {
                    if (item.vdom['aria-colindex'] !== index + 1) {
                        item.vdom['aria-colindex'] = index + 1; // 1 based
                        dirty = true
                    }
                });

                if (dirty) {
                    toolbar.updateDepth = 2;
                    toolbar.update()
                }
            }
        })
    }

    /**
     * Returns the header.Button matching a given dataField, searching the locked-start, centre and
     * locked-end toolbars in order.
     * @param {String} dataField
     * @returns {Neo.grid.header.Button|null}
     */
    getButton(dataField) {
        let me = this;

        return me.headerStart?.getColumn(dataField) ||
               me.gridContainer.headerToolbar?.getColumn(dataField) ||
               me.headerEnd?.getColumn(dataField) ||
               null
    }

    /**
     * Creates, updates or destroys the locked-start and locked-end header toolbars to match the current
     * locked-column state, refreshes the centre toolbar buttons, and (re)assembles all toolbars into this
     * Wrapper in left-to-right order. Invoked by {@link Neo.grid.Container#createOrUpdateSubGrids}.
     * @param {Object[]} [lockedStartButtons]
     * @param {Object[]} [centerButtons]
     * @param {Object[]} [lockedEndButtons]
     */
    updateHeaders(lockedStartButtons, centerButtons, lockedEndButtons) {
        let me              = this,
            {gridContainer} = me,
            {centerColumns, headerToolbar, lockedEndColumns, lockedStartColumns, theme, windowId} = gridContainer;

        // --- Center (Default) ---
        if (centerColumns.length > 0 && centerButtons) {
            headerToolbar.items = centerButtons;
            headerToolbar.createItems()
        }

        // --- Start (Left) ---
        if (lockedStartColumns.length > 0) {
            if (!me.headerStart) {
                me.headerStart = Neo.create(Toolbar, {
                    ...headerToolbar.initialConfig,
                    flex      : 'none',
                    gridContainer,
                    items     : lockedStartButtons || [],
                    layoutLock: 'start',
                    parentId  : me.id,
                    theme,
                    windowId
                })
            } else if (lockedStartButtons) {
                me.headerStart.items = lockedStartButtons;
                me.headerStart.createItems()
            }
        } else if (me.headerStart) {
            me.headerStart.destroy();
            me.headerStart = null
        }

        // --- End (Right) ---
        if (lockedEndColumns.length > 0) {
            if (!me.headerEnd) {
                me.headerEnd = Neo.create(Toolbar, {
                    ...headerToolbar.initialConfig,
                    flex      : 'none',
                    gridContainer,
                    items     : lockedEndButtons || [],
                    layoutLock: 'end',
                    parentId  : me.id,
                    theme,
                    windowId
                })
            } else if (lockedEndButtons) {
                me.headerEnd.items = lockedEndButtons;
                me.headerEnd.createItems()
            }
        } else if (me.headerEnd) {
            me.headerEnd.destroy();
            me.headerEnd = null
        }

        // Assemble the header toolbars into the wrapper in left-to-right order.
        let headerItems = [];

        me.headerStart && headerItems.push(me.headerStart);
        headerToolbar  && headerItems.push(headerToolbar);
        me.headerEnd   && headerItems.push(me.headerEnd);

        me.items = headerItems;
        me.createItems()
    }
}

export default Neo.setupClass(Wrapper);
