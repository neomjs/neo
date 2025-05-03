import ContentModel from '../model/Content.mjs';
import Store        from '../../../src/data/Store.mjs';

/**
 * @class Portal.store.Content
 * @extends Neo.data.Store
 */
class Content extends Store {
    static config = {
        /**
         * @member {String} className='Portal.store.Content'
         * @protected
         */
        className: 'Portal.store.Content',
        /**
         * @member {Neo.data.Model} model=ContentModel
         */
        model: ContentModel
    }
}

export default Neo.setupClass(Content);
