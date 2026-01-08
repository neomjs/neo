import Model from '../../../src/data/Model.mjs';

/**
 * @class Portal.model.Release
 * @extends Neo.data.Model
 */
class Release extends Model {
    static config = {
        /**
         * @member {String} className='Portal.model.Release'
         * @protected
         */
        className: 'Portal.model.Release',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name        : 'collapsed',
            type        : 'Boolean',
            defaultValue: true
        }, {
            name: 'date', // "2026-01-05T21:00:29Z"
            type: 'String' // Keeping as string for now, could be Date
        }, {
            name: 'path', // "/.github/RELEASE_NOTES/v11.18.0.md"
            type: 'String'
        }, {
            name: 'title', // "Neo.mjs v11.18.0 Release Notes"
            type: 'String'
        }, {
            name: 'version', // "11.18.0"
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
            name: 'name',
            type: 'html',
            /**
             * @param {String} value
             * @param {Object} record
             * @returns {String}
             */
            convert(value, record) {
                if (record.date) {
                    return `<b>${value}</b> <span class="release-date">[${new Date(record.date).toLocaleDateString()}]</span>`
                }

                return value
            }
        }, {
            // Computed field for TreeList id
            name: 'id',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(Release);
