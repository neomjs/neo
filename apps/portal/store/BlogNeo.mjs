import NeoBlogModel from '../model/BlogNeo.mjs';
import Store        from '../../../src/data/Store.mjs';

/**
 * @class Portal.store.BlogNeo
 * @extends Neo.data.Store
 */
class BlogNeo extends Store {
    static config = {
        /**
         * @member {String} className='Portal.store.BlogNeo'
         * @protected
         */
        className: 'Portal.store.BlogNeo',
        /**
         * @member {Neo.data.Model} model=BlogNeo
         * @reactive
         */
        model: NeoBlogModel,
        /**
         * @member {String} url='../../apps/portal/resources/data/blog.json'
         */
        url: '../../apps/portal/resources/data/blog.json'
    }
}

export default Neo.setupClass(BlogNeo);
