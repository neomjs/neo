import Model from '../../../src/data/Model.mjs';

/**
 * @class Portal.model.Ticket
 * @extends Neo.data.Model
 */
class Ticket extends Model {
    static config = {
        /**
         * @member {String} className='Portal.model.Ticket'
         * @protected
         */
        className: 'Portal.model.Ticket',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'childCount',
            type: 'Integer'
        }, {
            name: 'childrenUrl',
            type: 'String'
        }, {
            name        : 'collapsed',
            type        : 'Boolean',
            defaultValue: true
        }, {
            name: 'contentDir',
            type: 'String'
        }, {
            name: 'filePrefix',
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
            name: 'path', // "resources/content/issues/chunk-N/issue-1234.md"
            type: 'String'
        }, {
            name: 'title', // "Fix elusive bug in Grid"
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
                    return `<b>${id}</b> <span class="ticket-title">${title}</span>`
                }

                if (childrenUrl && title) {
                    let match = title.match(/chunk-(\d+)$/);

                    if (match) {
                        let start = (Number(match[1]) - 1) * 100 + 1,
                            end   = childCount ? start + childCount - 1 : start + 99;

                        return `Tickets ${start}-${end}`
                    }
                }

                return id
            }
        }]
    }
}

export default Neo.setupClass(Ticket);
