import DealModel from './DealModel.mjs';
import Store     from '../../../src/data/Store.mjs';

// Stable keys and order let Reset return every deal to its original position.
const deals = [
    {id: 'cedar-library', title: 'Cedar Library', status: 'discovery', amount: 10000, owner: 'Avery', order: 0},
    {id: 'north-gardens', title: 'North Gardens', status: 'discovery', amount: 9000, owner: 'Blake', order: 1},
    {id: 'maple-gallery', title: 'Maple Gallery', status: 'discovery', amount: 6000, owner: 'Casey', order: 2},
    {id: 'harbor-museum', title: 'Harbor Museum', status: 'proposal', amount: 18000, owner: 'Casey', order: 0, color: 'var(--neo-board-accent-color)'},
    {id: 'river-theatre', title: 'River Theatre', status: 'proposal', amount: 7000, owner: 'Devon', order: 1},
    {id: 'bay-aquarium', title: 'Bay Aquarium', status: 'proposal', amount: 5000, owner: 'Emery', order: 2},
    {id: 'summit-center', title: 'Summit Center', status: 'negotiation', amount: 25000, owner: 'Emery', order: 0},
    {id: 'oak-studio', title: 'Oak Studio', status: 'negotiation', amount: 9000, owner: 'Finley', order: 1},
    {id: 'lighthouse', title: 'Lighthouse Arts', status: 'won', amount: 36000, owner: 'Avery', order: 0}
];

/**
 * @summary The fixed fictional deals used by the sales pipeline.
 * @class Neo.examples.board.salesPipeline.DealStore
 * @extends Neo.data.Store
 */
class DealStore extends Store {
    static config = {
        className  : 'Neo.examples.board.salesPipeline.DealStore',
        keyProperty: 'id',
        model      : DealModel
    }

    /**
     * @summary Seeds the example unless the caller supplied deals.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        if (!this.items?.length) {
            this.resetDeals()
        }
    }

    /** @summary Restores the original deal values and stage order in one store load. */
    resetDeals() {
        this.setData(deals.map(deal => ({...deal})))
    }
}

export default Neo.setupClass(DealStore);
