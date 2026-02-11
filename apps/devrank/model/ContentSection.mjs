import Model from '../../../src/data/Model.mjs';

/**
 * @class DevRank.model.ContentSection
 * @extends Neo.data.Model
 */
class ContentSection extends Model {
    static config = {
        /**
         * @member {String} className='DevRank.model.ContentSection'
         * @protected
         */
        className: 'DevRank.model.ContentSection',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'id',
            type: 'String'
        }, {
            name: 'name',
            type: 'String'
        }, {
            name: 'tag',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(ContentSection);
