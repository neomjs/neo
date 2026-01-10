import Store       from '../../../src/data/Store.mjs';
import TicketModel from '../model/Ticket.mjs';

/**
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
         * @member {String} url='../../apps/portal/resources/data/tickets.json'
         */
        url: '../../apps/portal/resources/data/tickets.json'
    }
}

export default Neo.setupClass(Tickets);
