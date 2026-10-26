import BaseContainer from '../../container/Base.mjs';

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
     * @summary Registers main-thread context-menu prevention when a detached grid is attached or moved to a window.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        if (value && this.hasColumnMenus()) {
            Neo.main.DomEvents.registerPreventDefaultTargets({
                cls: 'neo-grid-menu-hint', name: 'contextmenu', windowId: value
            })
        }
    }

    /**
     * @summary Installs delegated header context-menu and keyboard listeners for menu-disabled column hints.
     */
    onConstructed() {
        super.onConstructed();

        this.addDomListeners([
            {contextmenu: this.onHeaderContextMenu, scope: this},
            {keydown: {fn: this.onHeaderKeyDown, scope: this, bubble: true}}
        ])
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
     *
     * Each button takes its column's `locked` as it is placed, so its region class follows a runtime lock change.
     * @param {Object[]} lockedStartColumns
     * @param {Object[]} centerColumns
     * @param {Object[]} lockedEndColumns
     */
    applyColumnButtonOrder(lockedStartColumns, centerColumns, lockedEndColumns) {
        let me = this;

        const applyRegion = (columns, toolbar) => {
            columns.forEach((col, targetIndex) => {
                let btn = me.getButton(col.dataField);

                if (btn) {
                    btn.locked = col.locked;

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
        me.getToolbars().forEach(toolbar => {
            let dirty = false;

            toolbar.items.forEach((item, index) => {
                let root = item.getVdomRoot();

                if (root['aria-colindex'] !== index + 1) {
                    root['aria-colindex'] = index + 1; // 1 based
                    dirty = true
                }
            });

            if (dirty) {
                toolbar.updateDepth = 2;
                toolbar.update()
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
     * @summary The header toolbars from left to right: locked start, centre, locked end. Absent regions are skipped.
     * Header-wide state (sort, header settings) walks these, so a locked column never misses it.
     * @returns {Neo.grid.header.Toolbar[]}
     */
    getToolbars() {
        let me = this;

        return [me.headerStart, me.gridContainer.headerToolbar, me.headerEnd].filter(Boolean)
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
        let me                                                                                    = this,
            {gridContainer}                                                                       = me,
            {centerColumns, headerToolbar, lockedEndColumns, lockedStartColumns, theme, windowId} = gridContainer,
            // A locked toolbar is the center toolbar's class with its configs, holding the locked buttons.
            // The clone starts from construction configs, so the header-wide ones take the center's current values.
            lockedToolbar   = (items, layoutLock) => Neo.cloneNeoInstance(headerToolbar, {
                flex              : 'none',
                gridContainer,
                items,
                layoutLock,
                parentId          : me.id,
                reference         : null,
                showHeaderFilters : headerToolbar.showHeaderFilters,
                sortable          : headerToolbar.sortable,
                theme,
                useTriStateSorting: headerToolbar.useTriStateSorting,
                windowId
            }),
            destroyReplacedButtons = (toolbar, nextButtons) => {
                if (toolbar?.items) {
                    for (const item of toolbar.items) {
                        if (item?.destroy && !nextButtons?.includes(item)) {
                            item.destroy()
                        }
                    }
                }
            };

        // --- Center (Default) ---
        if (centerColumns.length > 0 && centerButtons) {
            destroyReplacedButtons(headerToolbar, centerButtons);
            headerToolbar.items = centerButtons;
            headerToolbar.createItems()
        }

        // --- Start (Left) ---
        if (lockedStartColumns.length > 0) {
            if (!me.headerStart) {
                me.headerStart = lockedToolbar(lockedStartButtons || [], 'start')
            } else if (lockedStartButtons) {
                destroyReplacedButtons(me.headerStart, lockedStartButtons);
                me.headerStart.items = lockedStartButtons;
                me.headerStart.createItems()
            }
        }

        // --- End (Right) ---
        if (lockedEndColumns.length > 0) {
            if (!me.headerEnd) {
                me.headerEnd = lockedToolbar(lockedEndButtons || [], 'end')
            } else if (lockedEndButtons) {
                destroyReplacedButtons(me.headerEnd, lockedEndButtons);
                me.headerEnd.items = lockedEndButtons;
                me.headerEnd.createItems()
            }
        }

        // A region that emptied at runtime still holds the button of the column that just left it, and destroying
        // the toolbar would take the button along: the column kept its instance and lost its header and every
        // cell. So the buttons move first, while every toolbar they may go to exists, and the emptied one goes after.
        let startEmptied = me.headerStart && lockedStartColumns.length === 0,
            endEmptied   = me.headerEnd   && lockedEndColumns.length   === 0;

        if (startEmptied || endEmptied) {
            if (!centerButtons) {
                me.applyColumnButtonOrder(lockedStartColumns, centerColumns, lockedEndColumns)
            }

            if (startEmptied) {
                me.headerStart.destroy();
                me.headerStart = null
            }

            if (endEmptied) {
                me.headerEnd.destroy();
                me.headerEnd = null
            }
        }

        me.items = me.getToolbars();
        me.createItems();
        me.syncColumnMenuState()
    }

    /**
     * @summary Returns the first active column-menu plugin in this header wrapper, if any.
     * @returns {Neo.grid.header.plugin.Menu|null}
     */
    getMenuPlugin() {
        for (const toolbar of this.getToolbars()) {
            for (const item of toolbar.items || []) {
                const plugin = item.getPlugin('plugin-grid-header-menu');
                if (plugin) return plugin
            }
        }
        return null
    }

    /**
     * @summary True while at least one header button in this grid enables its value menu.
     * @returns {Boolean}
     */
    hasColumnMenus() {
        return this.getToolbars().some(toolbar => (toolbar.items || []).some(item => item.columnMenu === true))
    }

    /**
     * @member {Boolean} syncingColumnMenuState=false
     * @protected
     */
    syncingColumnMenuState = false

    /**
     * @summary Toggles `neo-grid-menu-hint` on menu-disabled header buttons while the grid has at least one
     * menu-enabled column, registers context-menu prevention for that class, and dismisses any stale hint.
     */
    syncColumnMenuState() {
        if (this.syncingColumnMenuState) return;
        const active = this.hasColumnMenus();

        for (const toolbar of this.getToolbars()) {
            for (const item of toolbar.items || []) {
                item.toggleCls('neo-grid-menu-hint', active && !item.columnMenu)
            }
        }

        if (active && this.windowId) {
            Neo.main.DomEvents.registerPreventDefaultTargets({
                cls: 'neo-grid-menu-hint', name: 'contextmenu', windowId: this.windowId
            })
        }

        const menu = this.getMenuPlugin();
        if (!active || menu?.hintTarget?.columnMenu || menu?.hintTarget?.isDestroyed) {
            menu?.closeHint()
        }
    }

    /**
     * @summary Resolves the column header button from a delegated DOM event path.
     * @param {Object} data
     * @returns {Neo.grid.header.Button|null}
     */
    resolveHeaderButton(data) {
        for (const node of data?.path || []) {
            const component = Neo.getComponent(node.id);
            if (component?.ntype === 'grid-header-button') return component
        }
        return null
    }

    /**
     * @summary Shows the disabled-column hint on right-click of a menu-disabled header in a menu-enabled grid.
     * @param {Object} data
     */
    onHeaderContextMenu(data) {
        const button = this.resolveHeaderButton(data),
              menu   = this.getMenuPlugin();
        if (!menu || !button || button.columnMenu || !this.hasColumnMenus()) {
            menu?.closeHint();
            return
        }
        if (!menu.isFilterFieldEvent(data, button)) {
            menu.openHint(button)
        }
    }

    /**
     * @summary Supports keyboard context-menu invocation and Escape dismissal on menu-disabled headers.
     * @param {Object} data
     */
    onHeaderKeyDown(data) {
        const button = this.resolveHeaderButton(data),
              menu   = this.getMenuPlugin();
        if (!menu) return;
        if (data.key === 'Escape') {
            menu.closeHint(true);
            return
        }
        if (menu.hintTarget && button && button !== menu.hintTarget) {
            menu.closeHint()
        }
        if ((data.key === 'ContextMenu' || data.key === 'F10' && data.shiftKey) &&
            button && !button.columnMenu && this.hasColumnMenus() && !menu.isFilterFieldEvent(data, button)) {
            menu.openHint(button)
        }
    }
}

export default Neo.setupClass(Wrapper);
