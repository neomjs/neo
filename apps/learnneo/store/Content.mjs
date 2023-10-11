import ContentModel from '../model/Content.mjs';
import Store        from '../../../src/data/Store.mjs';

/**
 * @class LearnNeo.store.Content
 * @extends Neo.data.Store
 */
class Content extends Store {
    static config = {
        /**
         * @member {String} className='LearnNeo.store.Content'
         * @protected
         */
        className: 'LearnNeo.store.Content',
        /**
         * @member {Neo.data.Model} model=ContentModel
         */
        model: ContentModel
    }
}

Neo.applyClassConfig(Content);

export default Content;
