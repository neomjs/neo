import BaseContainer from '../../container/Base.mjs';
import Component     from '../../component/Base.mjs';

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

    /** @member {Neo.grid.header.Button|null} hintButton=null @protected */
    hintButton = null
    /** @member {Neo.container.Base|null} hintSurface=null @protected */
    hintSurface = null
    /** @member {Number} #hintOpenSerial=0 @private */
    #hintOpenSerial = 0
    /** @member {Object[]|null} #outsideListener=null @private */
    #outsideListener = null
    /** @member {Neo.component.Base|null} #outsideOwner=null @private */
    #outsideOwner = null

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
                cls: 'neo-grid-has-column-menus', name: 'contextmenu', windowId: value
            })
        }

        if (this.hintSurface) {
            this.hintSurface.windowId = value
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
            });

        // --- Center (Default) ---
        if (centerColumns.length > 0 && centerButtons) {
            headerToolbar.items = centerButtons;
            headerToolbar.createItems()
        }

        // --- Start (Left) ---
        if (lockedStartColumns.length > 0) {
            if (!me.headerStart) {
                me.headerStart = lockedToolbar(lockedStartButtons || [], 'start')
            } else if (lockedStartButtons) {
                me.headerStart.items = lockedStartButtons;
                me.headerStart.createItems()
            }
        }

        // --- End (Right) ---
        if (lockedEndColumns.length > 0) {
            if (!me.headerEnd) {
                me.headerEnd = lockedToolbar(lockedEndButtons || [], 'end')
            } else if (lockedEndButtons) {
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
            me.applyColumnButtonOrder(lockedStartColumns, centerColumns, lockedEndColumns);

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
     * @summary True while at least one header button in this grid enables its value menu.
     * @returns {Boolean}
     */
    hasColumnMenus() {
        return this.getToolbars().some(toolbar => (toolbar.items || []).some(item => item.columnMenu === true))
    }

    /**
     * @summary Registers main-thread context-menu prevention only while the grid has at least one menu-enabled column,
     * and dismisses any open disabled-column hint if its header gained a menu or all menus were disabled.
     */
    syncColumnMenuState() {
        const active = this.hasColumnMenus();
        this.toggleCls('neo-grid-has-column-menus', active);

        if (active && this.windowId) {
            Neo.main.DomEvents.registerPreventDefaultTargets({
                cls: 'neo-grid-has-column-menus', name: 'contextmenu', windowId: this.windowId
            })
        }

        if (!active || this.hintButton?.columnMenu || this.hintButton?.isDestroyed) {
            this.closeHint()
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
     * @summary Creates the shared floating status surface for menu-disabled headers in menu-enabled grids.
     * @param {Neo.grid.header.Button} button
     */
    createHintSurface(button) {
        const me = this;
        me.hintSurface = Neo.create(BaseContainer, {
            appName        : me.appName,
            windowId       : me.windowId,
            parentComponent: me,
            parentId       : 'document.body',
            floating       : true,
            hidden         : true,
            cls            : ['neo-grid-column-menu'],
            role           : 'dialog',
            align          : {edgeAlign: 't0-b0', axisLock: true, target: button.id},
            layout         : {ntype: 'vbox', align: 'stretch'},
            vdom           : {'aria-label': `Filter ${button.text || button.dataField}`},
            items          : [{
                module   : Component,
                reference: 'status',
                role     : 'status',
                html     : 'Value filtering is off for this column.'
            }]
        });
        me.hintSurface.addDomListeners({keydown: {fn: me.onHintKeyDown, scope: me, bubble: true}});
        me.observeConfig(me.hintSurface, 'mounted', value => me.syncOutsideListener(value))
    }

    /**
     * @summary Opens the floating disabled-column hint under `button` and closes any open value menu.
     * @param {Neo.grid.header.Button} button
     * @returns {Promise}
     */
    async openHint(button) {
        if (this.isDestroyed || this.isDestroying || !button || button.isDestroyed || button.columnMenu || !this.hasColumnMenus()) return;
        const serial = ++this.#hintOpenSerial;
        for (const toolbar of this.getToolbars()) {
            for (const item of toolbar.items || []) {
                item.getPlugin('plugin-grid-header-menu')?.close()
            }
        }
        await this.trap((button.parent || button).promiseUpdate());
        if (this.isDestroyed || this.isDestroying || button.isDestroyed || button.columnMenu || !this.hasColumnMenus() ||
            serial !== this.#hintOpenSerial) return;
        this.hintButton = button;
        if (!this.hintSurface) {
            this.createHintSurface(button)
        } else {
            this.hintSurface.align = {edgeAlign: 't0-b0', axisLock: true, target: button.id};
            this.hintSurface.vdom['aria-label'] = `Filter ${button.text || button.dataField}`
        }
        const wasOpen = !this.hintSurface.hidden;
        this.hintSurface.hidden = false;
        if (wasOpen) this.hintSurface.update();
        await this.hintSurface.promiseUpdate();
        if (!this.isDestroyed && serial === this.#hintOpenSerial && !this.hintSurface.hidden) {
            if (wasOpen && this.hintSurface.mounted && this.windowId) {
                await this.hintSurface.alignTo()
            }
            button.focus()
        }
    }

    /**
     * @summary Dismisses the disabled-column hint and optionally restores focus to the header that opened it.
     * @param {Boolean} [restoreFocus=false]
     */
    closeHint(restoreFocus=false) {
        ++this.#hintOpenSerial;
        const button = this.hintButton;
        this.hintButton = null;
        if (!this.hintSurface || this.hintSurface.hidden) return;
        this.hintSurface.hidden = true;
        this.syncOutsideListener(false);
        if (restoreFocus && button && !button.isDestroyed) {
            button.focus()
        }
    }

    /**
     * @summary Shows the disabled-column hint on right-click of a menu-disabled header in a menu-enabled grid.
     * @param {Object} data
     */
    onHeaderContextMenu(data) {
        const button = this.resolveHeaderButton(data);
        if (!button || button.columnMenu || !this.hasColumnMenus()) {
            this.closeHint();
            return
        }
        if (button.filterField && (data.path || []).some(node => node.id === button.filterField.id)) {
            return
        }
        this.openHint(button)
    }

    /**
     * @summary Supports keyboard context-menu invocation and Escape dismissal on menu-disabled headers.
     * @param {Object} data
     */
    onHeaderKeyDown(data) {
        const button = this.resolveHeaderButton(data);
        if (data.key === 'Escape') {
            if (this.hintSurface && !this.hintSurface.hidden) {
                this.closeHint(true)
            }
            return
        }
        if (this.hintSurface && !this.hintSurface.hidden && button && button !== this.hintButton) {
            this.closeHint()
        }
        if (data.key === 'ContextMenu' || data.key === 'F10' && data.shiftKey) {
            if (!button || button.columnMenu || !this.hasColumnMenus()) return;
            if (button.filterField && (data.path || []).some(node => node.id === button.filterField.id)) return;
            this.openHint(button)
        }
    }

    /**
     * @summary Dismisses the hint surface on Escape from within the floating surface.
     * @param {Object} data
     */
    onHintKeyDown(data) {
        if (data.key === 'Escape') this.closeHint(true)
    }

    /**
     * @summary Keeps the outside-pointer listener bound only while the hint surface is mounted.
     * @param {Boolean} attach
     */
    syncOutsideListener(attach) {
        if (attach && !this.#outsideOwner) {
            const owner = this.app?.mainView;
            if (owner) {
                this.#outsideListener ||= [
                    {mousedown: this.onOutsidePointer, scope: this},
                    {touchstart: this.onOutsidePointer, scope: this}
                ];
                owner.addDomListeners(this.#outsideListener);
                this.#outsideOwner = owner
            }
        } else if (!attach && this.#outsideOwner) {
            this.#outsideOwner.removeDomListeners(this.#outsideListener);
            this.#outsideOwner = null
        }
    }

    /**
     * @summary Closes the hint surface when a pointer-down occurs outside the surface.
     * @param {Object} data
     */
    onOutsidePointer(data) {
        const ids = new Set([this.hintSurface?.id]);
        if (!(data.path || []).some(node => ids.has(node.id))) this.closeHint()
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        this.#hintOpenSerial++;
        this.syncOutsideListener(false);
        this.hintButton = null;
        this.hintSurface?.destroy(true);
        this.hintSurface = null;
        super.destroy(...args)
    }
}

export default Neo.setupClass(Wrapper);
