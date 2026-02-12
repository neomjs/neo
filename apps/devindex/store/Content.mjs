import ContentModel from '../model/Content.mjs';
import Store        from '../../../src/data/Store.mjs';

/**
 * @class DevIndex.store.Content
 * @extends Neo.data.Store
 */
class Content extends Store {
    static config = {
        /**
         * @member {String} className='DevIndex.store.Content'
         * @protected
         */
        className: 'DevIndex.store.Content',
        /**
         * @member {Neo.data.Model} model=ContentModel
         * @reactive
         */
        model: ContentModel
    }
}

export default Neo.setupClass(Content);
