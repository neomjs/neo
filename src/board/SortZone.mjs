import NeoArray        from '../util/Array.mjs';
import SortZone        from '../draggable/container/SortZone.mjs';
import VDomUtil        from '../util/VDom.mjs';
import {getTitleField} from './CardItems.mjs';

/**
 * @summary The board's one drag zone: a card or multi-selection moves within or across columns, the drop commits
 * through `owner.moveCard` (once per record under `isNormalizing` for a multi-selection, plus one `cardsMove` event),
 * and a cancelled drag (Escape), an off-board release or a same-position drop writes nothing.
 * @description The engine zone sorts its owner's direct children, which on a board are the columns. This zone points
 * the sort at the active column's body instead: it snapshots that body's cards, {@link #updateItem} positions them,
 * and the engine's vertical sort runs unchanged inside the body. A pointer over another column moves the hidden
 * card's node there ({@link #enterColumn}); the card is its own gap. During the drag only DOM deltas move. At the
 * drop the node goes back to where it started and `moveCard` commits, so the board's re-projection moves the card
 * exactly as it does for every other writer. The drop is addressed by its neighbour's key ({@link #getDropAnchor}),
 * never by a slot number: a sliced column renders a window of its records, so its slots are not the column's indices.
 *
 * When a drag begins on a selected card and the board's selection holds more than one record, {@link #getDragProxyConfig}
 * builds a paper-stack proxy with the dragged card's clone in front, up to four clones of the other selected cards
 * behind it (`.neo-board-stack-card`, with alternating `--stack-angle`, `--stack-offset`, `--stack-opacity`, and
 * FLIP origin offsets `--flip-x` / `--flip-y`), and a `.neo-board-stack-count` badge with the selection's total.
 * Offscreen selected records in a sliced column render a title-only clone. Rendered selected cards receive
 * `.neo-board-card-ghost` until the gesture ends. The drop lands the selection as one block in board order, starting
 * at the slot ({@link #processDragEnd}).
 *
 * The drag state stays plain fields (`activeColumn`, `startColumn`, `columnRects`, `currentIndex`): the shape the
 * dashboard zone's `DragCoordinator` hooks drive, so a cross-window board can register this zone per window later.
 * @class Neo.board.SortZone
 * @extends Neo.draggable.container.SortZone
 */
class BoardSortZone extends SortZone {
    static config = {
        /**
         * @member {String} className='Neo.board.SortZone'
         * @protected
         */
        className: 'Neo.board.SortZone',
        /**
         * @member {String} ntype='board-sortzone'
         * @protected
         */
        ntype: 'board-sortzone',
        /**
         * Card rects are body-relative: the body is the positioned parent while its cards sort
         * @member {Boolean} adjustItemRectsToParent=true
         */
        adjustItemRectsToParent: true,
        /**
         * The cross-window board is a later leaf
         * @member {Boolean} enableProxyToPopup=false
         */
        enableProxyToPopup: false
    }

    /**
     * The column whose body sorts right now
     * @member {Neo.board.Column|null} activeColumn=null
     */
    activeColumn = null
    /**
     * The active body's height and position before the drag pinned them
     * @member {Object|null} bodyStyle=null
     */
    bodyStyle = null
    /** @member {Promise<void>|null} columnEntry=null The current gesture's asynchronous column transition. */
    columnEntry = null
    /**
     * The active body's cards in DOM order, the dragged one included
     * @member {Neo.component.Base[]|null} columnItems=null
     */
    columnItems = null
    /**
     * Every column with its rect, collapsed ones included, for the hit test
     * @member {Object[]|null} columnRects=null
     */
    columnRects = null
    /**
     * Measured DOMRects of rendered selected cards at drag start, keyed by record key, for the stack's FLIP fly-in
     * @member {Map<String|Number,Neo.util.Rectangle>|null} dragCardRects=null
     */
    dragCardRects = null
    /**
     * The dragged card's record, pinned at the start: the drop commits it even when the card's view is reused
     * @member {Object|null} dragRecord=null
     */
    dragRecord = null
    /**
     * The records moving with this drag: the dragged record first, followed by any other selected records in their
     * current visual order across the board
     * @member {Object[]|null} dragRecords=null
     */
    dragRecords = null
    /**
     * True while {@link #enterColumn} moves and re-measures
     * @member {Boolean} isEnteringColumn=false
     */
    isEnteringColumn = false
    /** @member {Object|null} pendingColumnMove=null Latest pointer sample received during a column transition. */
    pendingColumnMove = null
    /**
     * The column the drag started in
     * @member {Neo.board.Column|null} startColumn=null
     */
    startColumn = null

    /**
     * @summary Arms every card as a drag target and disarms the columns. The engine arms `owner.items`, which on a
     * board are the columns, and the main thread starts a drag only on a `neo-draggable` element.
     * @param {Boolean} draggable
     */
    adjustItemCls(draggable) {
        super.adjustItemCls(draggable);

        this.owner.getColumns().forEach(column => column.body && this.getColumnCards(column).forEach(card => this.armCard(card, draggable)))
    }

    /**
     * @summary Marks one card as a drag target, or unmarks it
     * @param {Neo.board.Card} card
     * @param {Boolean} [draggable=true]
     */
    armCard(card, draggable=true) {
        const wrapperCls = card.wrapperCls || [];

        NeoArray.toggle(wrapperCls, 'neo-draggable', draggable);
        card.wrapperCls = wrapperCls
    }

    /**
     * @summary Pins a column's body and positions its cards absolutely at their measured rects, so the engine's
     * vertical sort can move them.
     * @description The rects are taken in the body's content space: each card's top adds the body's `scrollTop`, and
     * the sort reads that offset as `scrollTop`. The cards' root keeps at least the height its cards gave it in the
     * flow, so the body's content, its end padding included, stays as tall as before: the browser has nothing to clamp,
     * and the column stays where its user scrolled it. The root is not a spacer, so a sliced column's projection during
     * the drag leaves its height alone. The pin rides the body's update, which the cards' updates merge into.
     * @param {Neo.board.Column} column
     * @param {Neo.board.Card} card The dragged card
     * @param {Number} index Its index among the column's cards
     */
    async beginColumnSort(column, card, index) {
        let me        = this,
            {body}    = column,
            cardsRoot = body.getVdomItemsRoot(),
            items     = me.getColumnCards(column).filter(item => item !== card),
            bodyRect, cardsRect, rects, scrollTop;

        items.splice(index, 0, card);

        [rects, {scrollTop = 0}] = await me.trap(Promise.all([
            me.owner.getDomRect([body.id, cardsRoot.id, ...items.map(item => item.id)]),
            Neo.main.DomAccess.getAttributes({attributes: ['scrollTop'], id: body.id, windowId: me.windowId})
        ]));
        if (me.isDestroying || me.isDestroyed || card.isDestroyed || column.isDestroyed || me.dragComponent !== card) return;
        [bodyRect, cardsRect] = rects.splice(0, 2);

        rects.forEach(rect => {
            rect.x -= bodyRect.x;
            rect.y += scrollTop - bodyRect.y
        });

        cardsRoot.style = {...cardsRoot.style, minHeight: `${cardsRect.height}px`};
        me.bodyStyle    = {height: body.style?.height, position: body.style?.position};
        body.style      = {...body.style, height: `${bodyRect.height}px`, position: 'relative'};

        Object.assign(me, {
            activeColumn           : column,
            columnItems            : items,
            currentIndex           : index,
            indexMap               : Object.fromEntries(items.map((item, i) => [i, i])),
            itemRects              : rects,
            itemStyles             : items.map(item => ({height: item.style?.height, width: item.style?.width})),
            ownerRect              : bodyRect,
            reversedLayoutDirection: false,
            scrollLeft             : 0,
            scrollTop,
            sortableItems          : items,
            sortBoundaryRect       : bodyRect,
            sortDirection          : 'vertical'
        });

        items.forEach((item, i) => {
            const rect = rects[i];

            item.wrapperStyle = {
                ...item.wrapperStyle,
                height  : `${rect.height}px`,
                left    : `${rect.x}px`,
                margin  : '0px',
                position: 'absolute',
                top     : `${rect.y}px`,
                width   : `${rect.width}px`
            }
        })
    }

    /**
     * @summary Restores the dragged card to normal flow, moves its node into the target column's body at the
     * pointer's index (the end of a collapsed column, 0 in an empty one), and sorts there from now on.
     * @param {Neo.board.Column} column
     * @param {Object} data The drag-move payload
     */
    async enterColumn(column, data) {
        let me      = this,
            card    = me.dragComponent,
            current = () => !me.isDestroying && !me.isDestroyed && me.dragComponent === card &&
                card && !card.isDestroyed && !column.isDestroyed,
            index;

        if (!current()) return;
        me.isEnteringColumn = true;

        try {
            me.restoreColumn();
            await me.trap(card.promiseUpdate());
            if (!current()) return;

            index = column.collapsed ? column.body.items.length : await me.trap(me.getIndexAt(column, data.clientY));
            if (!current()) return;

            await me.trap(Neo.applyDeltas(me.windowId, [{
                action  : 'moveNode',
                id      : card.id,
                index,
                parentId: column.body.getVdomItemsRoot().id
            }]));
            if (!current()) return;

            if (column.collapsed) {
                Object.assign(me, {activeColumn: column, currentIndex: index, itemRects: null})
            } else {
                await me.beginColumnSort(column, card, index)
            }

            if (!current()) return;
            me.traceEvent({t: 'column', i: index, status: column.status, ...(me.owner?.laneField ? {lane: column.laneValue ?? null} : {})})
        } finally {
            me.isEnteringColumn = false
        }
    }

    /**
     * @summary The board's card a drag path starts on, or null
     * @param {Object[]} path
     * @returns {Neo.board.Card|null}
     */
    getCardFromPath(path) {
        const {owner} = this;

        for (const node of path) {
            if (node.cls?.includes('neo-board-card-inline-editor') ||
                node.cls?.includes('neo-board-card-menu-button')) {
                return null
            }

            const component = Neo.getComponent(node.id);

            if (component?.board === owner && owner.getCard(component.record) === component) {
                return component.isEditingTitle ? null : component
            }
        }

        return null
    }

    /**
     * @summary The measured column under the pointer, or null over a gap. A horizontal-only query matches on x.
     * @param {Number} clientX
     * @param {Number} [clientY]
     * @returns {Neo.board.Column|null}
     */
    getColumnAt(clientX, clientY) {
        return this.columnRects?.find(({rect}) => Number.isFinite(clientY)
            ? rect.containsPoint(clientX, clientY)
            : clientX >= rect.left && clientX <= rect.right
        )?.column || null
    }

    /**
     * @summary Resolves a release against the current board bounds. Board whitespace keeps the last slot if its
     * column is still visible. A direct column hit sorts at the release point.
     * @param {Object} point The source viewport's pointer coordinates.
     * @returns {Promise<{column: Neo.board.Column, keepSlot: Boolean}|null>}
     * @protected
     */
    async getReleaseTarget({clientX, clientY}) {
        const {owner}           = this, columns = owner.getColumns();
        const [board, ...rects] = await owner.getDomRect([owner.id, ...columns.map(column => column.id)]);
        if (!board.width || !board.height || !board.containsPoint(clientX, clientY)) return null;

        let lastSlot = null;
        for (const [i, column] of columns.entries()) {
            const rect = rects[i];
            if (column.isDestroyed || column.hidden || (owner.laneField && owner.getLane(column.laneValue)?.collapsed) ||
                !rect.width || !rect.height) continue;
            if (rect.containsPoint(clientX, clientY)) return {column, keepSlot: false};
            if (column === this.activeColumn && board.intersects(rect)) lastSlot = {column, keepSlot: true}
        }
        return lastSlot
    }

    /**
     * @summary A column's cards in body order: the zone's one definition of what sorts, so anything else a body holds
     * (a spacer, an indicator) stays out of the sort
     * @param {Neo.board.Column} column
     * @returns {Neo.board.Card[]}
     */
    getColumnCards(column) {
        return column.body.items.filter(item => this.isItemRootDragTarget(item))
    }

    /**
     * @summary Removes `.neo-board-card-ghost` from every card on the board.
     * @protected
     */
    clearGhostCards() {
        this.owner?.cardMap?.forEach(card => {
            !card.isDestroyed && card.cls?.includes('neo-board-card-ghost') &&
                card.toggleCls('neo-board-card-ghost', false)
        })
    }

    /**
     * @summary Clones a record's card VDOM for the drag proxy, or builds a title-only card VDOM when the record is
     * offscreen in a sliced column.
     * @param {Object} record
     * @returns {Object}
     * @protected
     */
    cloneCardVdom(record) {
        const
            {owner} = this,
            card    = owner.getCard(record),
            clone   = card?.vdom
                ? VDomUtil.clone(card.vdom)
                : {
                    tag  : 'div',
                    cls  : ['neo-board-card'],
                    style: record?.color ? {'--neo-board-card-accent': record.color} : {},
                    cn   : [{
                        tag : 'div',
                        cls : ['neo-board-card-title'],
                        text: String(record?.[getTitleField(owner.cardItems)] ?? owner.getKey(record))
                    }]
                },
            cls     = Array.isArray(clone.cls) ? [...clone.cls] : clone.cls ? [clone.cls] : ['neo-board-card'],
            style   = {...clone.style};

        NeoArray.remove(cls, ['neo-board-card-ghost', 'neo-board-card-slot']);
        delete style.height;
        delete style.left;
        delete style.margin;
        delete style.position;
        delete style.top;
        delete style.visibility;
        delete style.width;

        clone.cls   = cls;
        clone.style = style;

        return clone
    }

    /**
     * @summary Returns the drag proxy configuration: a single card drags as today, while a multi-selection returns a
     * paper-stack VDOM with the dragged card's clone in front, up to four `.neo-board-stack-card` clones behind it
     * (alternating `--stack-angle` between 2 and 6 degrees, `--stack-offset`, opacity falling from 0.9 to 0.6, and FLIP
     * origin offsets `--flip-x` / `--flip-y`), and a `.neo-board-stack-count` badge with the total of selected cards:
     * past five the stack stops growing, and only the number says how many.
     * @returns {Object}
     */
    getDragProxyConfig() {
        let me      = this,
            base    = super.getDragProxyConfig(),
            {owner} = me,
            records = me.dragRecords || me.getSelectedDragRecords(me.dragRecord || me.dragComponent?.record);

        delete base.vdom;
        base.cls = (base.cls || []).filter(item => item !== 'neo-board-stack-proxy' && item !== 'neo-board-stack-reverse');

        if (!records || records.length <= 1) {
            return base
        }

        const
            angles       = [3, -4, 5, -6],
            leadRecord   = records[0],
            leadClone    = me.cloneCardVdom(leadRecord),
            leadRect     = me.dragCardRects?.get(owner.getKey(leadRecord)) || me.dragElementRect || null,
            stackRecords = records.slice(1, 5),
            stackClones  = stackRecords.map((record, i) => {
                const
                    clone   = me.cloneCardVdom(record),
                    rect    = me.dragCardRects?.get(owner.getKey(record)) || null,
                    angle   = angles[i % angles.length],
                    offset  = (i + 1) * 6,
                    opacity = Number((0.9 - i * 0.1).toFixed(2)),
                    flipX   = leadRect && rect ? Math.round(rect.x - leadRect.x) : 0,
                    flipY   = leadRect && rect ? Math.round(rect.y - leadRect.y) : 0;

                NeoArray.add(clone.cls, 'neo-board-stack-card');

                clone.style = {
                    ...clone.style,
                    '--flip-x'       : `${flipX}px`,
                    '--flip-y'       : `${flipY}px`,
                    '--stack-angle'  : `${angle}deg`,
                    '--stack-offset' : `${offset}px`,
                    '--stack-opacity': `${opacity}`,
                    opacity          : `${opacity}`,
                    zIndex           : `${4 - i}`
                };

                return clone
            }),
            cn = [leadClone, ...stackClones, {tag: 'span', cls: ['neo-board-stack-count'], text: String(records.length)}];

        NeoArray.add(leadClone.cls, 'neo-board-stack-lead');
        leadClone.style = {...leadClone.style, zIndex: '5'};

        return {
            ...base,
            cls : [...base.cls, 'neo-board-stack-proxy'],
            vdom: {
                tag: 'div',
                cls: ['neo-board-stack'],
                cn
            }
        }
    }

    /**
     * @summary Resolves the records participating in a drag: when `leadRecord` is selected and the selection holds more
     * than one record, returns `[leadRecord, ...otherSelectedRecords]` with the other selected records in their current
     * visual order across the board's columns; otherwise returns `[leadRecord]` (or `[]` when no lead record resolves).
     * @description Filtered-out records remain selected but do not participate. An explicit lead must be the current
     * visible Store record; an omitted lead falls back from visible selected focus to the first visible selected key.
     * @param {Object|null} [leadRecord=null]
     * @returns {Object[]}
     */
    getSelectedDragRecords(leadRecord=null) {
        let me      = this,
            {owner} = me,
            sm      = owner?.selectionModel,
            store   = owner?.store,
            leadKey, others;

        if (!store) {
            return []
        }

        if (!leadRecord && sm?.items?.length > 1) {
            leadRecord = sm.focusedKey != null && sm.isSelected(sm.focusedKey) ? store.get(sm.focusedKey) : null;

            if (!leadRecord) {
                leadKey    = sm.items.find(key => store.get(key));
                leadRecord = leadKey != null ? store.get(leadKey) : null
            }
        }

        if (!leadRecord || store.get(owner.getKey(leadRecord)) !== leadRecord) {
            return []
        }

        leadKey = owner.getKey(leadRecord);

        if (!sm || sm.items.length <= 1 || !sm.isSelected(leadKey)) {
            return [leadRecord]
        }

        others = me.getBoardRecords(record => record !== leadRecord && sm.isSelected(owner.getKey(record)));

        return [leadRecord, ...others]
    }

    /**
     * @summary The board's records in board order, column by column as `owner.getColumns()` lists them and within a
     * column as `getColumnRecords()` sorts it, kept where `filterFn` returns true.
     * @param {Function} filterFn Receives each record
     * @returns {Object[]}
     * @protected
     */
    getBoardRecords(filterFn) {
        const {owner} = this;

        return owner.getColumns().flatMap(column => column?.status ? owner.getColumnRecords(column.status, column.laneValue).filter(filterFn) : [])
    }

    /**
     * @summary The index a card enters a column at, by the engine's own rule. The vertical sort measures the drag
     * proxy's top (`clientY − offsetY`) against a slot's top and moves on past 55% of the neighbour's height, so the
     * entry takes the first card the proxy has not passed by that much. An index from the pointer alone would be
     * switched back on the next move.
     * @param {Neo.board.Column} column
     * @param {Number} clientY
     * @returns {Promise<Number>}
     */
    async getIndexAt(column, clientY) {
        const
            cards = this.getColumnCards(column).filter(item => item !== this.dragComponent),
            rects = cards.length ? await this.owner.getDomRect(cards.map(card => card.id)) : [],
            top   = clientY - (this.offsetY || 0),
            index = rects.findIndex(rect => top <= rect.y + rect.height * 0.55);

        return index < 0 ? rects.length : index
    }

    /**
     * @summary Only the board's cards start a drag; a column is not a drag target in v0
     * @param {*} item
     * @returns {Boolean}
     */
    isItemRootDragTarget(item) {
        return !!item?.record && this.owner.getCard(item.record) === item
    }

    /**
     * @summary Hit-tests the pointer against the columns: another column takes the card over, the active one sorts
     * with the engine's vertical sort, a collapsed one only waits for the drop. The latest move received during
     * column entry waits for that entry; an ending gesture owns its final position instead.
     * @param {Object} data
     */
    async onDragMove(data) {
        let me = this,
            column;

        if (!me.columnRects || me.isScrolling || me.dragEndActive || me.isDestroying || me.isDestroyed) {
            return
        }

        if (me.isEnteringColumn) {
            me.pendingColumnMove = data;
            return
        }

        column = me.getColumnAt(data.clientX, data.clientY);

        if (!column) {
            me.isOverDragging = false;
            return
        }

        if (column !== me.activeColumn) {
            const entry = me.columnEntry = me.enterColumn(column, data);
            try {
                await entry
            } finally {
                if (me.columnEntry === entry) me.columnEntry = null
            }

            if (me.pendingColumnMove && !me.dragEndActive) {
                const pending = me.pendingColumnMove;
                me.pendingColumnMove = null;
                await me.onDragMove(pending)
            }
        } else if (me.itemRects) {
            await super.onDragMove(data)
        }
    }

    /**
     * @summary Starts a card drag: snapshots the unpinned card VDOM for the proxy, reads every column's rect for the
     * hit test, and pins the active column's body for the sort. When the dragged card belongs to a multi-selection,
     * snapshots rendered selected cards' rects for the stack proxy's FLIP fly-in and marks the originals with
     * `.neo-board-card-ghost`.
     * @param {Object} data
     */
    async onDragStart(data) {
        let me      = this,
            {owner} = me,
            card, cardRects, column, columns, dragRecords, rectMap, rects, renderedCards, trace;

        if (!owner.dragResortable) {
            return
        }

        card   = me.getCardFromPath(data.path);
        column = card?.parent?.parent;

        if (!card || !column?.body) {
            return
        }

        dragRecords   = me.getSelectedDragRecords(card.record);
        renderedCards = dragRecords.length > 1
            ? dragRecords.map(record => owner.getCard(record)).filter(Boolean)
            : [];
        columns       = owner.getColumns().filter(item => item.body && !(owner.laneField && owner.getLane(item.laneValue)?.collapsed));
        rects         = await owner.getDomRect([
            ...columns.map(item => item.id),
            ...renderedCards.map(item => item.id)
        ]);
        cardRects     = rects.splice(columns.length);
        rectMap       = new Map();

        renderedCards.forEach((item, i) => {
            cardRects[i] && rectMap.set(owner.getKey(item.record), cardRects[i])
        });

        Object.assign(me, {
            dragCardRects        : rectMap,
            dragComponent        : card,
            dragElement          : {...me.cloneCardVdom(card.record), id: card.id},
            dragFocusOwner       : card.containsFocus ? card : null,
            dragRecord           : card.record,
            dragRecords,
            lastIntersectionRatio: 1,
            startColumn          : column
        });

        me.dragProxyConfig = me.getDragProxyConfig();

        if (dragRecords.length > 1) {
            me.setGhostCards(dragRecords, true)
        }

        await me.beginColumnSort(column, card, me.getColumnCards(column).indexOf(card));

        me.startIndex = me.currentIndex;

        trace = {events: [], items: me.columnItems.map(item => item.id), ownerId: column.body.id, startIndex: me.startIndex, startedAt: Date.now(), zoneId: me.id};

        SortZone.activeTrace = trace;
        SortZone.traces.push(trace);
        SortZone.traces.length > SortZone.traceLimit && SortZone.traces.shift();

        // The hit test opens last, as the engine's `itemRects` does: an earlier move would enter an unpinned column
        me.columnRects = columns.map((item, i) => ({column: item, rect: rects[i]}));

        await me.dragStart(data);

        // The hidden card keeps its box in the flow and travels with the pointer: `.neo-board-card-slot` draws it
        // as the landing slot
        card.set({cls: [...card.cls, 'neo-board-card-slot'], wrapperStyle: {...card.wrapperStyle, visibility: 'hidden'}})
    }

    /**
     * @summary The keys of the cards around the drop slot, read in the sort's visual order without the dragged card:
     * the card after the slot, or at the end of the rendered window the card before it. The visual order is
     * `columnItems[indexMap[i]]`, what {@link #updateItem} paints; a collapsed column snapshots no cards, and a board
     * whose store was detached mid-drag has no keys to name.
     * @returns {{afterId: (String|Number|null), beforeId: (String|Number|null)}}
     */
    getDropAnchor() {
        let me                                                         = this,
            {activeColumn, columnItems, currentIndex, indexMap, owner} = me,
            next, others, prev;

        if (!owner.store || !activeColumn || activeColumn.collapsed || !columnItems || !indexMap) {
            return {afterId: null, beforeId: null}
        }

        others = columnItems.map((item, i) => columnItems[indexMap[i]]).filter(item => item && item !== me.dragComponent);
        next   = others[currentIndex];
        prev   = others[currentIndex - 1];

        return {afterId: !next && prev ? owner.getKey(prev.record) : null, beforeId: next ? owner.getKey(next.record) : null}
    }

    /**
     * @summary The move a drop commits, resolved against the live store right before the write, or null to write
     * nothing.
     * @description The dragged record must still be the store's record under its key. A removed record, or one the
     * store replaced under that key, cancels the drop: the gesture began on a record that is gone, and moving its
     * replacement would hand the drag to data the user never held (`Column#scrollToRecord` rejects a replacement across
     * its await the same way). An anchor that left the column during the drop cancels it rather than appending, and
     * without an anchor only a collapsed or empty column takes the card: an expanded column that holds records but
     * rendered no neighbour names no place. A drop where the record already sits writes nothing, judged by its place
     * among the column's records rather than by slot numbers, which a sliced column does not share with them.
     * @param {Object}              data
     * @param {String|Number|null}  data.afterId
     * @param {String|Number|null}  data.beforeId
     * @param {Neo.board.Column} data.column The column the drop landed in
     * @param {Object}              data.record The record the drag started with
     * @returns {Object|null} The `moveCard` arguments, or null
     */
    resolveDrop({afterId, beforeId, column, record}) {
        let {owner}  = this,
            lane     = column.laneValue ?? null,
            {status} = column,
            others, position, records;

        if (!record || !owner.store || owner.store.get(owner.getKey(record)) !== record) {
            return null
        }

        records = owner.getColumnRecords(status, lane);
        others  = records.filter(item => item !== record);

        if (beforeId != null) {
            position = others.findIndex(item => owner.getKey(item) === beforeId)
        } else if (afterId != null) {
            position = others.findIndex(item => owner.getKey(item) === afterId);
            position > -1 && position++
        } else {
            position = column.collapsed || !others.length ? others.length : -1
        }

        return position < 0 || records.indexOf(record) === position ? null : {afterId, beforeId, lane, record, status}
    }

    /**
     * @summary Ends a card drag after its column entry and final pointer position settle. Cancellation waits for
     * entry cleanup without replaying the pointer. Board whitespace preserves the preview slot, and an off-board release
     * cancels the move. The node goes back to where it started, so the DOM matches the component
     * tree again. Then the drop commits through `owner.moveCard` (for a multi-selection, once per record under
     * `owner.isNormalizing` followed by one `cardsMove` event), addressed by the drop's neighbour ({@link #getDropAnchor})
     * and checked against the store after the last await ({@link #resolveDrop}). A multi-selection lands as one block
     * in board order, starting at the slot, whichever of its cards the drag held. A cancel, a drop where the record
     * already sits, or a drop whose record or neighbour the store no longer holds there writes nothing.
     * @param {Object} data
     */
    async processDragEnd(data) {
        const me = this;

        me.isOverDragging = false;
        await me.columnEntry;
        if (me.isDestroying || me.isDestroyed) return;

        const terminal = Number.isFinite(data.clientX) && Number.isFinite(data.clientY) ? data : me.pendingColumnMove;
        me.pendingColumnMove = null;

        let releaseColumn = data.cancelled ? null : me.activeColumn;
        if (releaseColumn && terminal) {
            const liveSource = me.columnRects && me.dragComponent && !me.dragComponent.isDestroyed &&
                !me.owner.isDestroying && !me.owner.isDestroyed && me.dragRecord &&
                me.owner.store?.get(me.owner.getKey(me.dragRecord)) === me.dragRecord;

            const target = liveSource ? await me.getReleaseTarget(terminal) : null;
            releaseColumn = target?.column;
            if (releaseColumn && releaseColumn !== me.activeColumn) {
                await me.enterColumn(releaseColumn, terminal)
            } else if (target && !target.keepSlot && me.itemRects) {
                // Apply the release once; it must not start the Engine's continuing overdrag poll.
                const moving = super.onDragMove(terminal);
                me.isOverDragging = false;
                await moving
            }
        }

        let
            {activeColumn, dragRecord, owner, startColumn, startIndex} = me,
            // Read before restoreColumn clears the sort's snapshot; a cancel names no place
            anchor                                         = data.cancelled ? null : me.getDropAnchor(),
            card                                           = me.dragComponent,
            index                                          = me.currentIndex,
            records                                        = me.dragRecords || me.getSelectedDragRecords(dragRecord),
            commit;

        await me.timeout(10);

        if (!card || !startColumn) {
            me.clearGhostCards();
            return
        }

        me.restoreColumn();
        card.isDestroyed || card.set({
            cls         : card.cls.filter(item => item !== 'neo-board-card-slot'),
            wrapperStyle: {...card.wrapperStyle, visibility: null}
        });
        me.clearGhostCards();

        // A silent tree sync left the vdom without the moved node, and the next re-projection could not move it
        if (activeColumn !== startColumn && !card.isDestroyed && !startColumn.isDestroyed) {
            // The tree never moved: the card's place among the body's items is its home slot
            await Neo.applyDeltas(me.windowId, [{
                action  : 'moveNode',
                id      : card.id,
                index   : startColumn.body.items.indexOf(card),
                parentId: startColumn.body.getVdomItemsRoot().id
            }])
        }

        // After the last await, so the store these checks read is the one the write sees
        commit = activeColumn && activeColumn === releaseColumn && !activeColumn.isDestroyed &&
            owner.getColumn(activeColumn.status, activeColumn.laneValue) === activeColumn ?
            me.resolveDrop({...anchor, column: activeColumn, record: dragRecord}) : null;

        if (!commit && me.dragProxy && !me.dragProxy.isDestroyed) {
            me.dragProxy.toggleCls('neo-board-stack-reverse', true)
        }

        me.traceEvent({t: commit ? 'end' : (data.cancelled ? 'cancel' : 'end'), from: startIndex, to: index, noop: !commit});

        Object.assign(me, {
            activeColumn     : null,
            columnEntry      : null,
            columnRects      : null,
            currentIndex     : -1,
            dragCardRects    : null,
            dragProxyConfig  : null,
            dragRecord       : null,
            dragRecords      : null,
            indexMap         : null,
            itemRects        : null,
            itemStyles       : null,
            ownerRect        : null,
            pendingColumnMove: null,
            sortBoundaryRect : null,
            sortableItems    : null,
            startColumn      : null,
            startIndex       : -1
        });

        if (commit) {
            if (records.length > 1) {
                const
                    dragged        = new Set(records),
                    // Read before the first write moves anything: the board's own records, so a replaced one drops out
                    liveRecords    = me.getBoardRecords(record => dragged.has(record)),
                    fromColumns    = new Set(),
                    movedRecords   = [],
                    targetColumn   = owner.getColumn(commit.status, commit.lane),
                    wasNormalizing = owner.isNormalizing;

                liveRecords.forEach(record => {
                    const
                        pos = owner.getCardPosition(record),
                        col = owner.getColumn(pos.status, pos.lane);

                    col && fromColumns.add(col)
                });

                owner.isNormalizing = true;

                try {
                    const lead = owner.moveCard(commit);

                    if (lead) {
                        const
                            leadIndex = liveRecords.indexOf(lead),
                            // Moves each record next to the one placed before it, starting at the held card
                            place     = (list, side) => {
                                let anchor = owner.getKey(lead);

                                return list.map(record => {
                                    const moved = owner.moveCard({[side]: anchor, lane: commit.lane, record, status: commit.status});
                                    moved && (anchor = owner.getKey(moved));
                                    return moved
                                }).filter(Boolean)
                            };

                        // The held card took the slot: the cards above it in board order go in front of it, nearest
                        // first, and the rest follow it, so the block starts at the slot in board order
                        movedRecords.push(
                            ...place(liveRecords.slice(0, leadIndex).reverse(), 'beforeId').reverse(),
                            lead,
                            ...place(liveRecords.slice(leadIndex + 1), 'afterId')
                        )
                    }
                } finally {
                    owner.isNormalizing = wasNormalizing
                }

                targetColumn && !targetColumn.isDestroyed && owner.reconcileColumn(targetColumn);

                fromColumns.forEach(col => {
                    col !== targetColumn && !col.isDestroyed && owner.reconcileColumn(col)
                });

                if (movedRecords.length) {
                    owner.fire('cardsMove', {
                        laneValue: commit.lane ?? null,
                        records  : movedRecords,
                        status   : commit.status
                    })
                }
            } else {
                owner.moveCard(commit)
            }
        }

        me.dragComponent = null;

        // A cancel or a drop that wrote nothing re-projects no column: a window the held card pinned returns here
        startColumn.windowPinned && !startColumn.isDestroyed && owner.reconcileColumn(startColumn);

        me.dragEnd(data)
    }

    /**
     * @summary Toggles `.neo-board-card-ghost` on rendered cards for the supplied records.
     * @param {Object[]} records
     * @param {Boolean} isGhost
     * @protected
     */
    setGhostCards(records, isGhost) {
        const {owner} = this;

        records?.forEach(record => {
            const card = owner?.getCard(record);
            card && !card.isDestroyed && card.toggleCls('neo-board-card-ghost', isGhost)
        })
    }

    /**
     * @summary Returns the active column's cards and body to the flow, and their root to its own height; the dragged
     * card keeps its visibility
     */
    restoreColumn() {
        let me                                                 = this,
            {activeColumn, bodyStyle, columnItems, itemStyles} = me;

        columnItems?.forEach((item, i) => {
            if (!item.isDestroyed) {
                item.wrapperStyle = {
                    ...item.wrapperStyle,
                    height  : itemStyles[i].height || null,
                    left    : null,
                    margin  : null,
                    position: null,
                    top     : null,
                    width   : itemStyles[i].width || null
                }
            }
        });

        if (bodyStyle && activeColumn && !activeColumn.isDestroyed) {
            const {body} = activeColumn;

            delete body.getVdomItemsRoot().style?.minHeight;
            body.style = {...body.style, height: bodyStyle.height || null, position: bodyStyle.position || null}
        }

        me.bodyStyle = me.columnItems = null
    }

    /**
     * @summary Positions one of the active column's cards: the engine resolves its items from the owner, which here
     * holds the columns
     * @param {Number} index
     * @param {Object} rect
     */
    updateItem(index, rect) {
        const item = this.columnItems?.[this.indexMap[index]];

        if (item) {
            item.wrapperStyle = {...item.wrapperStyle, left: `${rect.x}px`, top: `${rect.y}px`}
        }
    }
}

export default Neo.setupClass(BoardSortZone);
