import BaseModel from '../selection/Model.mjs';
import NeoArray  from '../util/Array.mjs';

/**
 * @summary Record-key-backed selection and keyboard navigation model for {@link Neo.board.Container}.
 * @description Tracks selected card keys (`board.getKey(record)`) in `items` and a single roving `focusedKey`
 * (`tabIndex: 0` on the focused card, `-1` on all other rendered cards), so selection and focus survive offscreen
 * window slicing in virtualized columns (`maxRenderedCards`).
 *
 * Keyboard bindings registered on `board.keys`:
 * - `Up` / `Down` / `Home` / `End`: move focus within the active column, awaiting `column.scrollToRecord(key)` when
 *   the target record sits outside a sliced column's rendered window.
 * - `Left` / `Right`: move focus to the nearest non-collapsed non-empty column in that direction, clamping the visual
 *   offset to the target column's length.
 * - `Space`: toggle selection on the focused card.
 * - `Shift+Up` / `Shift+Down`: extend contiguous selection from `anchorKey` to the new focused card within the column.
 * - `Ctrl+A` / `Meta+A`: select all cards in the focused column.
 * - `Escape`: clear selection (`deselectAll`).
 * - `Ctrl+Up` / `Ctrl+Down` / `Ctrl+Left` / `Ctrl+Right`: move the focused card through `board.moveCard` using
 *   neighbour anchors (`beforeId` / `afterId`) and `index`.
 * - `Enter`: activate the focused card (`board.activateCard`), firing `cardActivate` and opening `CardEditor`.
 * @class Neo.board.SelectionModel
 * @extends Neo.selection.Model
 */
class SelectionModel extends BaseModel {
    static config = {
        /**
         * @member {String} className='Neo.board.SelectionModel'
         * @protected
         */
        className: 'Neo.board.SelectionModel',
        /**
         * @member {String} ntype='selection-board'
         * @protected
         */
        ntype: 'selection-board',
        /**
         * @member {String} cls='neo-selection-board'
         * @protected
         */
        cls: 'neo-selection-board',
        /**
         * Multi-select is enabled by default so `Space`, `Shift+Arrow`, `Ctrl/Cmd+Click`, `Shift+Click`, and
         * `Ctrl/Cmd+A` can select multiple cards while `Enter` activates only the focused card.
         * @member {Boolean} singleSelect=false
         */
        singleSelect: false
    }

    /**
     * Record key anchoring contiguous `Shift+Up/Down` and `Shift+Click` range selections
     * @member {String|Number|null} anchorKey=null
     */
    anchorKey = null
    /**
     * Record key of the card that currently owns the roving `tabIndex: 0`
     * @member {String|Number|null} focusedKey=null
     */
    focusedKey = null
    /**
     * Bound DOM listener configs registered on `view` so `unregister()` removes the exact references
     * @member {Object[]|null} viewDomListeners=null
     * @protected
     */
    viewDomListeners = null

    /**
     * @summary Applies `neo-selected`, `aria-selected`, and roving `tabIndex` (`0` on the focused card, `-1` on all
     * others) to a single card instance.
     * @param {Neo.board.Card} card
     * @param {String|Number|null} [rovingKey=this.getRovingTabKey()]
     * @param {Boolean} [silent=false]
     */
    annotateCard(card, rovingKey=this.getRovingTabKey(), silent=false) {
        let me     = this,
            {view} = me,
            changed, cls, hadSelectedCls, isSelected, key, selectedStr, tabIndex;

        if (!card || card.isDestroyed || !view?.store || !card.record) {
            return
        }

        key            = view.getKey(card.record);
        isSelected     = Boolean(me.isSelected(key));
        selectedStr    = String(isSelected);
        tabIndex       = key === rovingKey ? 0 : -1;
        cls            = [...(card.cls || [])];
        hadSelectedCls = cls.includes(me.selectedCls);

        NeoArray.toggle(cls, me.selectedCls, isSelected);

        changed =
            hadSelectedCls !== isSelected ||
            card.vdom['aria-selected'] !== selectedStr ||
            card.vdom.tabIndex !== tabIndex;

        if (hadSelectedCls !== isSelected) {
            card.setSilent({cls})
        }

        card.vdom['aria-selected'] = selectedStr;
        card.vdom.tabIndex         = tabIndex;

        if (changed && !silent && card.parent) {
            card.update()
        }
    }

    /**
     * @summary Clears all selected record keys, updates card annotations, announces the clear, and fires
     * `selectionChange`.
     * @param {Boolean} [silent=false]
     */
    deselectAll(silent=false) {
        let me = this;

        if (!me.items.length) {
            return
        }

        me.items = [];
        me.syncAnnotations();

        if (!silent) {
            me.emitSelectionChange()
        }
    }

    /**
     * @summary Deselects a single record or key.
     * @param {Object|String|Number} item
     * @param {Boolean} [silent=false]
     */
    deselect(item, silent=false) {
        let me  = this,
            key = me.resolveKey(item);

        if (key == null || !me.isSelected(key)) {
            return
        }

        NeoArray.remove(me.items, key);
        me.syncAnnotations();

        if (!silent) {
            me.emitSelectionChange()
        }
    }

    /**
     * @summary Emits `selectionChange` `{records, selection}` on both the selection model and the board, and updates
     * the board's polite live region.
     * @protected
     */
    emitSelectionChange() {
        let me        = this,
            {view}    = me,
            selection = [...me.items],
            records   = selection.map(key => view?.getSourceRecord(key)).filter(Boolean),
            payload   = {records, selection},
            count     = selection.length;

        me.fire('selectionChange', payload);
        view?.fire('selectionChange', payload);
        view?.announce(count === 0 ? 'Selection cleared' : `${count} ${count === 1 ? 'card' : 'cards'} selected`)
    }

    /**
     * @summary Ensures `focusedKey` names a live record in a non-collapsed column, seeding it to the first record of
     * the first open non-empty column when unset or stale.
     * @param {Function} [recordsFor] Reuses this projection's ordered rows when supplied by the Board.
     * @returns {String|Number|null}
     */
    ensureFocusedCard(recordsFor = (status, lane) => this.view.getColumnRecords(status, lane)) {
        let me     = this,
            {view} = me,
            column, firstRecord, pos, record;

        if (!view?.store) {
            return null
        }

        // Filtering changes visibility, not selection; only source removal makes a selected key stale.
        if (me.items.length) {
            const validItems = me.items.filter(key => Boolean(view.getSourceRecord(key)));
            if (validItems.length !== me.items.length) {
                me.items = validItems
            }
        }

        if (me.focusedKey != null) {
            record = view.store.get(me.focusedKey);
            if (record) {
                pos    = view.getCardPosition(record, recordsFor);
                column = view.getColumn(pos.status, pos.lane);
                if (column && !column.collapsed && pos.index > -1) {
                    me.anchorKey ??= me.focusedKey;
                    return me.focusedKey
                }
            }
        }

        for (const openCol of view.getOpenColumns()) {
            const records = recordsFor(openCol.status, openCol.laneValue);
            if (records.length) {
                firstRecord   = records[0];
                me.focusedKey = view.getKey(firstRecord);
                me.anchorKey  = me.focusedKey;
                return me.focusedKey
            }
        }

        me.focusedKey = null;
        me.anchorKey  = null;
        return null
    }

    /**
     * @summary Focuses the record identified by `recordOrKey`, scrolling its column first when the record lies outside
     * a sliced column's rendered window, updating the roving `tabIndex`, and focusing the rendered card DOM node.
     * @param {Object|String|Number} recordOrKey
     * @param {Object} [options={}]
     * @param {Boolean} [options.focusDom=true]
     * @param {Boolean} [options.preserveAnchor=false]
     * @returns {Promise<Neo.board.Card|null>}
     */
    async focusRecord(recordOrKey, {focusDom=true, preserveAnchor=false}={}) {
        let me     = this,
            {view} = me,
            card, column, key, pos, record;

        if (!view?.store) {
            return null
        }

        key    = me.resolveKey(recordOrKey);
        record = key != null ? view.store.get(key) : null;

        if (!record) {
            return null
        }

        pos    = view.getCardPosition(record);
        column = view.getColumn(pos.status, pos.lane);

        if (!column || column.collapsed) {
            return null
        }

        me.focusedKey = key;
        if (!preserveAnchor) {
            me.anchorKey = key
        }

        card = view.getCard(key);

        if (!card && column.isSliced) {
            card = await column.scrollToRecord(key)
        }

        me.syncAnnotations();
        card = view.getCard(key);

        if (focusDom && card && !card.isDestroyed) {
            card.mounted && card.focus(card.id)
        }

        return card
    }

    /**
     * @summary Returns the currently focused record, seeding `focusedKey` first if needed.
     * @returns {Object|null}
     */
    getFocusedRecord() {
        let me  = this,
            key = me.ensureFocusedCard();

        return key != null ? me.view?.store?.get(key) ?? null : null
    }

    /**
     * @summary Returns the record key that should carry `tabIndex: 0` among currently rendered cards.
     * @param {Function} [recordsFor] Reuses ordered records read during the current projection.
     * @returns {String|Number|null}
     */
    getRovingTabKey(recordsFor) {
        let me     = this,
            {view} = me;

        if (!view?.store) {
            return null
        }

        me.ensureFocusedCard(recordsFor);

        if (me.focusedKey != null && view.getCard(me.focusedKey)) {
            return me.focusedKey
        }

        for (const column of view.getOpenColumns()) {
            const firstCard = column.body?.items?.[0];
            if (firstCard?.record) {
                return view.getKey(firstCard.record)
            }
        }

        return me.focusedKey
    }

    /**
     * @summary Returns true when the keyboard event originated from an inline editor or form input.
     * @param {Object} data
     * @returns {Boolean}
     * @protected
     */
    isEditableTarget(data) {
        const
            me     = this,
            {view} = me,
            path   = data?.path;

        if (view && me.focusedKey != null && view.getCard(me.focusedKey)?.isEditingTitle) {
            return true
        }

        if (!Array.isArray(path)) {
            return false
        }

        return path.some(node =>
            node?.tag === 'input' ||
            node?.tag === 'textarea' ||
            node?.cls?.includes?.('neo-board-card-inline-editor') ||
            node?.cls?.includes?.('neo-textfield')
        )
    }

    /**
     * @summary Moves the focused card to the adjacent non-collapsed column in `step` direction (`-1` left, `+1` right)
     * through `board.moveCard`.
     * @param {Number} step `-1` or `1`
     * @returns {Promise<Object|null>}
     */
    async moveFocusedHorizontal(step) {
        let me     = this,
            {view} = me,
            record = me.getFocusedRecord(),
            afterId, beforeId, colIndex, currentColumn, key, next, openColumns, others, pos, prev, targetColumn, targetIndex, visualOffset;

        if (!view || !record) {
            return null
        }

        key           = view.getKey(record);
        pos           = view.getCardPosition(record);
        currentColumn = view.getColumn(pos.status, pos.lane);
        openColumns   = view.getOpenColumns();
        colIndex      = openColumns.indexOf(currentColumn);
        targetColumn  = openColumns[colIndex + step] || null;

        if (!targetColumn) {
            return null
        }

        visualOffset = Math.max(0, pos.index - (currentColumn?.windowStart || 0));
        others       = view.getColumnRecords(targetColumn.status, targetColumn.laneValue).filter(item => item !== record);
        targetIndex  = Math.min((targetColumn.windowStart || 0) + visualOffset, others.length);
        next         = others[targetIndex] ?? null;
        prev         = targetIndex > 0 ? others[targetIndex - 1] : null;
        beforeId     = next ? view.getKey(next) : null;
        afterId      = !next && prev ? view.getKey(prev) : null;

        view.moveCard({
            afterId,
            beforeId,
            index : targetIndex,
            key,
            lane  : targetColumn.laneValue ?? null,
            record,
            status: targetColumn.status
        });

        await me.focusRecord(key, {preserveAnchor: true});

        return record
    }

    /**
     * @summary Moves the focused card up (`step = -1`) or down (`step = 1`) within its column through `board.moveCard`.
     * @param {Number} step `-1` or `1`
     * @returns {Promise<Object|null>}
     */
    async moveFocusedVertical(step) {
        let me     = this,
            {view} = me,
            record = me.getFocusedRecord(),
            afterId, beforeId, key, next, others, pos, prev, records, targetIndex;

        if (!view || !record) {
            return null
        }

        key         = view.getKey(record);
        pos         = view.getCardPosition(record);
        records     = view.getColumnRecords(pos.status, pos.lane);
        targetIndex = pos.index + step;

        if (targetIndex < 0 || targetIndex >= records.length) {
            return null
        }

        others   = records.filter(item => item !== record);
        next     = others[targetIndex] ?? null;
        prev     = targetIndex > 0 ? others[targetIndex - 1] : null;
        beforeId = next ? view.getKey(next) : null;
        afterId  = !next && prev ? view.getKey(prev) : null;

        view.moveCard({
            afterId,
            beforeId,
            index : targetIndex,
            key,
            lane  : pos.lane,
            record,
            status: pos.status
        });

        await me.focusRecord(key, {preserveAnchor: true});

        return record
    }

    /**
     * @summary Handles plain, `Ctrl/Cmd`, and `Shift` clicks on cards, and the `⋯` button: an unselected card whose
     * editor it opens becomes the selection.
     * @param {Object} data
     */
    onBoardClick(data) {
        let me     = this,
            {view} = me,
            path   = data?.path || [],
            card, cardNode, column, key, pos;

        if (!view?.store) {
            return
        }

        if (path.some(node => node?.cls?.includes?.('neo-board-card-inline-editor'))) {
            return
        }

        cardNode = path.find(node => node?.cls?.includes?.('neo-board-card'));
        card     = cardNode ? Neo.getComponent(cardNode.id) : null;

        if (!card?.record || card.isEditingTitle) {
            return
        }

        key = view.getKey(card.record);

        // The ⋯ button opens its card's editor: an unselected card becomes the selection, so the highlight names the
        // card being edited, while a selected one keeps the selection it belongs to
        if (path.some(node => node?.cls?.includes?.('neo-board-card-menu-button'))) {
            if (!me.isSelected(key)) {
                me.focusedKey = key;
                me.anchorKey  = key;
                me.setSelection([key])
            }

            return
        }

        if (data.shiftKey) {
            pos    = view.getCardPosition(card.record);
            column = view.getColumn(pos.status, pos.lane);
            me.focusedKey = key;
            me.selectColumnRange(column, me.anchorKey ?? key, key)
        } else if (data.ctrlKey || data.metaKey) {
            me.focusedKey = key;
            me.toggleSelection(key);
            if (me.isSelected(key)) {
                me.anchorKey = key
            } else if (me.anchorKey === key) {
                me.anchorKey = me.items.at(-1) ?? key
            }
        } else {
            me.focusedKey = key;
            me.anchorKey  = key;
            me.setSelection([key])
        }
    }

    /**
     * @summary Tracks `focusedKey` when a card receives DOM focus directly.
     * @param {Object} data
     */
    onCardFocusIn(data) {
        let me       = this,
            {view}   = me,
            path     = data?.path || [],
            cardNode = path.find(node => node?.cls?.includes?.('neo-board-card')),
            card     = cardNode ? Neo.getComponent(cardNode.id) : null,
            key;

        if (card?.record && view?.store) {
            key = view.getKey(card.record);
            if (me.focusedKey !== key) {
                me.focusedKey = key;
                me.anchorKey ??= key;
                me.syncAnnotations()
            }
        }
    }

    /**
     * @summary Dispatches `Ctrl+A` / `Meta+A` select-all when `A` is pressed with a platform command modifier.
     * @param {Object} data
     */
    onKeyDownA(data) {
        if ((data?.ctrlKey || data?.metaKey) && !this.isEditableTarget(data)) {
            this.onKeyDownSelectAll(data)
        }
    }

    /**
     * @summary Moves the focused card down one slot within its column (`Ctrl+Down`).
     * @param {Object} [data]
     * @returns {Promise<Object|null>}
     */
    onKeyDownCtrlDown(data) {
        if (this.isEditableTarget(data)) {
            return Promise.resolve(null)
        }
        return this.moveFocusedVertical(1)
    }

    /**
     * @summary Moves the focused card to the previous non-collapsed column (`Ctrl+Left`).
     * @param {Object} [data]
     * @returns {Promise<Object|null>}
     */
    onKeyDownCtrlLeft(data) {
        if (this.isEditableTarget(data)) {
            return Promise.resolve(null)
        }
        return this.moveFocusedHorizontal(-1)
    }

    /**
     * @summary Moves the focused card to the next non-collapsed column (`Ctrl+Right`).
     * @param {Object} [data]
     * @returns {Promise<Object|null>}
     */
    onKeyDownCtrlRight(data) {
        if (this.isEditableTarget(data)) {
            return Promise.resolve(null)
        }
        return this.moveFocusedHorizontal(1)
    }

    /**
     * @summary Moves the focused card up one slot within its column (`Ctrl+Up`).
     * @param {Object} [data]
     * @returns {Promise<Object|null>}
     */
    onKeyDownCtrlUp(data) {
        if (this.isEditableTarget(data)) {
            return Promise.resolve(null)
        }
        return this.moveFocusedVertical(-1)
    }

    /**
     * @summary Navigates down within the column, or delegates to `Ctrl+Down` / `Shift+Down` when modifiers are held.
     * @param {Object} [data]
     * @returns {Promise<Neo.board.Card|Object|null>}
     */
    onKeyDownDown(data) {
        if (this.isEditableTarget(data)) {
            return Promise.resolve(null)
        }
        if (data?.ctrlKey) {
            return this.onKeyDownCtrlDown(data)
        }
        if (data?.shiftKey) {
            return this.onKeyDownShiftDown(data)
        }
        return this.stepVertical(1)
    }

    /**
     * @summary Jumps focus to the last record of the active column (`End`), scrolling a sliced column if needed.
     * @param {Object} [data]
     * @returns {Promise<Neo.board.Card|null>}
     */
    async onKeyDownEnd(data) {
        let me     = this,
            {view} = me,
            record, pos, records;

        if (me.isEditableTarget(data) || !view) {
            return null
        }

        record = me.getFocusedRecord();
        if (!record) {
            return null
        }

        pos     = view.getCardPosition(record);
        records = view.getColumnRecords(pos.status, pos.lane);

        return records.length ? me.focusRecord(view.getKey(records[records.length - 1])) : null
    }

    /**
     * @summary Activates the focused card (`Enter`), firing `cardActivate` on the board and opening `CardEditor`.
     * Enter on a button inside the board belongs to that button: a lane's or a column's collapse toggle, a card's menu.
     * @param {Object} [data]
     * @returns {Neo.board.CardEditor|null}
     */
    onKeyDownEnter(data) {
        let me     = this,
            {view} = me,
            card, record;

        if (me.isEditableTarget(data) || !view) {
            return null
        }

        // A DOM event path names each node's tag as `tagName`, lower case
        if (data?.path?.some?.(node => node?.tagName === 'button')) {
            return null
        }

        record = me.getFocusedRecord();
        if (!record) {
            return null
        }

        card = view.getCard(record);
        return view.activateCard(card || record)
    }

    /**
     * @summary Clears all selected cards (`Escape`).
     * @param {Object} [data]
     */
    onKeyDownEscape(data) {
        if (!this.isEditableTarget(data) && !this.view?.sortZone?.dragComponent && !this.view?.columnSortZone?.dragComponent) {
            this.deselectAll()
        }
    }

    /**
     * @summary Jumps focus to the first record of the active column (`Home`), scrolling a sliced column if needed.
     * @param {Object} [data]
     * @returns {Promise<Neo.board.Card|null>}
     */
    async onKeyDownHome(data) {
        let me     = this,
            {view} = me,
            record, pos, records;

        if (me.isEditableTarget(data) || !view) {
            return null
        }

        record = me.getFocusedRecord();
        if (!record) {
            return null
        }

        pos     = view.getCardPosition(record);
        records = view.getColumnRecords(pos.status, pos.lane);

        return records.length ? me.focusRecord(view.getKey(records[0])) : null
    }

    /**
     * @summary Navigates to the previous non-collapsed column, or delegates to `Ctrl+Left` when `Ctrl` is held.
     * @param {Object} [data]
     * @returns {Promise<Neo.board.Card|Object|null>}
     */
    onKeyDownLeft(data) {
        if (this.isEditableTarget(data)) {
            return Promise.resolve(null)
        }
        if (data?.ctrlKey) {
            return this.onKeyDownCtrlLeft(data)
        }
        return this.stepHorizontal(-1)
    }

    /**
     * @summary Navigates to the next non-collapsed column, or delegates to `Ctrl+Right` when `Ctrl` is held.
     * @param {Object} [data]
     * @returns {Promise<Neo.board.Card|Object|null>}
     */
    onKeyDownRight(data) {
        if (this.isEditableTarget(data)) {
            return Promise.resolve(null)
        }
        if (data?.ctrlKey) {
            return this.onKeyDownCtrlRight(data)
        }
        return this.stepHorizontal(1)
    }

    /**
     * @summary Selects all cards in the focused column (`Ctrl+A` / `Meta+A`).
     * @param {Object} [data]
     */
    onKeyDownSelectAll(data) {
        let me     = this,
            {view} = me,
            keys, pos, record;

        if (me.isEditableTarget(data) || !view?.store) {
            return
        }

        record = me.getFocusedRecord();
        if (!record) {
            return
        }

        pos  = view.getCardPosition(record);
        keys = view.getColumnRecords(pos.status, pos.lane).map(item => view.getKey(item));

        me.setSelection(keys)
    }

    /**
     * @summary Extends contiguous selection downward within the active column (`Shift+Down`).
     * @param {Object} [data]
     * @returns {Promise<Neo.board.Card|null>}
     */
    onKeyDownShiftDown(data) {
        if (this.isEditableTarget(data)) {
            return Promise.resolve(null)
        }
        return this.stepVertical(1, {extendSelection: true})
    }

    /**
     * @summary Extends contiguous selection upward within the active column (`Shift+Up`).
     * @param {Object} [data]
     * @returns {Promise<Neo.board.Card|null>}
     */
    onKeyDownShiftUp(data) {
        if (this.isEditableTarget(data)) {
            return Promise.resolve(null)
        }
        return this.stepVertical(-1, {extendSelection: true})
    }

    /**
     * @summary Toggles selection on the focused card (`Space`).
     * @param {Object} [data]
     */
    onKeyDownSpace(data) {
        let me  = this,
            key = me.ensureFocusedCard();

        if (!me.isEditableTarget(data) && key != null) {
            me.anchorKey = key;
            me.toggleSelection(key)
        }
    }

    /**
     * @summary Navigates up within the column, or delegates to `Ctrl+Up` / `Shift+Up` when modifiers are held.
     * @param {Object} [data]
     * @returns {Promise<Neo.board.Card|Object|null>}
     */
    onKeyDownUp(data) {
        if (this.isEditableTarget(data)) {
            return Promise.resolve(null)
        }
        if (data?.ctrlKey) {
            return this.onKeyDownCtrlUp(data)
        }
        if (data?.shiftKey) {
            return this.onKeyDownShiftUp(data)
        }
        return this.stepVertical(-1)
    }

    /**
     * @summary Registers DOM listeners and `KeyNavigation` bindings on the owning board.
     * @param {Neo.board.Container} component
     */
    register(component) {
        super.register(component);

        let me         = this,
            {id, view} = me;

        me.viewDomListeners = [
            {click  : me.onBoardClick,  delegate: '.neo-board-card', scope: me},
            {focusin: me.onCardFocusIn, delegate: '.neo-board-card', scope: me}
        ];

        view.addDomListeners(me.viewDomListeners);

        view.keys?._keys.push(
            {fn: 'onKeyDownA',         key: 'A',          scope: id},
            {fn: 'onKeyDownCtrlDown',  key: 'Ctrl+Down',  scope: id},
            {fn: 'onKeyDownCtrlLeft',  key: 'Ctrl+Left',  scope: id},
            {fn: 'onKeyDownCtrlRight', key: 'Ctrl+Right', scope: id},
            {fn: 'onKeyDownCtrlUp',    key: 'Ctrl+Up',    scope: id},
            {fn: 'onKeyDownDown',      key: 'Down',       scope: id},
            {fn: 'onKeyDownEnd',       key: 'End',        scope: id},
            {fn: 'onKeyDownEnter',     key: 'Enter',      scope: id},
            {fn: 'onKeyDownEscape',    key: 'Escape',     scope: id},
            {fn: 'onKeyDownHome',      key: 'Home',       scope: id},
            {fn: 'onKeyDownLeft',      key: 'Left',       scope: id},
            {fn: 'onKeyDownRight',     key: 'Right',      scope: id},
            {fn: 'onKeyDownSelectAll', key: 'Ctrl+A',     scope: id},
            {fn: 'onKeyDownSelectAll', key: 'Meta+A',     scope: id},
            {fn: 'onKeyDownShiftDown', key: 'Shift+Down', scope: id},
            {fn: 'onKeyDownShiftUp',   key: 'Shift+Up',   scope: id},
            {fn: 'onKeyDownSpace',     key: 'Space',      scope: id},
            {fn: 'onKeyDownUp',        key: 'Up',         scope: id}
        );

        me.ensureFocusedCard();
        me.syncAnnotations()
    }

    /**
     * @summary Normalizes a record, card, or primitive key into its store record key.
     * @param {Object|String|Number|null} item
     * @returns {String|Number|null}
     */
    resolveKey(item) {
        const {view} = this;

        if (item == null || !view?.store) {
            return null
        }

        if (typeof item === 'object') {
            if (item.record) {
                return view.getKey(item.record)
            }
            return view.getKey(item)
        }

        return item
    }

    /**
     * @summary Selects one or more records/keys, replacing the selection when `singleSelect` is true or appending when
     * `singleSelect` is false.
     * @param {Object|String|Number|Array} items
     * @param {Boolean} [silent=false]
     */
    select(items, silent=false) {
        let me   = this,
            list = Array.isArray(items) ? items : [items],
            keys = list.map(item => me.resolveKey(item)).filter(key => key != null);

        if (!keys.length) {
            return
        }

        if (me.singleSelect) {
            me.setSelection([keys[0]], silent)
        } else {
            me.setSelection(NeoArray.union(me.items, keys), silent)
        }
    }

    /**
     * @summary Selects the contiguous slice of records in `column` between `fromKey` and `toKey` (inclusive).
     * @param {Neo.board.Column|null} column
     * @param {String|Number} fromKey
     * @param {String|Number} toKey
     */
    selectColumnRange(column, fromKey, toKey) {
        let me     = this,
            {view} = me,
            end, fromIndex, keys, records, start, toIndex;

        if (!view || !column) {
            return
        }

        records   = view.getColumnRecords(column.status, column.laneValue);
        keys      = records.map(record => view.getKey(record));
        fromIndex = keys.indexOf(fromKey);
        toIndex   = keys.indexOf(toKey);

        if (fromIndex < 0) {
            fromIndex = keys.findIndex(key => me.isSelected(key))
        }

        if (fromIndex < 0 || toIndex < 0) {
            me.anchorKey = toKey;
            me.setSelection([toKey]);
            return
        }

        start = Math.min(fromIndex, toIndex);
        end   = Math.max(fromIndex, toIndex);

        me.setSelection(keys.slice(start, end + 1))
    }

    /**
     * @summary Replaces `items` with the distinct resolved keys in `items`, syncs card annotations, and emits
     * `selectionChange` when the set changed.
     * @param {Array<Object|String|Number>} items
     * @param {Boolean} [silent=false]
     */
    setSelection(items, silent=false) {
        let me       = this,
            resolved = [...new Set((items || []).map(item => me.resolveKey(item)).filter(key => key != null))],
            next     = me.singleSelect ? resolved.slice(0, 1) : resolved,
            changed  = next.length !== me.items.length || next.some((key, index) => key !== me.items[index]);

        me.items = next;
        me.syncAnnotations();

        if (changed && !silent) {
            me.emitSelectionChange()
        }
    }

    /**
     * @summary Moves focus to the nearest non-collapsed non-empty column in `step` direction (`-1` left, `+1` right),
     * preserving visual row offset clamped to the target column's length.
     * @param {Number} step `-1` or `1`
     * @returns {Promise<Neo.board.Card|null>}
     */
    async stepHorizontal(step) {
        let me     = this,
            {view} = me,
            record = me.getFocusedRecord(),
            colIndex, currentColumn, openColumns, pos, targetColumn, targetIndex, targetRecords, visualOffset;

        if (!view || !record) {
            return null
        }

        pos           = view.getCardPosition(record);
        currentColumn = view.getColumn(pos.status, pos.lane);
        openColumns   = view.getOpenColumns();
        colIndex      = openColumns.indexOf(currentColumn);

        if (colIndex < 0) {
            return null
        }

        visualOffset = Math.max(0, pos.index - (currentColumn?.windowStart || 0));

        for (let i = colIndex + step; i >= 0 && i < openColumns.length; i += step) {
            const candidate = openColumns[i],
                  records   = view.getColumnRecords(candidate.status, candidate.laneValue);

            if (records.length) {
                targetColumn  = candidate;
                targetRecords = records;
                break
            }
        }

        if (!targetColumn || !targetRecords?.length) {
            return null
        }

        targetIndex = Math.min((targetColumn.windowStart || 0) + visualOffset, targetRecords.length - 1);

        return me.focusRecord(view.getKey(targetRecords[targetIndex]))
    }

    /**
     * @summary Moves focus by `step` (`-1` up, `+1` down) within the active column, optionally extending the
     * contiguous range selection from `anchorKey`.
     * @param {Number} step `-1` or `1`
     * @param {Object} [options={}]
     * @param {Boolean} [options.extendSelection=false]
     * @returns {Promise<Neo.board.Card|null>}
     */
    async stepVertical(step, {extendSelection=false}={}) {
        let me     = this,
            {view} = me,
            record = me.getFocusedRecord(),
            column, currentKey, pos, records, targetIndex, targetKey;

        if (!view || !record) {
            return null
        }

        currentKey  = view.getKey(record);
        pos         = view.getCardPosition(record);
        column      = view.getColumn(pos.status, pos.lane);
        records     = view.getColumnRecords(pos.status, pos.lane);
        targetIndex = Math.max(0, Math.min(records.length - 1, pos.index + step));
        targetKey   = view.getKey(records[targetIndex]);

        if (extendSelection) {
            me.anchorKey ??= currentKey;
            me.selectColumnRange(column, me.anchorKey, targetKey);
            return me.focusRecord(targetKey, {preserveAnchor: true})
        }

        return me.focusRecord(targetKey)
    }

    /**
     * @summary Synchronizes `neo-selected`, `aria-selected`, and roving `tabIndex` across all cards in `view.cardMap`.
     * @param {Boolean} [silent=false]
     * @param {Function} [recordsFor] Reuses ordered records read during the current projection.
     */
    syncAnnotations(silent=false, recordsFor) {
        let me        = this,
            {view}    = me,
            rovingKey = me.getRovingTabKey(recordsFor);

        if (!view) {
            return
        }

        view.cardMap.forEach(card => me.annotateCard(card, rovingKey, silent))
    }

    /**
     * @summary Toggles a single record/key in `items` and fires `selectionChange`.
     * @param {Object|String|Number} item
     * @param {Boolean} [silent=false]
     */
    toggleSelection(item, silent=false) {
        let me  = this,
            key = me.resolveKey(item);

        if (key == null) {
            return
        }

        if (me.isSelected(key)) {
            me.deselect(key, silent)
        } else {
            me.select(key, silent)
        }
    }

    /**
     * @summary Removes DOM listeners and key bindings from the owning board.
     */
    unregister() {
        let me         = this,
            {id, view} = me;

        if (view && me.viewDomListeners) {
            view.removeDomListeners(me.viewDomListeners);
            me.viewDomListeners = null
        }

        view?.keys?.removeKeys([
            {fn: 'onKeyDownA',         key: 'A',          scope: id},
            {fn: 'onKeyDownCtrlDown',  key: 'Ctrl+Down',  scope: id},
            {fn: 'onKeyDownCtrlLeft',  key: 'Ctrl+Left',  scope: id},
            {fn: 'onKeyDownCtrlRight', key: 'Ctrl+Right', scope: id},
            {fn: 'onKeyDownCtrlUp',    key: 'Ctrl+Up',    scope: id},
            {fn: 'onKeyDownDown',      key: 'Down',       scope: id},
            {fn: 'onKeyDownEnd',       key: 'End',        scope: id},
            {fn: 'onKeyDownEnter',     key: 'Enter',      scope: id},
            {fn: 'onKeyDownEscape',    key: 'Escape',     scope: id},
            {fn: 'onKeyDownHome',      key: 'Home',       scope: id},
            {fn: 'onKeyDownLeft',      key: 'Left',       scope: id},
            {fn: 'onKeyDownRight',     key: 'Right',      scope: id},
            {fn: 'onKeyDownSelectAll', key: 'Ctrl+A',     scope: id},
            {fn: 'onKeyDownSelectAll', key: 'Meta+A',     scope: id},
            {fn: 'onKeyDownShiftDown', key: 'Shift+Down', scope: id},
            {fn: 'onKeyDownShiftUp',   key: 'Shift+Up',   scope: id},
            {fn: 'onKeyDownSpace',     key: 'Space',      scope: id},
            {fn: 'onKeyDownUp',        key: 'Up',         scope: id}
        ]);

        super.unregister()
    }
}

export default Neo.setupClass(SelectionModel);
