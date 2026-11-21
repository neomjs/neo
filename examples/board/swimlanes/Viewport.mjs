import BoardContainer from '../../../src/board/Container.mjs';
import Label          from '../../../src/component/Label.mjs';
import MainStore      from './MainStore.mjs';
import StateProvider  from '../../../src/state/Provider.mjs';
import ThemeSwitcher  from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar        from '../../../src/toolbar/Base.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';

/**
 * @summary A product team's quarter on one board, one swimlane per team.
 * @description The board's `laneField` is the card's `team`: each team gets a row with its title, its card count and
 * a collapse toggle, over the same five columns. `lanes` fixes the teams' order and starts Web collapsed, so the
 * first screen shows a folded row with its count between two open ones; the cards without a team fill the
 * "Unassigned" row the board adds after them. A card dropped into another team's row takes that team, so both rows'
 * counts change.
 * @class Neo.examples.board.swimlanes.Viewport
 * @extends Neo.container.Viewport
 */
class SwimlanesViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.swimlanes.Viewport'
         * @protected
         */
        className: 'Neo.examples.board.swimlanes.Viewport',
        /**
         * @member {String[]} cls=['board-swimlanes-example']
         */
        cls: ['board-swimlanes-example'],
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
            cls   : ['board-swimlanes-example-toolbar'],
            flex  : 'none',
            items : [
                {module: Label, cls: ['board-swimlanes-example-title'], text: 'Product quarter'},
                {module: Label, cls: ['board-swimlanes-example-hint'],  text: 'Collapse a team. Drag a card into another team\'s row.'},
                '->',
                {module: ThemeSwitcher}
            ]
        }, {
            module   : BoardContainer,
            bind     : {store: 'stores.cards'},
            flex     : 1,
            laneField: 'team',
            reference: 'board',
            columns  : [
                {status: 'backlog',     title: 'Backlog'},
                {status: 'ready',       title: 'Ready'},
                {status: 'in-progress', title: 'In progress'},
                {status: 'review',      title: 'Review'},
                {status: 'done',        title: 'Done'}
            ],
            lanes: [
                {value: 'Design'},
                {value: 'Web', collapsed: true},
                {value: 'Mobile'},
                {value: 'Platform'}
            ]
        }]
    }
}

export default Neo.setupClass(SwimlanesViewport);
