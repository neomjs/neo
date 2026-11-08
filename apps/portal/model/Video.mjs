import Model from '../../../src/data/Model.mjs';

/**
 * @summary One film of the news section's Videos tab, as curated in `resources/data/videos.json`.
 *
 * `youtubeId` names the upload, `product` is one of `engine`, `pro`, `stage` or `institution`, and `date` is the
 * ISO publication date. `thumbnail` is optional: without it, the list shows YouTube's own preview image.
 * @class Portal.model.Video
 * @extends Neo.data.Model
 */
class Video extends Model {
    static config = {
        /**
         * @member {String} className='Portal.model.Video'
         * @protected
         */
        className: 'Portal.model.Video',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'date',
            type: 'String'
        }, {
            name: 'description',
            type: 'String'
        }, {
            name: 'id',
            type: 'Integer'
        }, {
            name: 'name',
            type: 'String'
        }, {
            name: 'product',
            type: 'String'
        }, {
            name        : 'thumbnail',
            type        : 'String',
            defaultValue: null
        }, {
            name: 'youtubeId',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(Video);
