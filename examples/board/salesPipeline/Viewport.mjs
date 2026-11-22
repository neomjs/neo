import Board         from '../../../src/board/Container.mjs';
import Button        from '../../../src/button/Base.mjs';
import DealStore     from './DealStore.mjs';
import Label         from '../../../src/component/Label.mjs';
import StateProvider from '../../../src/state/Provider.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar       from '../../../src/toolbar/Base.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';
import {currency}    from './DealModel.mjs';

/**
 * @summary A sales pipeline whose column totals follow deals as they move.
 * @class Neo.examples.board.salesPipeline.Viewport
 * @extends Neo.container.Viewport
 */
class SalesPipelineViewport extends Viewport {
    static config = {
        className    : 'Neo.examples.board.salesPipeline.Viewport',
        cls          : ['sales-pipeline-viewport'],
        layout       : {ntype: 'vbox', align: 'stretch'},
        stateProvider: {module: StateProvider, stores: {deals: {module: DealStore}}},
        items        : [{
            module: Toolbar,
            cls   : ['sales-pipeline-toolbar'],
            flex  : 'none',
            items : [
                {module: Label, cls: ['sales-pipeline-title'], text: 'Sales pipeline'},
                '->',
                {module: Button, cls: ['sales-pipeline-advance'], reference: 'advance-button',
                    text: 'Advance Harbor Museum', handler: 'up.onAdvance'},
                {module: Button, cls: ['sales-pipeline-reset'], reference: 'reset-button', disabled: true,
                    text: 'Reset', handler: 'up.onReset'},
                {module: ThemeSwitcher}
            ]
        }, {
            module: Label,
            cls   : ['sales-pipeline-instruction'],
            flex  : 'none',
            text  : 'Drag a deal between stages, or advance Harbor Museum to Negotiation and watch the totals move.'
        }, {
            module       : Board,
            ariaLabel    : 'Sales pipeline',
            bind         : {store: 'stores.deals'},
            cardItems    : [{type: 'title'}, {type: 'text', field: 'dealAmountText'}, {type: 'text', field: 'ownerText'}],
            cls          : ['sales-pipeline-board'],
            columnSummary: {field: 'amount', formatter: currency.format},
            columns      : [
                {status: 'discovery', title: 'Discovery', color: 'var(--sales-pipeline-discovery)'},
                {status: 'proposal', title: 'Proposal', color: 'var(--sales-pipeline-proposal)'},
                {status: 'negotiation', title: 'Negotiation', color: 'var(--sales-pipeline-negotiation)'},
                {status: 'won', title: 'Won', color: 'var(--sales-pipeline-won)'}
            ],
            columnsResortable: false,
            flex             : 1,
            reference        : 'board'
        }]
    }

    /** @summary Tracks the real deal state after both drag and programmatic moves. */
    onConstructed() {
        super.onConstructed();
        this.getStateProvider().getStore('deals').on({recordChange: this.onDealChange, scope: this})
    }

    /** @summary Keeps the actions in step with edits and moves from either the button or a drag. */
    onDealChange({record}) {
        if (record.id === 'harbor-museum') {
            this.getReference('advance-button').disabled = record.status !== 'proposal'
        }
        this.getReference('reset-button').disabled = false
    }

    /** @summary Moves Harbor Museum through the same board operation as dragging. */
    onAdvance() {
        if (this.getStateProvider().getStore('deals').get('harbor-museum')?.status === 'proposal') {
            this.getReference('board').moveCard({key: 'harbor-museum', status: 'negotiation'})
        }
    }

    /** @summary Restores the opening deal records, including any fields changed in the card editor. */
    onReset() {
        const board = this.getReference('board');
        board.cardEditor?.cancel();
        board.store.resetDeals();
        this.getReference('advance-button').disabled = false;
        this.getReference('reset-button').disabled   = true
    }
}

export default Neo.setupClass(SalesPipelineViewport);
