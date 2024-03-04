import Model from '../../../src/data/Model.mjs';

/**
 * @class Portal.model.ContentSection
 * @extends Neo.data.Model
 */
class ContentSection extends Model {
    static config = {
        /**
         * @member {String} className='Portal.model.ContentSection'
         * @protected
         */
        className: 'Portal.model.ContentSection',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'id',
            type: 'Int'
        }, {
            name: 'value',
            type: 'String'
        }]
    }
}

Neo.setupClass(ContentSection);

export default ContentSection;
