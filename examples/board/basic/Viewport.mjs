import BoardContainer from '../../../src/board/Container.mjs';
import GridContainer  from '../../../src/grid/Container.mjs';
import Label          from '../../../src/component/Label.mjs';
import MainStore      from './MainStore.mjs';
import StateProvider  from '../../../src/state/Provider.mjs';
import Toolbar        from '../../../src/toolbar/Base.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';

const columns = [
    {status: 'backlog',     title: 'Backlog'},
    {status: 'ready',       title: 'Ready'},
    {status: 'in-progress', title: 'In progress', wipLimit: 5},
    {status: 'review',      title: 'Review',      wipLimit: 3},
    {status: 'done',        title: 'Done'}
];

/**
 * @summary A sprint board and a table of the same cards: two views over one store instance.
 * @description The view root's state provider holds the one card store, and both views bind it. A card moved on the
 * board is one `record.set({status, order})`; the table's row for that record shows the new status with no wiring
 * between the views. `in-progress` opens over its WIP limit and `review` under it, so both column states show at once.
 * @class Neo.examples.board.basic.Viewport
 * @extends Neo.container.Viewport
 */
class BoardViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.basic.Viewport'
         * @protected
         */
        className: 'Neo.examples.board.basic.Viewport',
        /**
         * @member {String[]} cls=['board-example']
         */
        cls: ['board-example'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            stores: {cards: {module: MainStore}}
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['board-example-toolbar'],
            flex  : 'none',
            items : [
                {module: Label, cls: ['board-example-title'],    text: 'Sprint board'},
                {module: Label, cls: ['board-example-subtitle'], text: 'One store, two views'}
            ]
        }, {
            ntype : 'container',
            cls   : ['board-example-body'],
            flex  : 1,
            layout: {ntype: 'hbox', align: 'stretch'},
            items : [{
                module   : BoardContainer,
                bind     : {store: 'stores.cards'},
                columns,
                flex     : 1,
                reference: 'board'
            }, {
                ntype : 'container',
                cls   : ['board-example-list'],
                layout: {ntype: 'vbox', align: 'stretch'},
                width : 420,
                items : [{
                    module: Label,
                    cls   : ['board-example-list-title'],
                    flex  : 'none',
                    text  : 'All cards'
                }, {
                    module   : GridContainer,
                    bind     : {store: 'stores.cards'},
                    flex     : 1,
                    reference: 'grid',
                    columns  : [{
                        dataField: 'title',
                        text     : 'Card',
                        width    : 180
                    }, {
                        dataField: 'status',
                        renderer : ({value}) => columns.find(column => column.status === value)?.title ?? value,
                        text     : 'Status',
                        width    : 104
                    }, {
                        dataField: 'assignees',
                        renderer : ({value}) => Array.isArray(value) ? value.join(', ') : '',
                        text     : 'Assignee',
                        width    : 112
                    }]
                }]
            }]
        }]
    }
}

export default Neo.setupClass(BoardViewport);
