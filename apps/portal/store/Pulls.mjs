import Store     from '../../../src/data/Store.mjs';
import PullModel from '../model/Pull.mjs';

/**
 * Tree store for the portal Pull Requests view. Loads the chunked `pulls.json` index (state groups
 * + chunk-folder nodes); the per-chunk PR leaves are fetched lazily on folder-expand by the shared
 * `TreeList` (`lazyChildLoad`), not loaded up front.
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
