import Model from '../../../src/data/Model.mjs';

/**
 * Tree-node model for the portal Pull Requests view. Mirrors `Portal.model.Ticket`: group roots +
 * PR leaves carrying their markdown `path`. The `childCount` / `childrenUrl` / `contentDir` /
 * `filePrefix` fields are retained in parity with the tickets model for the shared chunked future
 * surface; the current flat `pulls.json` does not populate them.
 * @class Portal.model.Pull
 * @extends Neo.data.Model
 */
class Pull extends Model {
    static config = {
        /**
         * @member {String} className='Portal.model.Pull'
         * @protected
         */
        className: 'Portal.model.Pull',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'childCount', // leaf count under a chunk-folder node (lazy index metadata)
            type: 'Integer'
        }, {
            name: 'childrenUrl', // relative URL of the chunk's child-index JSON (lazy index metadata)
            type: 'String'
        }, {
            name        : 'collapsed',
            type        : 'Boolean',
            defaultValue: true
        }, {
            name: 'contentDir', // "resources/content/pulls/chunk-N" — base dir for leaf path reconstruction
            type: 'String'
        }, {
            name: 'filePrefix', // "pr-" — leaf file prefix for path reconstruction
            type: 'String'
        }, {
            name: 'id',
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
            name: 'path', // "resources/content/pulls/chunk-N/pr-1234.md"
            type: 'String'
        }, {
            name: 'title', // "fix(build): bypass hooks for data sync commits (#11590)"
            type: 'String'
        }, {
            // Computed field for TreeList display
            name: 'treeNodeName',
            type: 'html',
            /**
             * @param {Object}  data
             * @param {String}  data.id
             * @param {Boolean} data.isLeaf
             * @param {String}  data.title
             * @returns {String}
             */
            calculate({id, isLeaf, title}) {
                return isLeaf ? `<b>${id}</b> <span class="pr-title">${title}</span>` : id
            }
        }]
    }
}

export default Neo.setupClass(Pull);
