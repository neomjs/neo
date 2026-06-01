import Model from '../../../src/data/Model.mjs';

/**
 * @class Portal.model.Discussion
 * @extends Neo.data.Model
 */
class Discussion extends Model {
    static config = {
        /**
         * @member {String} className='Portal.model.Discussion'
         * @protected
         */
        className: 'Portal.model.Discussion',
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
            name: 'path',
            type: 'String'
        }, {
            name: 'title',
            type: 'String'
        }, {
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
                return isLeaf ? `<b>${id}</b> <span class="discussion-title">${title}</span>` : (title || id)
            }
        }]
    }
}

export default Neo.setupClass(Discussion);
