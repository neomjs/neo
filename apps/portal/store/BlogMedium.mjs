import MediumBlogModel from '../model/BlogMedium.mjs';
import Store           from '../../../src/data/Store.mjs';

/**
 * @class Portal.store.BlogMedium
 * @extends Neo.data.Store
 */
class BlogMedium extends Store {
    static config = {
        /**
         * @member {String} className='Portal.store.BlogMedium'
         * @protected
         */
        className: 'Portal.store.BlogMedium',
        /**
         * @member {Boolean} autoLoad=true
         */
        autoLoad: true,
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=BlogMedium
         * @reactive
         */
        model: MediumBlogModel,
        /**
         * @member {Object[]} sorters=[{property: 'id', direction: 'DESC'}]
         * @reactive
         */
        sorters: [{
            property : 'id',
            direction: 'DESC'
        }],
        /**
         * @member {String} url='../../apps/portal/resources/data/medium_blog.json'
         */
        url: '../../apps/portal/resources/data/medium_blog.json'
    }
}

export default Neo.setupClass(BlogMedium);
