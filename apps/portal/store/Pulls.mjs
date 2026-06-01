import Store     from '../../../src/data/Store.mjs';
import PullModel from '../model/Pull.mjs';

/**
 * Tree store for the portal Pull Requests view. Loads the flat `pulls.json` index — state-group
 * roots with PR leaves directly beneath, each carrying its markdown `path` — matching the tickets
 * view's `tickets.json` shape.
 * @class Portal.store.Pulls
 * @extends Neo.data.Store
 */
class Pulls extends Store {
    static config = {
        /**
         * @member {String} className='Portal.store.Pulls'
         * @protected
         */
        className: 'Portal.store.Pulls',
        /**
         * @member {Neo.data.Model} model=PullModel
         * @reactive
         */
        model: PullModel,
        /**
         * @member {String} url='../../apps/portal/resources/data/pulls.json'
         */
        url: '../../apps/portal/resources/data/pulls.json'
    }
}

export default Neo.setupClass(Pulls);
