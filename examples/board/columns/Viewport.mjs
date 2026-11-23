import BoardContainer from '../../../src/board/Container.mjs';
import Button         from '../../../src/button/Base.mjs';
import Component      from '../../../src/component/Base.mjs';
import MainStore      from './MainStore.mjs';
import StateProvider  from '../../../src/state/Provider.mjs';
import ThemeSwitcher  from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar        from '../../../src/toolbar/Base.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';

const INITIAL_COLUMNS = [
    {status: 'enquiry',   title: 'Enquiry',   color: '#64748b', collapsed: false, locked: false},
    {status: 'quote',     title: 'Quote',     color: '#38bdf8', collapsed: false, locked: false},
    {status: 'in-work',   title: 'In work',   color: '#a78bfa', collapsed: false, locked: false},
    {status: 'review',    title: 'Review',    color: '#f59e0b', collapsed: false, locked: false},
    {status: 'archive',   title: 'Archive',   color: '#475569', collapsed: true,  locked: false},
    {status: 'delivered', title: 'Delivered', color: '#34d399', collapsed: false, locked: true}
];

const cloneInitialColumns = () => INITIAL_COLUMNS.map(column => ({...column}));

/**
 * @summary Design studio commissions board demonstrating column header drag-reordering, vertical folded strips, and
 * index-pinned locked columns.
 * @description Binds a 20-record {@link Neo.examples.board.columns.MainStore} to {@link Neo.board.Container} across six
 * stages (`Enquiry`, `Quote`, `In work`, `Review`, `Archive` folded at the start, and `Delivered` locked at the end).
 * Unlocked headers drag through {@link Neo.board.ColumnSortZone} while `Delivered` keeps its final slot, every column
 * folds or opens via click or keyboard (`Enter` / `Space` on `.neo-board-column-collapse`), a live stage-order bar
 * writes the current column sequence as text, and a styled reset button restores the initial arrangement and cards.
 * @class Neo.examples.board.columns.Viewport
 * @extends Neo.container.Viewport
 */
class ColumnsViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.columns.Viewport'
         * @protected
         */
        className: 'Neo.examples.board.columns.Viewport',
        /**
         * @member {String[]} cls=['studio-viewport']
         */
        cls: ['studio-viewport'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            stores: {commissions: {module: MainStore}}
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['studio-toolbar'],
            flex  : 'none',
            items : [{
                module: Component,
                cls   : ['studio-brand'],
                vdom  : {
                    tag: 'div',
                    cn : [
                        {tag: 'span', cls: ['studio-title'],    text: 'Atelier Nord · Commissions'},
                        {tag: 'span', cls: ['studio-subtitle'], text: '20 studio commissions · Reorder, fold & lock stages'}
                    ]
                }
            }, '->', {
                module   : Component,
                cls      : ['studio-state-pill'],
                reference: 'statePill',
                vdom     : {
                    tag: 'div',
                    cn : [
                        {tag: 'span', cls: ['studio-state-folded'], text: '1 folded (Archive)'},
                        {tag: 'span', cls: ['studio-state-sep'],    text: '·'},
                        {tag: 'span', cls: ['studio-state-locked'], text: 'Delivered locked'}
                    ]
                }
            }, {
                module   : Button,
                cls      : ['studio-reset-btn'],
                handler  : 'up.onResetClick',
                reference: 'resetButton',
                text     : '↺ Reset arrangement'
            }, {
                module: ThemeSwitcher
            }]
        }, {
            module: Toolbar,
            cls   : ['studio-order-bar'],
            flex  : 'none',
            items : [{
                module   : Component,
                cls      : ['studio-order-readout'],
                reference: 'orderReadout',
                vdom     : {
                    tag: 'div',
                    cn : [
                        {tag: 'span', cls: ['studio-order-label'], text: 'Stage order:'},
                        {
                            tag : 'span',
                            cls : ['studio-order-value'],
                            text: 'Enquiry → Quote → In work → Review → Archive → Delivered'
                        }
                    ]
                }
            }, '->', {
                module: Component,
                cls   : ['studio-hint'],
                vdom  : {
                    tag: 'div',
                    cn : [{
                        tag : 'span',
                        text: 'Drag Review in front of In work · Open the Archive strip · Delivered stays locked'
                    }]
                }
            }]
        }, {
            module   : BoardContainer,
            bind     : {store: 'stores.commissions'},
            cardItems: [
                {type: 'title'},
                {type: 'text', field: 'commissionSummary'},
                {type: 'tags'},
                {type: 'progress'},
                {type: 'avatars'}
            ],
            cls              : ['studio-board'],
            columns          : cloneInitialColumns(),
            columnsResortable: true,
            flex             : 1,
            reference        : 'board'
        }]
    }

    /**
     * @type {Set<Neo.board.Column>}
     * @private
     */
    #observedColumns = new Set()

    /**
     * @summary Attaches collapse listeners to newly projected columns so the summary bar tracks folded strips live.
     */
    bindColumnListeners() {
        const
            me    = this,
            board = me.getReference('board');

        board?.getColumns().forEach(column => {
            if (!me.#observedColumns.has(column)) {
                me.#observedColumns.add(column);
                column.on({
                    collapse: me.syncArrangementSummary,
                    scope   : me
                })
            }
        })
    }

    /**
     * @summary Wires store and board listeners once constructed and renders the initial stage-order readout.
     */
    onConstructed() {
        super.onConstructed();

        const
            me    = this,
            board = me.getReference('board'),
            store = me.getStateProvider().getStore('commissions');

        store.on({
            load        : me.syncArrangementSummary,
            recordChange: me.syncArrangementSummary,
            scope       : me
        });

        board.on({
            cardsMove : me.syncArrangementSummary,
            columnMove: me.syncArrangementSummary,
            scope     : me
        });

        me.bindColumnListeners();
        me.syncArrangementSummary()
    }

    /**
     * @summary Restores the initial six-stage column order, `Archive` folded state, `Delivered` lock, and 20 commission
     * placements.
     */
    onResetClick() {
        const
            me    = this,
            board = me.getReference('board'),
            store = me.getStateProvider().getStore('commissions');

        if (!board || !store) {
            return
        }

        store.clear();
        store.add(store.generateData());
        board.columns = cloneInitialColumns();

        me.bindColumnListeners();
        me.syncArrangementSummary()
    }

    /**
     * @summary Updates the live stage-order text line, folded/locked status pill, and reset button active highlight.
     */
    syncArrangementSummary() {
        const
            me           = this,
            board        = me.getReference('board'),
            orderReadout = me.getReference('orderReadout'),
            statePill    = me.getReference('statePill'),
            resetButton  = me.getReference('resetButton');

        if (!board || !orderReadout || !statePill || !resetButton) {
            return
        }

        me.bindColumnListeners();

        const columns = board.getColumns();

        if (!columns.length) {
            return
        }

        const
            orderText    = columns.map(col => col.title ?? col.status).join(' → '),
            foldedTitles = columns.filter(col => col.collapsed).map(col => col.title ?? col.status),
            lockedTitles = columns.filter(col => col.locked).map(col => col.title ?? col.status),
            orderChanged = columns.some((col, index) => col.status !== INITIAL_COLUMNS[index]?.status ||
                Boolean(col.collapsed) !== Boolean(INITIAL_COLUMNS[index]?.collapsed));

        orderReadout.vdom.cn[1].text = orderText;
        orderReadout.update();

        statePill.vdom.cn[0].text = foldedTitles.length
            ? `${foldedTitles.length} folded (${foldedTitles.join(', ')})`
            : 'All stages open';
        statePill.vdom.cn[2].text = lockedTitles.length
            ? `${lockedTitles.join(', ')} locked`
            : 'No stage locked';
        statePill.update();

        resetButton.toggleCls('is-customized', orderChanged)
    }
}

export default Neo.setupClass(ColumnsViewport);
