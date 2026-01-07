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
            name   : 'name',
            mapping: 'version',
            type   : 'String'
        }, {
            // Computed field for TreeList id
            name   : 'id',
            mapping: 'version',
            type   : 'String'
        }]
    }
}

export default Neo.setupClass(Release);
