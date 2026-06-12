import DiscussionModel from '../model/Discussion.mjs';
import Store           from '../../../src/data/Store.mjs';

/**
 * @class Portal.store.Discussions
 * @extends Neo.data.Store
 */
class Discussions extends Store {
    static config = {
        /**
         * @member {String} className='Portal.store.Discussions'
         * @protected
         */
        className: 'Portal.store.Discussions',
        /**
         * @member {Neo.data.Model} model=DiscussionModel
         * @reactive
         */
        model: DiscussionModel,
        /**
         * @member {String} url='../../apps/portal/resources/data/discussions.json'
         */
        url: '../../apps/portal/resources/data/discussions.json'
    }
}

export default Neo.setupClass(Discussions);
