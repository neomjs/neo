import Model from '../../../src/data/Model.mjs';

/**
 * @class Portal.model.BlogNeo
 * @extends Neo.data.Model
 */
class BlogNeo extends Model {
    static config = {
        /**
         * @member {String} className='Portal.model.BlogNeo'
         * @protected
         */
        className: 'Portal.model.BlogNeo',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name        : 'collapsed',
            type        : 'Boolean',
            defaultValue: true
        }, {
            name: 'date',
            type: 'String'
        }, {
            name: 'name',
            type: 'String'
        }, {
            name: 'path',
            type: 'String'
        }, {
            name        : 'isLeaf',
            type        : 'Boolean',
            defaultValue: true
        }, {
            name        : 'parentId',
            type        : 'String',
            defaultValue: null
        }, {
            // Computed field for TreeList display
            name: 'treeNodeName',
            type: 'html',
            /**
             * @param {Object} data
             * @param {String} data.date
             * @param {String} data.name
             * @returns {String}
             */
            calculate({date, name}) {
                if (date) {
                    return `<span class="blog-date">[${new Date(date).toLocaleDateString()}]</span> <b>${name}</b>`
                }

                return name
            }
        }, {
            name: 'id',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(BlogNeo);
