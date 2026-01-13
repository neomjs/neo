import BlogModel from '../model/Blog.mjs';
import Store     from '../../../src/data/Store.mjs';

/**
 * @class Portal.store.Blog
 * @extends Neo.data.Store
 */
class Blog extends Store {
    static config = {
        /**
         * @member {String} className='Portal.store.Blog'
         * @protected
         */
        className: 'Portal.store.Blog',
        /**
         * @member {Neo.data.Model} model=BlogModel
         * @reactive
         */
        model: BlogModel,
        /**
         * @member {String} url='../../apps/portal/resources/data/blog.json'
         */
        url: '../../apps/portal/resources/data/blog.json'
    }
}

export default Neo.setupClass(Blog);
