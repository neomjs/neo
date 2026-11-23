import Card            from './Card.mjs';
import CardEditor      from './CardEditor.mjs';
import {getTitleField} from './CardItems.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import Column          from './Column.mjs';
import ColumnSortZone  from './ColumnSortZone.mjs';
import Container       from '../container/Base.mjs';
import LaneRow         from './LaneRow.mjs';
import NeoArray        from '../util/Array.mjs';
import SelectionModel  from './SelectionModel.mjs';
import SortZone        from './SortZone.mjs';
import Store           from '../data/Store.mjs';
import VNodeUtil       from '../util/VNode.mjs';

/**
 * @summary A Kanban board: one store of cards projected into columns, the records as the truth.
 * @description The board owns no card state. A column is the records whose `statusField` equals the column's
 * `status` (and, with lanes, whose `laneField` equals its `laneValue`), sorted by `orderField`. A move is a record
 * update and the view follows: on `recordChange` only the columns the record left or entered re-project, and the
 * card component survives the move. A re-projection that finds a card already at its index is a no-op, so the board
 * zone's DOM move lands first and is not undone.
 *
 * Columns come from `columns`, or, when it is null, from the store's distinct status values in first-seen order.
 * Ids derive from the status and the record key (`<board>__col__<status>`, `<board>__card__<key>`), so a whitebox
 * test or an agent on the Neural Link addresses any column or card without an index.
 *
 * Cards drag through one `Neo.board.SortZone` on the board (`dragResortable`, `sortZoneConfig`), and its drop
 * commits through the board's single writer, {@link #moveCard}.
 * @class Neo.board.Container
 * @extends Neo.container.Base
 */
class Board extends Container {
    static config = {
        /**
         * @member {String} className='Neo.board.Container'
         * @protected
         */
        className: 'Neo.board.Container',
        /**
         * @member {String} ntype='board'
         * @protected
         */
        ntype: 'board',
        /**
         * @member {String[]} baseCls=['neo-board']
         * @protected
         */
        baseCls: ['neo-board'],
        /**
         * Accessible label applied to the board root (`role="group"`)
         * @member {String} ariaLabel_='Kanban board'
         */
        ariaLabel_: 'Kanban board',
        /**
         * Config overrides for the board's shared {@link Neo.board.CardEditor}
         * @member {Object|null} cardEditorConfig=null
         */
        cardEditorConfig: null,
        /**
         * The class of the board's shared card editor dialog
         * @member {Function} cardEditorModule=CardEditor
         */
        cardEditorModule: CardEditor,
        /**
         * The items every card renders, in order: `{type, field}` per item ({@link Neo.board.CardItems})
         * @member {Object[]} cardItems_
         */
        cardItems_: [{type: 'title'}, {type: 'tags'}, {type: 'progress'}, {type: 'dueDate'}, {type: 'avatars'}],
        /**
         * The class of a card
         * @member {Function} cardModule=Card
         */
        cardModule: Card,
        /**
         * The class of a column
         * @member {Function} columnModule=Column
         */
        columnModule: Column,
        /**
         * The board's horizontal column sort zone instance
         * @member {Neo.board.ColumnSortZone|null} columnSortZone=null
         */
        columnSortZone: null,
        /**
         * The board's horizontal column drag zone ({@link Neo.board.ColumnSortZone})
         * @member {Object} columnSortZoneConfig={module: ColumnSortZone}
         */
        columnSortZoneConfig: {module: ColumnSortZone},
        /**
         * Shows the sum of a numeric model field in each column header. The total includes all records in
         * the filtered column and lane, including offscreen cards. Only finite numbers contribute.
         * An optional `formatter(total)` returns display text, for example a currency amount.
         * @member {Object|null} columnSummary_=null
         */
        columnSummary_: null,
        /**
         * Column configs `{status, title, wipLimit, collapsed, color, locked}` in display order.
         * Null derives one column per distinct status value of the store, in first-seen order.
         * @member {Object[]|null} columns_=null
         */
        columns_: null,
        /**
         * Unlocked columns reorder horizontally by dragging their header through {@link #columnSortZone}
         * @member {Boolean} columnsResortable_=true
         */
        columnsResortable_: true,
        /**
         * Cards drag within and across columns through the board's one zone
         * @member {Boolean} dragResortable=true
         */
        dragResortable: true,
        /**
         * Enables `Neo.util.KeyNavigation` on the board so {@link Neo.board.SelectionModel} can register bindings
         * @member {Object} keys={}
         */
        keys: {},
        /**
         * The header title of the `value: null` lane row when records lack a `laneField` value
         * @member {String} emptyLaneTitle_='Unassigned'
         */
        emptyLaneTitle_: 'Unassigned',
        /**
         * The record field that names a card's swimlane; `null` = single-row board, non-null = one {@link Neo.board.LaneRow} per lane value
         * @member {String|null} laneField_=null
         */
        laneField_: null,
        /**
         * The class of a swimlane row
         * @member {Function} laneModule=LaneRow
         */
        laneModule: LaneRow,
        /**
         * Explicit swimlane configs `[{value, title, collapsed}]` in display order, or `null` to derive one row per
         * distinct value of {@link #laneField} in first-seen store order (plus {@link #emptyLaneTitle} for `null`/missing).
         * When explicit `lanes` are provided, any store records whose `laneField` value is not listed still render in
         * derived rows after the explicit ones (and `null`/missing in the {@link #emptyLaneTitle} row).
         * @member {Object[]|null} lanes_=null
         */
        lanes_: null,
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * The record field that ranks a card inside its column
         * @member {String} orderField='order'
         */
        orderField: 'order',
        /**
         * @member {String} role='group'
         */
        role: 'group',
        /**
         * Record-key-backed selection and keyboard navigation model ({@link Neo.board.SelectionModel})
         * @member {Neo.board.SelectionModel|Object|null} selectionModel_={ntype:'selection-board'}
         */
        selectionModel_: {ntype: 'selection-board'},
        /**
         * The board's one drag zone ({@link Neo.board.SortZone})
         * @member {Object} sortZoneConfig={module: SortZone}
         */
        sortZoneConfig: {module: SortZone},
        /**
         * The record field that names a card's column
         * @member {String} statusField='status'
         */
        statusField: 'status',
        /**
         * The one store of cards
         * @member {Neo.data.Store|Object|null} store_=null
         */
        store_: null
    }

    /**
     * The board's one shared {@link Neo.board.CardEditor}, created on first open and reused across cards
     * @member {Neo.board.CardEditor|null} cardEditor=null
     */
    cardEditor = null
    /**
     * Record key → card, for every record that has a column
     * @member {Map} cardMap=new Map()
     */
    cardMap = new Map()
    /**
     * Polite ARIA live region VDOM node appended to the board root (`<board>__live`)
     * @member {Object|null} liveRegionNode=null
     */
    liveRegionNode = null
    /** @member {Map} retainedCards=new Map() Offscreen key -> owning column, in eviction order. */
    retainedCards = new Map()
    /**
     * True while {@link #normalizeOrder} writes orders, so the writes do not re-project once per record
     * @member {Boolean} isNormalizing=false
     */
    isNormalizing = false
    /**
     * True once the columns can be projected (after construction)
     * @member {Boolean} isProjectable=false
     * @protected
     */
    isProjectable = false

    /** Stores constructed from this board's config: it retires them, never a store it was handed. */
    #ownedStores = new WeakSet()

    /**
     * @summary Forwards `appName` to {@link #columnSortZone}
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAppName(value, oldValue) {
        super.afterSetAppName(value, oldValue);

        if (value && this.columnSortZone) {
            this.columnSortZone.appName = value
        }
    }

    /**
     * @summary Applies `aria-label` to the board root VDOM node
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAriaLabel(value, oldValue) {
        this.changeVdomRootKey('aria-label', value)
    }

    /**
     * @summary Re-renders every card when the item set changes after construction
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetCardItems(value, oldValue) {
        oldValue !== undefined && this.cardMap.forEach(card => card.renderItems())
    }

    /**
     * @summary Re-projects when the column set changes after construction
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    afterSetColumns(value, oldValue) {
        oldValue !== undefined && this.project()
    }

    /**
     * @summary Refreshes header totals from the existing column memberships when their definition changes.
     * @protected
     */
    afterSetColumnSummary() {
        this.isProjectable && this.getColumns().forEach(column => column.syncSummary())
    }

    /**
     * @summary Updates the unassigned lane's header title when `emptyLaneTitle` changes after construction
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetEmptyLaneTitle(value, oldValue) {
        if (oldValue !== undefined && this.laneField) {
            const emptyLane = this.getLane(null);

            if (emptyLane && (!emptyLane.title || emptyLane.title === oldValue)) {
                emptyLane.title = value
            }
        }
    }

    /**
     * @summary Switches the board between single-row (`hbox`) and swimlane (`grid`) layout and re-projects when
     * `laneField` changes after construction
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetLaneField(value, oldValue) {
        let me = this;

        me.applyLaneLayout();

        if (oldValue !== undefined && me.isProjectable) {
            me.project()
        }
    }

    /**
     * @summary Re-projects when explicit `lanes` change after construction, applying any newly configured `collapsed`
     * state on existing lane rows.
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    afterSetLanes(value, oldValue) {
        let me = this;

        if (oldValue !== undefined && me.isProjectable) {
            value?.forEach(cfg => {
                if (Object.hasOwn(cfg, 'collapsed')) {
                    const laneRow = me.getLane(cfg.value ?? null);
                    if (laneRow) {
                        laneRow.collapsed = Boolean(cfg.collapsed)
                    }
                }
            });

            me.project()
        }
    }

    /**
     * @summary Syncs the board's `neo-board-lanes` class and `grid` / `hbox` layout with {@link #laneField}
     * @description Lanes stack in a one-track grid (`Container.css`): the track is as wide as the widest lane, so a
     * lane narrowed by its own collapsed columns, or folded, still spans the board's scroll range, and its sticky
     * header label stays in view. A `vbox` stretches lanes only to the board's visible width.
     */
    applyLaneLayout() {
        let me      = this,
            hasLane = Boolean(me.laneField),
            target  = hasLane ? 'grid' : 'hbox',
            ntype   = me.layout?.ntype;

        me.toggleCls('neo-board-lanes', hasLane);

        if (ntype !== target && ntype !== `layout-${target}`) {
            me.layout = hasLane ? {ntype: target} : {ntype: target, align: 'stretch'}
        }
    }

    /**
     * @summary Creates {@link #columnSortZone} when enabled, or toggles header draggability when changed after creation
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    async afterSetColumnsResortable(value, oldValue) {
        let me = this,
            module;

        if (value && !me.columnSortZone) {
            module = me.columnSortZoneConfig?.module || ColumnSortZone;

            if (!me.isConstructed) {
                await Promise.resolve()
            }

            if (me.isDestroyed || me.columnSortZone) {
                return
            }

            me.columnSortZone = Neo.create(Neo.merge({
                module,
                appName            : me.appName,
                boundaryContainerId: me.id,
                owner              : me,
                windowId           : me.windowId
            }, me.columnSortZoneConfig))
        } else if (me.columnSortZone) {
            me.columnSortZone.adjustItemCls(Boolean(value))
        }
    }

    /**
     * @summary Forwards `windowId` to {@link #columnSortZone}
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        if (this.columnSortZone) {
            this.columnSortZone.windowId = value
        }
    }

    /**
     * @summary Binds the store's load, filter and recordChange events; a replacement store re-projects, then the
     * previous store retires when this board created it.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me        = this,
            listeners = {filter: me.onStoreLoad, load: me.onStoreLoad, recordChange: me.onStoreRecordChange, scope: me};

        oldValue?.un(listeners);

        if (oldValue && oldValue !== value) {
            me.retireCards([...me.cardMap.keys()]);
            me.getColumns().forEach(column => {
                column.windowStart = 0;
                column.measurementRevision++;
                if (!value) {
                    column.selectWindow([]);
                    column.count = 0;
                    column.syncSummary();
                    column.updateSpacers()
                }
            });
            !value && me.items.forEach(item => item instanceof LaneRow && item.updateCount())
        }

        if (value) {
            value.on(listeners);
            me.project()
        }

        if (oldValue && oldValue !== value && me.#ownedStores.has(oldValue)) oldValue.destroy()
    }

    /**
     * @summary Registers the board's {@link Neo.board.SelectionModel} when set after construction
     * @param {Neo.board.SelectionModel|null} value
     * @param {Neo.board.SelectionModel|null} oldValue
     * @protected
     */
    afterSetSelectionModel(value, oldValue) {
        if (this.isConstructed && value) {
            value.register(this)
        }
    }

    /**
     * @summary Instantiates {@link Neo.board.SelectionModel} from a config object or class reference
     * @param {Neo.board.SelectionModel|Object|null} value
     * @param {Neo.board.SelectionModel|null} oldValue
     * @returns {Neo.board.SelectionModel|null}
     * @protected
     */
    beforeSetSelectionModel(value, oldValue) {
        oldValue?.destroy();
        return value ? ClassSystemUtil.beforeSetInstance(value, SelectionModel) : null
    }

    /**
     * @summary A store config becomes a store instance, which this board then owns
     * @param {Neo.data.Store|Object|null} value
     * @param {Neo.data.Store|null} oldValue
     * @returns {Neo.data.Store|null}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        if (!value) {
            return null
        }
        const store = ClassSystemUtil.beforeSetInstance(value, Store);
        if (store !== value) this.#ownedStores.add(store);
        return store
    }

    /**
     * @summary Creates the card of a record and registers it
     * @param {Object} record
     * @returns {Neo.board.Card}
     */
    createCard(record) {
        let me   = this,
            card = Neo.create(me.cardModule, {
                appName: me.appName,
                board  : me,
                // Cards keep their content height inside the card-items root's flex column.
                flex    : 'none',
                id      : me.getCardId(record),
                record,
                theme   : me.theme,
                windowId: me.windowId
            });

        // The board reference may land after the record during construction
        card.renderItems();
        me.cardMap.set(me.getKey(record), card);

        // A card created before the zone exists is armed by the zone's own first pass
        me.sortZone?.armCard(card);

        return card
    }

    /**
     * @summary The config of a column instance
     * @param {Object} config `{status, title, wipLimit, collapsed, color, laneValue, locked, maxRenderedCards, overscan, retainOffscreen}`
     * @returns {Object}
     */
    createColumnConfig({status, title, wipLimit=null, collapsed=false, color=null, laneValue=null, locked=false, maxRenderedCards=100, overscan=10, retainOffscreen=null}) {
        let me = this;

        return {
            module: me.columnModule,
            board : me,
            // Columns keep their own width and the board scrolls; the hbox would otherwise share the width out
            flex : 'none',
            id   : me.getColumnId(status, laneValue),
            collapsed,
            color,
            laneValue,
            locked,
            maxRenderedCards,
            overscan,
            retainOffscreen,
            status,
            title: title ?? status,
            wipLimit
        }
    }

    /**
     * @summary The config of a {@link Neo.board.LaneRow} instance
     * @param {Object} [config={}] `{value, title, collapsed}`
     * @returns {Object}
     */
    createLaneConfig({value=null, title=null, collapsed=false}={}) {
        let me        = this,
            laneValue = value ?? null;

        return {
            module   : me.laneModule,
            board    : me,
            collapsed: Boolean(collapsed),
            id       : me.getLaneId(laneValue),
            title    : title ?? (laneValue != null ? String(laneValue) : me.emptyLaneTitle),
            value    : laneValue
        }
    }

    /**
     * @summary Unbinds the store, destroys the selection model, column sort zone, and card editor, and forgets the
     * cards before the container tears down; a store this board created retires after it
     * @param {...*} args
     */
    destroy(...args) {
        let me      = this,
            {store} = me;

        store?.un({filter: me.onStoreLoad, load: me.onStoreLoad, recordChange: me.onStoreRecordChange, scope: me});
        me.selectionModel?.destroy();
        me.selectionModel = null;
        me.columnSortZone?.destroy();
        me.columnSortZone = null;
        me.cardEditor?.destroy();
        me.cardEditor = null;
        me.cardMap.forEach(card => !card.parent && card.destroy());
        me.cardMap.clear();
        me.retainedCards.clear();

        super.destroy(...args);
        if (store && me.#ownedStores.has(store)) store.destroy()
    }

    /**
     * @summary Activates `cardOrRecord`, firing `cardActivate` `{card, record}` on the board and opening its shared
     * {@link Neo.board.CardEditor}.
     * @param {Neo.board.Card|Object|String|Number} cardOrRecord
     * @returns {Neo.board.CardEditor|null}
     */
    activateCard(cardOrRecord) {
        let me = this,
            card, record;

        if (cardOrRecord instanceof Card) {
            card   = cardOrRecord;
            record = card.record
        } else if (cardOrRecord !== null && typeof cardOrRecord === 'object') {
            record = cardOrRecord;
            card   = me.getCard(record)
        } else if (cardOrRecord != null) {
            record = me.store?.get(cardOrRecord) ?? null;
            card   = record ? me.getCard(record) : null
        }

        if (!record || me.store?.get(me.getKey(record)) !== record) {
            return null
        }

        me.fire('cardActivate', {card, record});

        return me.openCardEditor(card || record)
    }

    /**
     * @summary Writes `message` to the board's polite ARIA live region (`<board>__live`).
     * @param {String} message
     */
    announce(message) {
        let me = this;

        me.ensureLiveRegion();

        if (me.liveRegionNode) {
            me.liveRegionNode.text = String(message ?? '');
            me.updateDepth = -1;
            me.update()
        }
    }

    /**
     * @summary Ensures the visually-hidden polite ARIA live region node (`<board>__live`) is appended after all column
     * VDOM references in `vdom.cn`.
     * @returns {Object}
     * @protected
     */
    ensureLiveRegion() {
        let me   = this,
            root = me.getVdomRoot(),
            cn   = root.cn ||= [],
            idx;

        me.liveRegionNode ||= {
            tag          : 'div',
            id           : `${me.id}__live`,
            cls          : ['neo-board-live-region'],
            role         : 'status',
            'aria-live'  : 'polite',
            'aria-atomic': 'true',
            text         : ''
        };

        idx = cn.indexOf(me.liveRegionNode);

        if (idx === -1) {
            cn.push(me.liveRegionNode)
        } else if (idx !== cn.length - 1) {
            cn.splice(idx, 1);
            cn.push(me.liveRegionNode)
        }

        return me.liveRegionNode
    }

    /**
     * @summary Returns all non-collapsed {@link Neo.board.Column} instances in display order (excluding columns in
     * collapsed swimlane rows).
     * @returns {Neo.board.Column[]}
     */
    getOpenColumns() {
        return this.getColumns().filter(column =>
            !column.collapsed && !(this.laneField && this.getLane(column.laneValue)?.collapsed)
        )
    }

    /**
     * @summary Returns the board's shared {@link Neo.board.CardEditor} instance, creating it lazily on first access
     * @returns {Neo.board.CardEditor}
     */
    getCardEditor() {
        let me = this;

        if (!me.cardEditor || me.cardEditor.isDestroyed) {
            me.cardEditor = Neo.create(me.cardEditorModule, {
                appName : me.appName,
                board   : me,
                id      : `${me.id}__editor`,
                theme   : me.theme,
                windowId: me.windowId,
                ...me.cardEditorConfig
            })
        }

        return me.cardEditor
    }

    /**
     * @summary Opens the board's shared {@link Neo.board.CardEditor} bound to `cardOrRecord`
     * @param {Neo.board.Card|Object|String|Number} cardOrRecord
     * @returns {Neo.board.CardEditor|null}
     */
    openCardEditor(cardOrRecord) {
        let me = this,
            card, record;

        if (cardOrRecord instanceof Card) {
            card   = cardOrRecord;
            record = card.record
        } else if (cardOrRecord !== null && typeof cardOrRecord === 'object') {
            record = cardOrRecord;
            card   = me.getCard(record)
        } else if (cardOrRecord != null) {
            record = me.store?.get(cardOrRecord) ?? null;
            card   = record ? me.getCard(record) : null
        }

        if (!record || me.store?.get(me.getKey(record)) !== record) {
            return null
        }

        return me.getCardEditor().openForCard(card, record)
    }

    /**
     * @summary The rendered card of a record/key; sliced offscreen cards return null, including retained instances.
     * @param {Object|String|Number} recordOrKey
     * @returns {Neo.board.Card|null}
     */
    getCard(recordOrKey) {
        const key = recordOrKey !== null && typeof recordOrKey === 'object' ? this.getKey(recordOrKey) : recordOrKey;
        return this.retainedCards.has(key) ? null : this.cardMap.get(key) || null
    }

    /**
     * @summary The id of a record's card: `<board>__card__<key>`
     * @param {Object} record
     * @returns {String}
     */
    getCardId(record) {
        return `${this.id}__card__${Board.slug(this.getKey(record))}`
    }

    /**
     * @summary Where a record's card sits: its column's status and lane, and its index among the column's records
     * @param {Object} record
     * @param {Function} [recordsFor] Resolves ordered records already read during the current reconciliation.
     * @returns {{index: Number, lane: (String|null), status: String}}
     */
    getCardPosition(record, recordsFor) {
        let me                       = this,
            {laneField, statusField} = me,
            status                   = record[statusField],
            lane                     = laneField ? (record[laneField] ?? null) : null,
            records                  = recordsFor ? recordsFor(status, lane) : me.getColumnRecords(status, lane);

        return {index: records.indexOf(record), lane, status}
    }

    /**
     * @summary The column of a status (and lane)
     * @param {String} status
     * @param {String|null} [lane=null]
     * @returns {Neo.board.Column|null}
     */
    getColumn(status, lane=null) {
        const normalizedLane = this.laneField ? (lane ?? null) : null;

        if (this.laneField) {
            return this.getLane(normalizedLane)?.getColumn(status) || null
        }

        return this.items.find(item =>
            item instanceof Column && item.status === status && (item.laneValue ?? null) === normalizedLane
        ) || null
    }

    /**
     * @summary Every column on the board, in visual order across all swimlane rows (or the single row when `laneField` is null)
     * @returns {Neo.board.Column[]}
     */
    getColumns() {
        const columns = [];

        this.items.forEach(item => {
            if (item instanceof Column) {
                columns.push(item)
            } else if (item instanceof LaneRow) {
                columns.push(...item.columns)
            }
        });

        return columns
    }

    /**
     * @summary The column configs in display order: `columns`, or one per distinct status in first-seen order
     * @returns {Object[]}
     */
    getColumnConfigs() {
        let me                            = this,
            {columns, statusField, store} = me,
            seen;

        if (columns) {
            return columns
        }

        seen = new Map();

        me.#adopt(store).forEach(record => {
            const status = record[statusField];

            if (status != null && !seen.has(status)) {
                seen.set(status, {status})
            }
        });

        return [...seen.values()]
    }

    /**
     * @summary The id of a column: `<board>__col__<status>[__<lane>]`
     * @param {String} status
     * @param {String|null} [lane=null]
     * @returns {String}
     */
    getColumnId(status, lane=null) {
        const {slug} = Board;
        return `${this.id}__col__${slug(status)}${lane != null ? `__${slug(lane)}` : ''}`
    }

    /**
     * @summary The records of a column, sorted by `orderField` then key
     * @param {String} status
     * @param {String|null} [lane=null]
     * @returns {Object[]}
     */
    getColumnRecords(status, lane=null) {
        return this.#recordsForColumn(this.store, status, lane)
    }

    /**
     * @summary Resolves each column's ordered visible records once within a synchronous projection.
     * @description The lookup is owned by one window change or by the affected columns of one Store event.
     * Canonical counts for filtered windows remain separate from these visible records.
     * @returns {Function}
     * @private
     */
    #projectionRecords() {
        const populations = new Map();

        return (status, lane) => {
            const column = this.getColumn(status, lane);
            if (!column) return this.getColumnRecords(status, lane);

            if (!populations.has(column)) {
                populations.set(column, this.getColumnRecords(status, lane))
            }

            return populations.get(column)
        }
    }

    /**
     * @summary Selects and orders one column from a visible or canonical population without mutating it.
     * @param {Neo.collection.Base|null} population
     * @param {String} status
     * @param {String|null} lane
     * @returns {Object[]}
     * @private
     */
    #recordsForColumn(population, status, lane) {
        const me      = this, {laneField, orderField, statusField} = me;
        const records = me.#adopt(population).filter(record =>
            record[statusField] === status && (!laneField || (record[laneField] ?? null) === (lane ?? null))
        );

        return records.sort((a, b) =>
            (Board.toNumber(a[orderField]) - Board.toNumber(b[orderField])) ||
            String(me.getKey(a)).localeCompare(String(me.getKey(b)))
        )
    }

    /**
     * @summary The rows of a population as their canonical Records. A lazy ("Turbo Mode") row hydrates through the
     * store, which heals its own maps, so cards, views and writers all hold the instance `store.get()` returns.
     * @param {Neo.collection.Base|null} population The store or its unfiltered `allItems`
     * @returns {Object[]}
     * @private
     */
    #adopt(population) {
        const {store} = this;
        return population ? population.items.map((row, index) => store.hydrateRecord(row, population === store ? index : undefined)) : []
    }

    /**
     * @summary The key of a record, through the store
     * @param {Object} record
     * @returns {String|Number}
     */
    getKey(record) {
        return this.store.getKey(record)
    }

    /**
     * @summary The swimlane row for `value` (`null` for the unassigned lane), or null when lanes are inactive or absent
     * @param {String|null} [value=null]
     * @returns {Neo.board.LaneRow|null}
     */
    getLane(value=null) {
        return this.items.find(item =>
            item instanceof LaneRow && (item.value ?? null) === (value ?? null)
        ) || null
    }

    /**
     * @summary The swimlane configs `{value, title, collapsed?}` in display order: explicit `lanes` first, followed by
     * derived rows for any unlisted non-null `laneField` values in first-seen store order, and finally the
     * `emptyLaneTitle` (`value: null`) row when any record has a `null` or missing `laneField`.
     * @returns {Object[]}
     */
    getLaneConfigs() {
        let me                                        = this,
            {emptyLaneTitle, laneField, lanes, store} = me,
            configs                                   = [],
            hasEmpty                                  = false,
            seen                                      = new Set();

        if (!laneField) {
            return configs
        }

        lanes?.forEach(cfg => {
            const value = cfg.value ?? null;

            if (!seen.has(value)) {
                seen.add(value);
                configs.push({
                    ...(Object.hasOwn(cfg, 'collapsed') && {collapsed: Boolean(cfg.collapsed)}),
                    title: cfg.title ?? (value != null ? String(value) : emptyLaneTitle),
                    value
                })
            }
        });

        me.#adopt(store).forEach(record => {
            const value = record[laneField] ?? null;

            if (value === null) {
                hasEmpty = true
            } else if (!seen.has(value)) {
                seen.add(value);
                configs.push({title: String(value), value})
            }
        });

        if (hasEmpty && !seen.has(null)) {
            configs.push({title: emptyLaneTitle, value: null})
        }

        return configs
    }

    /**
     * @summary The id of a swimlane row: `<board>__lane__<slug(value)>` (or `<board>__lane___unassigned_` for `null`)
     * @param {String|null} [value=null]
     * @returns {String}
     */
    getLaneId(value=null) {
        return `${this.id}__lane__${value != null ? Board.slug(value) : '_unassigned_'}`
    }

    /**
     * @summary The order of a card landing at `index` of a column slice that excludes it: the midpoint of its
     * neighbours, 1000 below the first, 1000 above the last, 1000 in an empty column. Null when the neighbours sit
     * closer than 1e-9, where a midpoint would no longer separate them.
     * @param {Object[]} slice The column's records without the moved one, in order
     * @param {Number} index
     * @returns {Number|null}
     */
    getMoveOrder(slice, index) {
        let {orderField} = this,
            next, prev;

        if (!slice.length) {
            return 1000
        }

        if (index <= 0) {
            return slice[0][orderField] - 1000
        }

        if (index >= slice.length) {
            return slice[slice.length - 1][orderField] + 1000
        }

        prev = slice[index - 1][orderField];
        next = slice[index][orderField];

        return next - prev < 1e-9 ? null : (prev + next) / 2
    }

    /**
     * @summary Returns the current canonical Record, including one hidden by a Store filter or not yet hydrated.
     * @param {String|Number} key
     * @returns {Object|null}
     * @protected
     */
    getSourceRecord(key) {
        const store = this.store;
        return store?.hydrateRecord((store.allItems || store).get(key)) ?? null
    }

    /**
     * @summary Moves a card. This is the board's one writer: the drag zone, the card editor and an agent on the
     * Neural Link (`call_method(boardId, 'moveCard', [{key, status, index}])`) all commit through it.
     * @description The moved record resolves from `record`, then its store `key`, then `cardId`. An agent addresses
     * it by `key`: a bounded column renders only a window of its records, and a record outside it has no card to
     * name. `status` defaults to the record's current `record[statusField]`. When `laneField` is set, omitting `lane`
     * (`undefined`) keeps the record's current `record[laneField] ?? null`, while passing `lane: null` moves it to the
     * unassigned (`value: null`) lane. The target position resolves against the column's records without the moved one:
     * `beforeId`, then `afterId`, then `index`. Without one of them, or with an anchor the column does not hold, the
     * card appends. {@link #getMoveOrder} ranks it there; a gap too small to split renumbers the column first
     * ({@link #rebalanceColumn}). Then ONE `record.set()` carries the status, the lane (only with a `laneField`),
     * the order and any extra `fields`. The moved Record must be the current canonical source Record; a filter may
     * hide it during a prepared multi-card commit. UI entry points admit visible Records before calling this writer.
     * Anchors resolve in canonical order; an index maps the visible column to that boundary. Missing orders initialize
     * canonically and rebalance includes hidden records, preserving their relative order when the filter clears.
     * Unchanged values never reach `recordChange`, so a move inside its column
     * reports `order` alone. A rebalance settles the projection even when the final set changes nothing, unless an
     * outer batch owns that settlement. `cardMove` fires after the set, with both ends; hidden destinations carry no
     * visible-position announcement.
     * @param {Object} data
     * @param {Object|null} [data.record=null] The record to move, or
     * @param {String|Number|null} [data.key=null] its key, rendered or not, or
     * @param {String|null} [data.cardId=null] the id of its card
     * @param {String} [data.status=record[this.statusField]] The target column's status (defaults to the record's current status)
     * @param {String|null} [data.lane=record[this.laneField]] The target swimlane value when {@link #laneField} is set; omitting `lane` keeps the record's current lane, while `null` targets the unassigned lane
     * @param {Number|null} [data.index=null] The target index among the column's other cards
     * @param {String|Number|null} [data.beforeId=null] The key of the card to land in front of
     * @param {String|Number|null} [data.afterId=null] The key of the card to land behind
     * @param {Object} [data.fields={}] More fields for the same set; the move's own status, lane and order win
     * @returns {Object|null} The moved record, or null when the record or the target column does not resolve
     */
    moveCard({record=null, key=null, cardId=null, status, lane=undefined, index=null, beforeId=null, afterId=null, fields={}}) {
        let me                                   = this,
            {laneField, orderField, statusField} = me,
            rebalanced                           = false,
            changes, from, order, position, slice, visible;

        record ??= key    != null ? me.getSourceRecord(key)
                 : cardId != null ? Neo.getComponent(cardId)?.record ?? null
                 : null;
        status ??= record?.[statusField];
        lane     = laneField ? (lane !== undefined ? (lane ?? null) : (record?.[laneField] ?? null)) : null;

        if (!record || !me.store || me.getSourceRecord(me.getKey(record)) !== record || !me.getColumn(status, lane)) {
            return null
        }

        from    = me.getCardPosition(record);
        visible = me.getColumnRecords(status, lane).filter(item => item !== record);
        slice   = me.#recordsForColumn(me.store.allItems || me.store, status, lane).filter(item => item !== record);

        if (beforeId != null) {
            position = slice.findIndex(item => me.getKey(item) === beforeId)
        } else if (afterId != null) {
            position = slice.findIndex(item => me.getKey(item) === afterId);
            position > -1 && position++
        } else if (index != null && index >= 0 && visible.length) {
            const boundary = Math.min(index, visible.length);
            position = boundary < visible.length ? slice.indexOf(visible[boundary]) : slice.indexOf(visible.at(-1)) + 1
        }

        position = position == null || position < 0 ? slice.length : Math.min(position, slice.length);
        const prevOrder = record[orderField];
        order     = me.getMoveOrder(slice, position);

        if (order === null) {
            me.rebalanceColumn(status, lane);
            rebalanced = true;
            order = me.getMoveOrder(slice, position)
        }

        changes = {...fields, [statusField]: status, [orderField]: order};
        laneField && (changes[laneField] = lane);

        const previous = {};
        for (const fieldKey of Object.keys(changes)) {
            previous[fieldKey] = fieldKey === orderField ? prevOrder : record[fieldKey]
        }

        record.set(changes);
        rebalanced && !me.isNormalizing && me.project();

        const
            to           = me.getCardPosition(record),
            targetColumn = me.getColumn(to.status, to.lane),
            titleField   = getTitleField(me.cardItems),
            title        = record[titleField] ?? me.getKey(record),
            columnTitle  = targetColumn?.title ?? targetColumn?.status ?? status,
            totalCount   = targetColumn?.count ?? me.getColumnRecords(to.status, to.lane).length;

        me.announce(`${title} moved to ${columnTitle}${to.index < 0 ? '' : `, position ${to.index + 1} of ${totalCount}`}`);
        me.fire('cardMove', {action: 'move', changes, from, previous, record, to});

        return record
    }

    /**
     * @summary Moves an unlocked column from `fromIndex` to `toIndex`, keeping any locked columns at their exact
     * indices, writing `board.columns` once (materializing `getColumnConfigs()` first when `columns` was `null`), and
     * firing one `columnMove` event `{status, laneValue, fromIndex, toIndex}`.
     * @param {Number} fromIndex
     * @param {Number} toIndex
     * @returns {Neo.board.Column|null}
     */
    moveColumn(fromIndex, toIndex) {
        let me     = this,
            column = me.items[fromIndex],
            currentConfigs, fromUnlocked, nextConfigs, toUnlocked, unlockedConfigs, unlockedIndices;

        if (!column || column.locked || fromIndex === toIndex || toIndex < 0 || toIndex >= me.items.length) {
            return null
        }

        currentConfigs = me.columns
            ? me.columns.map(cfg => {
                const col = me.getColumn(cfg.status, cfg.laneValue ?? null);
                return col ? {...cfg, collapsed: col.collapsed, locked: col.locked} : {...cfg}
            })
            : me.getColumnConfigs().map(cfg => {
                const col = me.getColumn(cfg.status, cfg.laneValue ?? null);
                return col ? {
                    collapsed: col.collapsed,
                    color    : col.color,
                    laneValue: col.laneValue,
                    locked   : col.locked,
                    status   : col.status,
                    title    : col.title,
                    wipLimit : col.wipLimit,
                    ...cfg
                } : {...cfg}
            });

        unlockedIndices = currentConfigs
            .map((cfg, i) => (me.items[i]?.locked ?? Boolean(cfg.locked)) ? -1 : i)
            .filter(i => i > -1);

        fromUnlocked = unlockedIndices.indexOf(fromIndex);
        toUnlocked   = unlockedIndices.indexOf(toIndex);

        if (fromUnlocked < 0 || toUnlocked < 0 || fromUnlocked === toUnlocked) {
            return null
        }

        unlockedConfigs = unlockedIndices.map(i => currentConfigs[i]);
        NeoArray.move(unlockedConfigs, fromUnlocked, toUnlocked);

        nextConfigs = [...currentConfigs];
        unlockedIndices.forEach((slotIndex, i) => {
            nextConfigs[slotIndex] = unlockedConfigs[i]
        });

        me.columns = nextConfigs;

        me.fire('columnMove', {
            fromIndex,
            laneValue: column.laneValue ?? null,
            status   : column.status,
            toIndex  : me.items.indexOf(column)
        });

        return column
    }

    /**
     * @summary Gives every canonical record without a numeric order one, inside its column, in source order: `1000 · n`
     * after the column's highest existing order. One pass, no re-projection per write.
     */
    normalizeOrder() {
        let me                                          = this,
            {laneField, orderField, statusField, store} = me,
            groups                                      = new Map();

        if (!store) {
            return
        }

        const population = store.allItems || store;
        population.items.forEach(record => {
            if (!Number.isFinite(record[orderField])) {
                const key = me.getColumnId(record[statusField], laneField ? record[laneField] : null);

                if (!groups.has(key)) {
                    groups.set(key, [])
                }

                groups.get(key).push(record)
            }
        });

        if (!groups.size) {
            return
        }

        me.isNormalizing = true;

        try {
            groups.forEach(records => {
                const
                    first = records[0],
                    base  = me.#recordsForColumn(population, first[statusField], laneField ? first[laneField] : null)
                        .map(record => record[orderField])
                        .filter(Number.isFinite)
                        .reduce((max, value) => Math.max(max, value), 0);

                records.forEach((record, index) => {
                    record[orderField] = base + (index + 1) * 1000
                })
            })
        } finally {
            me.isNormalizing = false
        }
    }

    /**
     * @summary Projects once the columns can exist and registers {@link #selectionModel}
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.applyLaneLayout();
        me.isProjectable = true;
        me.ensureLiveRegion();
        me.project();
        me.selectionModel?.register(me)
    }

    /**
     * @summary A membership change (filter, add, remove, sort or load) re-projects every column
     * @param {Object} data
     */
    onStoreLoad(data) {
        !this.isNormalizing && this.project()
    }

    /**
     * @summary A field change re-projects the columns the record left or entered; any other change re-renders
     * the card.
     * @description The source column comes from the changed fields' `oldValue`, never from where the card's
     * component sits: a writer that syncs the component tree before its `set` (the board zone's drop) has already
     * moved the card into the target body, so its parent would name the target twice and the source would keep a
     * stale count. The column that holds the card is re-projected as well when it is neither — a third writer's
     * leftover.
     * @param {Object} data
     * @param {Object[]} data.fields `{name, oldValue, value}` per changed field
     * @param {Object} data.record
     */
    onStoreRecordChange({fields, record}) {
        let me                                            = this,
            {columns, laneField, orderField, statusField} = me,
            changed, card, from, holder, isVisible, lane, oldLane, oldStatus, status, target;

        if (me.isNormalizing) {
            return
        }

        changed   = name => fields.find(field => field.name === name);
        card      = me.cardMap.get(me.getKey(record));
        isVisible = me.store?.get(me.getKey(record)) === record;

        if (changed(statusField) || changed(orderField) || (laneField && changed(laneField))) {
            status    = record[statusField];
            lane      = laneField ? (record[laneField] ?? null) : null;
            oldStatus = changed(statusField) ? changed(statusField).oldValue : status;
            oldLane   = laneField ? ((changed(laneField) ? changed(laneField).oldValue : record[laneField]) ?? null) : null;
            from      = me.getColumn(oldStatus, oldLane);
            target    = me.getColumn(status, lane);
            holder    = card?.parent?.parent instanceof Column ? card.parent.parent : null;

            // Derived columns or lanes: a status or lane seen for the first time gets its column/row in first-seen order
            if (isVisible && !target && status != null) {
                if (laneField) {
                    const
                        added      = me.getLane(lane) ? null : me.insert(me.items.length, me.createLaneConfig({
                            title: lane ?? me.emptyLaneTitle,
                            value: lane
                        })),
                        colConfigs = me.getColumnConfigs();

                    // A new lane gets every column; a derived status reaches every lane, the new one included
                    me.items.forEach(item => item instanceof LaneRow && (!columns || item === added) && me.projectLaneColumns(item, colConfigs));

                    target = me.getColumn(status, lane)
                } else if (!columns) {
                    target = me.insert(me.items.length, me.createColumnConfig({status, laneValue: lane}))
                }
            }

            const projection = {recordsFor: me.#projectionRecords()};

            isVisible && target && me.reconcileColumn(target, projection);
            from   && from   !== target && me.reconcileColumn(from, projection);
            holder && holder !== target && holder !== from && me.reconcileColumn(holder, projection)
        } else if (isVisible && me.columnSummary && changed(me.columnSummary.field)) {
            me.getColumn(record[statusField], laneField ? record[laneField] ?? null : null)?.syncSummary()
        }

        // One batch may move a card and change what it renders; the placement above never re-renders
        card = me.cardMap.get(me.getKey(record));
        card?.onRecordChange(fields);
        card?.parent?.parent instanceof Column && card.parent.parent.scheduleWindowMeasurement()
    }

    /**
     * @summary Builds or updates the columns (or swimlane rows + columns when `laneField` is set) from the store, then
     * projects every column.
     */
    project() {
        let me      = this,
            {store} = me,
            colConfigs, wanted;

        if (!store || !me.isProjectable) {
            return
        }

        me.applyLaneLayout();
        me.normalizeOrder();

        colConfigs = me.getColumnConfigs();
        wanted     = new Set();

        if (me.laneField) {
            // Release any direct columns left over from single-row mode before projecting lane rows
            [...me.items].forEach(item => {
                if (item instanceof Column) {
                    me.releaseColumnCards(item);
                    me.remove(item)
                }
            });

            me.getLaneConfigs().forEach((laneCfg, index) => {
                const
                    laneValue = laneCfg.value ?? null,
                    id        = me.getLaneId(laneValue);

                let laneRow = me.getLane(laneValue);

                wanted.add(id);

                if (laneRow) {
                    laneRow.title = laneCfg.title ?? (laneValue != null ? String(laneValue) : me.emptyLaneTitle);

                    const current = me.items.indexOf(laneRow);
                    current !== index && me.moveTo(current, index)
                } else {
                    laneRow = me.insert(index, me.createLaneConfig(laneCfg))
                }

                me.projectLaneColumns(laneRow, colConfigs)
            });

            [...me.items].forEach(item => {
                if (item instanceof LaneRow && !wanted.has(item.id)) {
                    item.columns.forEach(column => me.releaseColumnCards(column));
                    me.remove(item)
                }
            })
        } else {
            // Release any lane rows left over from swimlane mode before projecting single-row columns
            [...me.items].forEach(item => {
                if (item instanceof LaneRow) {
                    item.columns.forEach(column => me.releaseColumnCards(column));
                    me.remove(item)
                }
            });

            colConfigs.forEach((config, index) => {
                const
                    lane   = config.laneValue ?? null,
                    id     = me.getColumnId(config.status, lane),
                    column = me.getColumn(config.status, lane);

                wanted.add(id);

                if (column) {
                    column.set({
                        collapsed: config.collapsed ?? column.collapsed,
                        color    : config.color     ?? column.color,
                        locked   : config.locked    ?? column.locked,
                        title    : config.title     ?? column.title,
                        wipLimit : config.wipLimit  ?? column.wipLimit,
                        ...Object.fromEntries(['maxRenderedCards', 'overscan', 'retainOffscreen']
                            .filter(key => Object.hasOwn(config, key)).map(key => [key, config[key]]))
                    });

                    const current = me.items.indexOf(column);
                    current !== index && me.moveTo(current, index)
                } else {
                    me.insert(index, me.createColumnConfig(config))
                }
            });

            // A column no longer wanted releases its cards before it goes; the cards park, their records still live
            [...me.items].forEach(item => {
                if (item instanceof Column && !wanted.has(item.id)) {
                    me.releaseColumnCards(item);
                    me.remove(item)
                }
            })
        }

        me.getColumns().forEach(column => me.reconcileColumn(column));
        me.columnSortZone?.adjustItemCls(Boolean(me.columnsResortable));

        // Filtering hides a record; only canonical removal or replacement retires its Card.
        me.retireCards([...me.cardMap].filter(([key, card]) => me.getSourceRecord(key) !== card.record).map(([key]) => key));
        me.ensureLiveRegion();
        me.selectionModel?.syncAnnotations()
    }

    /**
     * @summary Synchronizes the columns inside `laneRow` with `colConfigs`, setting `laneValue` to `laneRow.value`.
     * @param {Neo.board.LaneRow} laneRow
     * @param {Object[]} colConfigs
     */
    projectLaneColumns(laneRow, colConfigs) {
        let me         = this,
            container  = laneRow.columnContainer,
            laneValue  = laneRow.value ?? null,
            wantedCols = new Set();

        if (!container) {
            return
        }

        colConfigs.forEach((config, index) => {
            const
                id     = me.getColumnId(config.status, laneValue),
                column = laneRow.getColumn(config.status);

            wantedCols.add(id);

            if (column) {
                column.set({
                    collapsed: config.collapsed ?? column.collapsed,
                    color    : config.color     ?? column.color,
                    locked   : config.locked    ?? column.locked,
                    title    : config.title     ?? column.title,
                    wipLimit : config.wipLimit  ?? column.wipLimit,
                    ...Object.fromEntries(['maxRenderedCards', 'overscan', 'retainOffscreen']
                        .filter(key => Object.hasOwn(config, key)).map(key => [key, config[key]]))
                });

                const current = container.items.indexOf(column);
                current !== index && container.moveTo(current, index)
            } else {
                container.insert(index, me.createColumnConfig({...config, laneValue}))
            }
        });

        [...container.items].forEach(item => {
            if (item instanceof Column && !wantedCols.has(item.id)) {
                me.releaseColumnCards(item);
                container.remove(item)
            }
        })
    }

    /**
     * @summary Detaches or retires the cards of a column before the column is removed so parked cards survive
     * @param {Neo.board.Column} column
     */
    releaseColumnCards(column) {
        let me      = this,
            retired = [];

        [...column.body.items].forEach(card => {
            if (column.isSliced) {
                retired.push(me.getKey(card.record))
            } else {
                column.body.remove(card, false)
            }
        });

        me.retireCards(retired);
        me.trimRetainedCards(column, 0)
    }

    /**
     * @summary Renumbers a canonical column's orders to `1000 · (i + 1)` in their current order; {@link #moveCard} calls it
     * when a midpoint can no longer separate two neighbours. Every view of the store hears each changed order. The
     * board sits the pass out (`isNormalizing`, as {@link #normalizeOrder} writes), because relative order does not
     * hold between the writes, and re-projects on the move's own set.
     * @description A second board over the same store, or a store that re-sorts on change, sees the intermediate
     * orders and settles at the last one.
     * @param {String} status
     * @param {String|null} [lane=null]
     */
    rebalanceColumn(status, lane=null) {
        let me             = this,
            {orderField}   = me,
            wasNormalizing = me.isNormalizing;

        me.isNormalizing = true;

        try {
            me.#recordsForColumn(me.store.allItems || me.store, status, lane).forEach((record, index) => {
                record.set({[orderField]: (index + 1) * 1000})
            })
        } finally {
            me.isNormalizing = wasNormalizing
        }
    }

    /**
     * @summary Projects one column: the cards that no longer belong leave first (destroyed only when their record
     * left the store, otherwise detached — another column takes them, or they park until a column matches their
     * status again), then every record's card lands at its index — a card already there is left alone.
     * @description Render-all columns preserve parked card identity and lookup. Sliced columns retain only their
     * configured offscreen budget, and those cards are hidden from `getCard` until rendered again.
     * @param {Neo.board.Column} column
     * @param {Object} [options]
     * @param {Boolean} [options.windowOnly=false] Scrolling changes the rendered slice within the same membership.
     * @param {Function} [options.recordsFor] Shared visible population lookup for the current Store event.
     */
    reconcileColumn(column, {windowOnly=false, recordsFor=this.#projectionRecords()}={}) {
        let me          = this,
            {body}      = column,
            records     = recordsFor(column.status, column.laneValue),
            sourceCount = column.maxRenderedCards !== null && me.store?.allItems
                ? me.#recordsForColumn(me.store.allItems, column.status, column.laneValue).length
                : records.length,
            desired     = column.selectWindow(records, sourceCount),
            keys        = new Set(desired.map(record => me.getKey(record))),
            retired     = [];

        me.cardMap.forEach((card, key) => {
            const {record} = card;

            if (me.getSourceRecord(key) !== record) {
                retired.push(key)
            } else if (column.isSliced && !keys.has(key) && record[me.statusField] === column.status &&
                (!me.laneField || (record[me.laneField] ?? null) === (column.laneValue ?? null))) {
                card.parent?.remove(card, false);

                if (me.retainedCards.get(key) !== column) {
                    me.retainedCards.delete(key);
                    me.retainedCards.set(key, column)
                }
            }
        });

        // Retire old snapshots before any successor can register the same component id.
        me.retireCards(retired);

        [...body.items].forEach(card => {
            const key = me.getKey(card.record);

            if (!keys.has(key)) {
                if (!me.getSourceRecord(key)) {
                    me.retireCards([key])
                } else {
                    body.remove(card, false);
                    if (column.isSliced) {
                        me.retainedCards.delete(key);
                        me.retainedCards.set(key, column)
                    }
                }
            }
        });

        const rovingKey = me.selectionModel?.getRovingTabKey(recordsFor) ?? null;

        desired.forEach((record, index) => {
            const key  = me.getKey(record),
                  card = me.cardMap.get(key) || me.createCard(record);

            me.retainedCards.delete(key);

            card.vdom['aria-posinset'] = column.windowStart + index + 1;
            card.vdom['aria-setsize']  = records.length;
            me.selectionModel?.annotateCard(card, rovingKey, true);

            if (card.parent === body) {
                const current = body.items.indexOf(card);
                current !== index && body.moveTo(current, index)
            } else {
                body.insert(index, card)
            }
        });

        column.count = records.length;
        !windowOnly && me.columnSummary && column.syncSummary();
        const laneRow = column.parent?.parent;
        laneRow instanceof LaneRow && laneRow.updateCount();
        me.selectionModel?.syncAnnotations(true, recordsFor);
        me.trimRetainedCards(column, column.retentionLimit);
        column.updateSpacers()
    }

    /**
     * @summary Destroys a batch of cards and retires every owned body snapshot before IDs can be reused.
     * @description Keys belong to the existing card map, so a null or replacement Store need not resolve them.
     * Attached cards use their parent's destruction contract. A moved or retained card can still occur in an
     * earlier body's vnode; unlink all retired IDs there, keeping the last rendered nodes for the next diff.
     * @param {Array<String|Number>} keys Existing card-map keys to retire.
     * @protected
     */
    retireCards(keys) {
        if (!keys.length) return;
        const me = this, retired = {}, parents = new Set();

        keys.forEach(key => {
            const card = me.cardMap.get(key);
            if (!card) return;
            const {id, parent, vnode} = card;

            retired[id] = vnode;
            me.cardMap.delete(key);
            me.retainedCards.delete(key);
            if (parent) {
                parent.remove(card, true, true);
                parents.add(parent)
            } else {
                card.destroy()
            }
        });

        me.getColumns().forEach(column => {
            const body = column.body;
            if (body && VNodeUtil.unlinkRetiredReferences(body.vnode, retired)) parents.add(body)
        });
        parents.forEach(parent => !parent.isDestroyed && parent.update())
    }

    /**
     * @summary Evicts only this column's oldest offscreen cards, never a card adopted by another column.
     * @param {Neo.board.Column} column
     * @param {Number} limit Maximum retained card count.
     */
    trimRetainedCards(column, limit) {
        const me = this, keys = [];

        me.retainedCards.forEach((owner, key) => {
            if (owner !== column) return;
            const card   = me.cardMap.get(key),
                  record = card?.record,
                  target = record && me.getColumn(record[me.statusField], me.laneField ? record[me.laneField] : null);

            if (target && target !== column) {
                me.retainedCards.delete(key);
                me.retainedCards.set(key, target)
            } else {
                keys.push(key)
            }
        });

        const retired = [];
        keys.slice(0, Math.max(0, keys.length - limit)).forEach(key => {
            const card = me.cardMap.get(key);
            me.retainedCards.delete(key);
            if (card && !card.parent) retired.push(key)
        });
        me.retireCards(retired)
    }

    /**
     * @summary A value as a DOM-id-safe slug that keeps distinct values distinct: letters, digits and hyphens stay;
     * every other UTF-16 unit becomes `_<hex>_`.
     * @description The underscore is never kept, so every underscore in a slug opens an escape and the mapping
     * is injective: `in-progress` stays, `in progress` → `in_20_progress`, `a/b` → `a_2f_b`, `a_b` → `a_5f_b`.
     * A lossy slug would let `in progress` and `in-progress` share one component id.
     *
     * Types stay apart as well. A number and a string slug as their text, except a string that reads as a number:
     * it and every other type lead with `_<type>_`, which no escape can produce, so the key `1` → `1` and the key
     * `'1'` → `_string_1`.
     * @param {*} value
     * @returns {String}
     */
    static slug(value) {
        const
            type = typeof value,
            text = String(value).replace(/[^A-Za-z0-9-]/g, char => `_${char.charCodeAt(0).toString(16)}_`);

        return type === 'number' || (type === 'string' && String(Number(value)) !== value) ? text : `_${type}_${text}`
    }

    /**
     * @summary A finite number, or +Infinity so unranked records sort last
     * @param {*} value
     * @returns {Number}
     */
    static toNumber(value) {
        return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY
    }
}

export default Neo.setupClass(Board);
