import Store     from '../../../src/data/Store.mjs';
import PullModel from '../model/Pull.mjs';

/**
 * Tree store for the portal Pull Requests view. Loads the chunked lazy index `pulls/index.json` —
 * release-group roots (`Latest` for unreleased + one per release version) with chunk-folder nodes
 * whose PR leaves lazy-load on folder expansion. Mirrors the discussions view's chunked store.
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
         * @member {String} url='../../apps/portal/resources/data/pulls/index.json'
         */
        url: '../../apps/portal/resources/data/pulls/index.json'
    }
}

export default Neo.setupClass(Pulls);
