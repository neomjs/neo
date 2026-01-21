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
            name        : 'collapsed',
            type        : 'Boolean',
            defaultValue: true
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
            name: 'path', // "resources/content/issues/issue-1234.md"
            type: 'String'
        }, {
            name: 'title', // "Fix elusive bug in Grid"
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
                return isLeaf ? `<b>${id}</b> <span class="ticket-title">${title}</span>` : id
            }
        }]
    }
}

export default Neo.setupClass(Ticket);
