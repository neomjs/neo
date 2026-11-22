import BoardContainer   from '../../../src/board/Container.mjs';
import Button           from '../../../src/button/Base.mjs';
import {isCardOverdue}  from '../../../src/board/CardItems.mjs';
import Component        from '../../../src/component/Base.mjs';
import Container        from '../../../src/container/Base.mjs';
import DateUtil         from '../../../src/util/Date.mjs';
import Label            from '../../../src/component/Label.mjs';
import ReleaseItemStore from './ReleaseItemStore.mjs';
import StateProvider    from '../../../src/state/Provider.mjs';
import ThemeSwitcher    from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar          from '../../../src/toolbar/Base.mjs';
import Viewport         from '../../../src/container/Viewport.mjs';

const
    COLUMNS = [
        {status: 'backlog',     title: 'Backlog'},
        {status: 'in-progress', title: 'In progress'},
        {status: 'review',      title: 'In review'},
        {status: 'shipped',     title: 'Shipped'}
    ],
    DUE_DATE_ITEM = {
        type        : 'dueDate',
        doneStatuses: ['shipped'],
        relative    : true
    },
    CARD_ITEMS = [
        {type: 'title'},
        {type: 'tags'},
        {type: 'progress'},
        DUE_DATE_ITEM,
        {type: 'avatars'}
    ];

/**
 * @summary Release-calendar Task Board demonstrating relative due dates, non-color-alone overdue badges, `CardEditor`
 * deadline updates, and one-click filtering to late items.
 * @description Generates 20 deliverables relative to today across `Backlog`, `In progress`, `In review`, and `Shipped`.
 * Active cards past their deadline carry `.neo-board-card-due-date-overdue` (`! Overdue Nd · Mon D`) and
 * `.neo-board-card-overdue`, while `Shipped` items retain calm `Due Mon D` badges. Pressing `Late only` applies a
 * `Neo.collection.Filter` (`reapplyOnRecordChange: true`) over `dueDate` and `status`, so rescheduling a late card in
 * `CardEditor` or dragging it into `Shipped` updates the board and overdue counts immediately.
 * @class Neo.examples.board.dueDates.Viewport
 * @extends Neo.container.Viewport
 */
class DueDatesViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.dueDates.Viewport'
         * @protected
         */
        className: 'Neo.examples.board.dueDates.Viewport',
        /**
         * @member {String[]} cls=['due-viewport']
         */
        cls: ['due-viewport'],
        /**
         * True while the board is narrowed to overdue cards only.
         * @member {Boolean} lateOnly_=false
         * @reactive
         */
        lateOnly_: false,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align:'stretch'},
        /**
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            stores: {
                deliverables: {module: ReleaseItemStore}
            }
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['due-toolbar'],
            flex  : 'none',
            items : [{
                module: Label,
                cls   : ['due-title'],
                text  : 'Horizon 4.2 release'
            }, {
                module   : Label,
                cls      : ['due-summary-pill'],
                reference: 'summary-pill',
                text     : '5 overdue · 2 today · 20 cards'
            }, {
                module: Component,
                cls   : ['due-spacer'],
                flex  : 1
            }, {
                module   : Button,
                cls      : ['due-late-toggle'],
                handler  : 'up.onToggleLateOnly',
                pressed  : false,
                reference: 'late-filter-button',
                text     : 'Late only (5)'
            }, {
                module   : Button,
                cls      : ['due-reset-button'],
                disabled : true,
                handler  : 'up.onResetBoard',
                reference: 'reset-button',
                text     : 'Reset'
            }, {
                module: ThemeSwitcher
            }]
        }, {
            module: Container,
            cls   : ['due-subbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module   : Label,
                cls      : ['due-prompt'],
                reference: 'prompt-label',
                text     : 'Click ⋯ on a card to edit its due date, or press Late only to focus on overdue work.'
            }, {
                module: Component,
                cls   : ['due-sub-spacer'],
                flex  : 1
            }, {
                module: Component,
                cls   : ['due-legend'],
                vdom  : {
                    tag         : 'div',
                    'aria-label': 'Deadline states',
                    cn          : [
                        {tag: 'span', cls: ['due-legend-chip', 'is-overdue'], text: '! Overdue'},
                        {tag: 'span', cls: ['due-legend-chip', 'is-today'],   text: 'Today'},
                        {tag: 'span', cls: ['due-legend-chip', 'is-upcoming'], text: 'Upcoming / Shipped'}
                    ]
                }
            }]
        }, {
            module          : BoardContainer,
            ariaLabel       : 'Horizon 4.2 release calendar board',
            bind            : {store: 'stores.deliverables'},
            cardEditorConfig: {
                fieldLabels: {
                    assignees  : 'Owners',
                    description: 'Notes',
                    dueDate    : 'Due date',
                    progress   : 'Progress (%)',
                    status     : 'Column',
                    tags       : 'Tags',
                    title      : 'Deliverable'
                },
                fields: ['title', 'status', 'dueDate', 'progress', 'tags', 'assignees', 'description'],
                title : 'Edit deliverable'
            },
            cardItems        : CARD_ITEMS,
            cls              : ['due-board'],
            columns          : COLUMNS,
            columnsResortable: false,
            flex             : 1,
            reference        : 'board'
        }]
    }

    /**
     * Snapshot of initial deliverable states keyed by `id` for dirty/reset detection.
     * @member {Map<String, String>|null} #baselineSnapshot=null
     * @private
     */
    #baselineSnapshot = null

    /**
     * @summary Applies or clears the store's overdue filter and synchronizes toolbar controls when `lateOnly` changes.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetLateOnly(value, oldValue) {
        if (oldValue === undefined) {
            return
        }

        const
            me     = this,
            store  = me.#getDeliverablesStore(),
            board  = me.getReference('board'),
            toggle = me.getReference('late-filter-button');

        if (toggle) {
            toggle.pressed = Boolean(value)
        }

        if (board) {
            board.toggleCls('is-late-only', Boolean(value))
        }

        if (store) {
            store.filters = value ? [{
                fields               : ['dueDate', 'status'],
                filterBy             : ({item}) => !isCardOverdue(item, DUE_DATE_ITEM),
                reapplyOnRecordChange: true
            }] : []
        }

        me.syncSummary()
    }

    /**
     * @summary Captures the baseline record snapshot and wires store listeners once constructed.
     */
    onConstructed() {
        super.onConstructed();

        const
            me    = this,
            store = me.#getDeliverablesStore();

        if (store) {
            me.#captureBaseline(store);
            store.on({
                filter      : me.syncSummary,
                load        : me.syncSummary,
                recordChange: me.syncSummary,
                scope       : me
            })
        }

        me.syncSummary()
    }

    /**
     * @summary Restores the 20-card relative-to-today dataset and clears the `Late only` filter.
     */
    onResetBoard() {
        const
            me    = this,
            store = me.#getDeliverablesStore();

        if (me.lateOnly) {
            me.lateOnly = false
        }

        if (store) {
            store.data = ReleaseItemStore.buildReleaseItems();
            me.#captureBaseline(store)
        }

        me.syncSummary()
    }

    /**
     * @summary Toggles the `Late only` overdue filter on the board's store.
     */
    onToggleLateOnly() {
        this.lateOnly = !this.lateOnly
    }

    /**
     * @summary Recomputes live overdue and due-today counts across all canonical store records and updates the toolbar.
     */
    syncSummary() {
        const
            me         = this,
            store      = me.#getDeliverablesStore(),
            population = store ? (store.allItems || store).items : [],
            todayIso   = DateUtil.convertToyyyymmdd(new Date()),
            pill       = me.getReference('summary-pill'),
            toggle     = me.getReference('late-filter-button'),
            resetBtn   = me.getReference('reset-button');

        let overdueCount = 0,
            todayCount   = 0;

        for (const record of population) {
            if (isCardOverdue(record, DUE_DATE_ITEM)) {
                overdueCount++
            } else if (record.status !== 'shipped' && String(record.dueDate || '').slice(0, 10) === todayIso) {
                todayCount++
            }
        }

        if (pill) {
            pill.text = `${overdueCount} overdue · ${todayCount} today · ${population.length} cards`
        }

        if (toggle) {
            toggle.text = `Late only (${overdueCount})`
        }

        if (resetBtn) {
            resetBtn.disabled = !me.lateOnly && !me.#isStoreDirty(population)
        }
    }

    /**
     * @summary Resolves the deliverables store from the view's StateProvider or bound board.
     * @returns {Neo.data.Store|null}
     * @private
     */
    #getDeliverablesStore() {
        return this.getStateProvider()?.getStore('deliverables') || this.getReference('board')?.store || null
    }

    /**
     * @summary Records serialized initial field values for dirty checking.
     * @param {Neo.data.Store} store
     * @private
     */
    #captureBaseline(store) {
        const
            population = (store.allItems || store).items,
            map        = new Map();

        for (const record of population) {
            map.set(record.id, `${record.status}|${record.dueDate}|${record.title}|${record.progress}`)
        }

        this.#baselineSnapshot = map
    }

    /**
     * @summary Returns true when any record differs from the initial relative-to-today snapshot.
     * @param {Object[]} population
     * @returns {Boolean}
     * @private
     */
    #isStoreDirty(population) {
        const baseline = this.#baselineSnapshot;

        if (!baseline || baseline.size !== population.length) {
            return false
        }

        return population.some(record =>
            baseline.get(record.id) !== `${record.status}|${record.dueDate}|${record.title}|${record.progress}`
        )
    }
}

export default Neo.setupClass(DueDatesViewport);
