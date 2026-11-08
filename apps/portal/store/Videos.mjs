import Store from '../../../src/data/Store.mjs';
import Video from '../model/Video.mjs';

/**
 * @summary The films of the news section's Videos tab, newest first.
 *
 * An entry's `id` rises with its publication date, so the `id` sorter keeps the chronology. The `name` filter
 * backs the tab's search field.
 * @class Portal.store.Videos
 * @extends Neo.data.Store
 */
class Videos extends Store {
    static config = {
        /**
         * @member {String} className='Portal.store.Videos'
         * @protected
         */
        className: 'Portal.store.Videos',
        /**
         * @member {Boolean} autoLoad=true
         */
        autoLoad: true,
        /**
         * @member {Object[]} filters=[{property: 'name', operator: 'like', value: null}]
         * @reactive
         */
        filters: [{
            operator: 'like',
            property: 'name',
            value   : null
        }],
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=Video
         * @reactive
         */
        model: Video,
        /**
         * @member {Object[]} sorters=[{property: 'id', direction: 'DESC'}]
         * @reactive
         */
        sorters: [{
            property : 'id',
            direction: 'DESC'
        }],
        /**
         * @member {String} url='../../apps/portal/resources/data/videos.json'
         */
        url: '../../apps/portal/resources/data/videos.json'
    }
}

export default Neo.setupClass(Videos);
