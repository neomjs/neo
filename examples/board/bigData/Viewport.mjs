import BoardContainer from '../../../src/board/Container.mjs';
import Label          from '../../../src/component/Label.mjs';
import StateProvider  from '../../../src/state/Provider.mjs';
import ThemeSwitcher  from '../../../src/button/ThemeSwitcher.mjs';
import TicketColumn   from './TicketColumn.mjs';
import TicketStore    from './TicketStore.mjs';
import Toolbar        from '../../../src/toolbar/Base.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';

const
    columns = [
        {status: 'new',     title: 'New'},
        {status: 'triage',  title: 'Triage'},
        {status: 'waiting', title: 'Waiting on customer'},
        {status: 'solved',  title: 'Solved'},
        {status: 'closed',  title: 'Closed'}
    ],
    numberFormat = new Intl.NumberFormat('en-US');

/**
 * @summary A support desk of 10,000 tickets in five columns, each column rendering a window of about a hundred cards.
 * @description The board's columns slice their records (`maxRenderedCards` 100 plus `overscan` 10) and move the
 * window as their bodies scroll, so the DOM holds a few hundred cards whatever the store holds. The toolbar's counter
 * reads the store's count and adds up the cards the open columns render (a collapsed column's body leaves the DOM);
 * {@link Neo.examples.board.bigData.TicketColumn} reports each window change and each collapse, so the number
 * follows every scroll, drop and collapse.
 * @class Neo.examples.board.bigData.Viewport
 * @extends Neo.container.Viewport
 */
class BigDataViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.bigData.Viewport'
         * @protected
         */
        className: 'Neo.examples.board.bigData.Viewport',
        /**
         * @member {String[]} cls=['desk-example']
         */
        cls: ['desk-example'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            stores: {tickets: {module: TicketStore}}
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['desk-toolbar'],
            flex  : 'none',
            items : [
                {module: Label, cls: ['desk-title'],    text: 'Support desk'},
                {module: Label, cls: ['desk-subtitle'], text: 'Scroll New to its end and drag its last ticket into Triage: the counts follow, and the DOM stays small'},
                {module: Label, cls: ['desk-counter'],  reference: 'counter', text: ''},
                {module: ThemeSwitcher}
            ]
        }, {
            module           : BoardContainer,
            ariaLabel        : 'Support desk board',
            bind             : {store: 'stores.tickets'},
            cardItems        : [{type: 'title'}, {type: 'tags'}, {type: 'avatars'}],
            cls              : ['desk-board'],
            columnModule     : TicketColumn,
            columns,
            columnsResortable: false,
            flex             : 1,
            reference        : 'board'
        }]
    }

    /**
     * @summary Listens to the board once the view exists, and writes the first count.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('board').on({
            cardWindowChange: me.syncCounter,
            cardsMove       : me.syncCounter,
            scope           : me
        });

        me.syncCounter()
    }

    /**
     * @summary Writes "10,000 cards · n in the DOM": the store's count, and the cards the open columns render.
     */
    syncCounter() {
        let me       = this,
            board    = me.getReference('board'),
            counter  = me.getReference('counter'),
            total    = board?.store?.getCount() ?? 0,
            rendered = board?.getOpenColumns().reduce((sum, column) => sum + (column.body?.items.length ?? 0), 0) ?? 0;

        if (counter) {
            counter.text = `${numberFormat.format(total)} cards · ${numberFormat.format(rendered)} in the DOM`
        }
    }
}

export default Neo.setupClass(BigDataViewport);
