import TicketLabel from '../model/TicketLabel.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @class Portal.store.TicketLabels
 * @extends Neo.data.Store
 */
class TicketLabels extends Store {
    static config = {
        /**
         * @member {String} className='Portal.store.TicketLabels'
         * @protected
         */
        className: 'Portal.store.TicketLabels',
        /**
         * @member {String} keyProperty='name'
         * @protected
         */
        keyProperty: 'name',
        /**
         * @member {Neo.data.Model} model=TicketLabel
         * @protected
         */
        model: TicketLabel,
        /**
         * @member {String} url='../../apps/portal/resources/data/labels.json'
         * @protected
         */
        url: '../../apps/portal/resources/data/labels.json'
    }
}

export default Neo.setupClass(TicketLabels);
