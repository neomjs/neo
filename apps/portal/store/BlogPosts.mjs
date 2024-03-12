import BlogPost from '../model/BlogPost.mjs';
import Store    from '../../../src/data/Store.mjs';

/**
 * @class Portal.store.BlogPosts
 * @extends Neo.data.Store
 */
class BlogPosts extends Store {
    static config = {
        /**
         * @member {String} className='Portal.store.BlogPosts'
         * @protected
         */
        className: 'Portal.store.BlogPosts',
        /**
         * @member {Boolean} autoLoad=true
         */
        autoLoad: true,
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=BlogPost
         */
        model: BlogPost,
        /**
         * @member {Object[]} sorters=[{property: 'id', direction: 'DESC'}]
         */
        sorters: [{
            property : 'id',
            direction: 'DESC'
        }],
        /**
         * @member {String} url='../../apps/portal/data/blog.json'
         */
        url: '../../apps/portal/data/blog.json'
    }
}

Neo.setupClass(BlogPosts);

export default BlogPosts;
