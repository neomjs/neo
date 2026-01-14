import Model from '../../../src/data/Model.mjs';

/**
 * @class Portal.model.BlogMedium
 * @extends Neo.data.Model
 */
class BlogMedium extends Model {
    static config = {
        /**
         * @member {String} className='Portal.model.BlogMedium'
         * @protected
         */
        className: 'Portal.model.BlogMedium',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'author',
            type: 'String'
        }, {
            name: 'authorImage',
            type: 'String'
        }, {
            name: 'backgroundColor',
            type: 'String'
        }, {
            name: 'date',
            type: 'String'
        }, {
            name: 'id',
            type: 'Integer'
        }, {
            name: 'image',
            type: 'String'
        }, {
            name: 'name',
            type: 'String'
        }, {
            name: 'provider',
            type: 'String'
        },{
            name: 'publisher',
            type: 'String'
        }, {
            name: 'selectedInto',
            type: 'Array'
        }, {
            name: 'type',
            type: 'String'
        }, {
            name: 'url',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(BlogMedium);
