import Store       from '../../../src/data/Store.mjs';
import TicketModel from '../model/Ticket.mjs';

/**
 * Tree store for the portal Tickets view. Loads the chunked root index so
 * `TreeList.lazyChildLoad` can fetch ticket leaves on folder expansion instead
 * of eagerly loading an all-leaves payload.
 * @class Portal.store.Tickets
 * @extends Neo.data.Store
 */
class Tickets extends Store {
    static config = {
        /**
         * @member {String} className='Portal.store.Tickets'
         * @protected
         */
        className: 'Portal.store.Tickets',
        /**
         * @member {Neo.data.Model} model=TicketModel
         * @reactive
         */
        model: TicketModel,
        /**
         * @member {String} url='../../apps/portal/resources/data/tickets/index.json'
         */
        url: '../../apps/portal/resources/data/tickets/index.json'
    }
}

export default Neo.setupClass(Tickets);
