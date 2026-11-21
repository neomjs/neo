import BoardContainer from '../../../src/board/Container.mjs';
import Button         from '../../../src/button/Base.mjs';
import Component      from '../../../src/component/Base.mjs';
import Container      from '../../../src/container/Base.mjs';
import Label          from '../../../src/component/Label.mjs';
import ReportStore    from './ReportStore.mjs';
import StateProvider  from '../../../src/state/Provider.mjs';
import ThemeSwitcher  from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar        from '../../../src/toolbar/Base.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';

const
    columns = [
        {status: 'inbox',   title: 'Inbox'},
        {status: 'sprint',  title: 'This sprint'},
        {status: 'later',   title: 'Later'},
        {status: 'wontfix', title: 'Won\'t fix'}
    ],
    // The gestures the board's selection model answers, as the line under the toolbar names them
    keyHints = [
        [['Click'],             'selects one'],
        [['Shift', 'Click'],    'a range'],
        [['⌘ / Ctrl', 'Click'], 'adds or removes'],
        [['⌘ / Ctrl', 'A'],     'its whole column'],
        [['Esc'],               'clears']
    ];

/**
 * @summary A bug triage: forty reports in the Inbox, selected by click, Shift and the command key, and moved into
 * another column by one drag.
 * @description The board's selection model ({@link Neo.board.SelectionModel}) selects by click, by Shift-click as a
 * range, by `⌘`/`Ctrl`-click one at a time and by `⌘`/`Ctrl`+`A` for the focused column; `Escape` clears. A drag that
 * starts on a selected card carries the whole selection ({@link Neo.board.SortZone}). The line under the toolbar
 * reads the board's `selectionChange` event, and its Clear button calls `deselectAll()`; the column headers count
 * their cards on their own.
 * @class Neo.examples.board.multiSelect.Viewport
 * @extends Neo.container.Viewport
 */
class MultiSelectViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.multiSelect.Viewport'
         * @protected
         */
        className: 'Neo.examples.board.multiSelect.Viewport',
        /**
         * @member {String[]} cls=['triage-example']
         */
        cls: ['triage-example'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            stores: {reports: {module: ReportStore}}
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['triage-toolbar'],
            flex  : 'none',
            items : [
                {module: Label, cls: ['triage-title'],    text: 'Bug triage'},
                {module: Label, cls: ['triage-subtitle'], text: 'Select many reports, move them in one drag'},
                '->',
                {module: ThemeSwitcher}
            ]
        }, {
            module: Container,
            cls   : ['triage-selection-bar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module   : Label,
                cls      : ['triage-selection-count'],
                reference: 'selection-count',
                text     : '0 selected'
            }, {
                module   : Button,
                cls      : ['triage-clear'],
                disabled : true,
                handler  : 'up.onClearSelection',
                reference: 'clear-button',
                text     : 'Clear'
            }, {
                module: Component,
                cls   : ['triage-keys'],
                vdom  : {
                    'aria-label': 'Selection keys',
                    cn          : keyHints.map(([keys, effect]) => ({
                        tag: 'span',
                        cls: ['triage-key-hint'],
                        cn : [
                            ...keys.map(key => ({tag: 'kbd', text: key})),
                            {tag: 'span', cls: ['triage-key-effect'], text: effect}
                        ]
                    }))
                }
            }]
        }, {
            module           : BoardContainer,
            ariaLabel        : 'Bug triage board',
            bind             : {store: 'stores.reports'},
            cardItems        : [{type: 'title'}, {type: 'tags'}],
            cls              : ['triage-board'],
            columns,
            columnsResortable: false,
            flex             : 1,
            reference        : 'board'
        }]
    }

    /**
     * @summary Listens to the board's `selectionChange` once the view exists.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('board').on({
            selectionChange: me.onBoardSelectionChange,
            scope          : me
        })
    }

    /**
     * @summary Writes "n selected" and enables Clear while anything is selected.
     * @param {Object}   data
     * @param {Array}    data.selection The selected record keys
     */
    onBoardSelectionChange({selection}) {
        let me    = this,
            count = selection.length,
            label = me.getReference('selection-count');

        label.text = `${count} selected`;
        label.toggleCls('triage-has-selection', count > 0);
        me.getReference('clear-button').disabled = count === 0
    }

    /**
     * @summary Clears the board's selection; the board's `selectionChange` then resets the line.
     */
    onClearSelection() {
        this.getReference('board').selectionModel.deselectAll()
    }
}

export default Neo.setupClass(MultiSelectViewport);
