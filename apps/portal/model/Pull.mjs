import Model from '../../../src/data/Model.mjs';

/**
 * Tree-node model for the portal Pull Requests view. Mirrors `Portal.model.Ticket`: release group
 * roots, chunk folder nodes and PR leaves of the chunked surface. The `childCount` / `childrenUrl` /
 * `contentDir` / `filePrefix` fields carry the chunk nodes' lazy-load and content-reconstruction
 * metadata; leaves omit repeated per-item paths by design.
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
            name: 'title', // "fix(build): bypass hooks for data sync commits (#11590)" — ticket-ref-ok: illustrative PR-title sample, not a tracking ref
            type: 'String'
        }, {
            // Computed field for TreeList display
            name: 'treeNodeName',
            type: 'html',
            /**
             * @param {Object}   data
             * @param {Number}   data.childCount
             * @param {String}   data.childrenUrl
             * @param {String}   data.id
             * @param {Boolean}  data.isLeaf
             * @param {String}   data.title
             * @returns {String}
             */
            calculate({childCount, childrenUrl, id, isLeaf, title}) {
                if (isLeaf) {
                    return `<b>${id}</b> <span class="pr-title">${title}</span>`
                }

                // Chunk-folder nodes: render a positional PR range (e.g. "PRs 1-100") instead of the
                // raw `chunk-N` implementation label. Mirrors Portal.model.Ticket's range scheme so the
                // tickets + pulls chunked trees stay consistent (each chunk holds up to 100 entries).
                if (childrenUrl && title) {
                    let match = title.match(/chunk-(\d+)$/);

                    if (match) {
                        let start = (Number(match[1]) - 1) * 100 + 1,
                            end   = childCount ? start + childCount - 1 : start + 99;

                        return `PRs ${start}-${end}`
                    }
                }

                return id
            }
        }]
    }
}

export default Neo.setupClass(Pull);
