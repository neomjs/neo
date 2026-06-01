import Model from '../../../src/data/Model.mjs';

const STATE_BADGE_CONFIGS = {
    answered: {
        cls : 'neo-state-answered',
        icon: 'fa-circle-check',
        text: 'Answered'
    },
    closed: {
        cls : 'neo-state-closed',
        icon: 'fa-circle-check',
        text: 'Closed'
    },
    open: {
        cls : 'neo-state-open',
        icon: 'fa-circle-dot',
        text: 'Open'
    }
};

/**
 * @summary Renders the compact state glyph used by discussion tree leaf nodes.
 * @param {String} state
 * @returns {String}
 */
function getDiscussionStateBadgeHtml(state) {
    const config = STATE_BADGE_CONFIGS[String(state || '').toLowerCase()];

    if (!config) return '';

    return `<span class="discussion-state-badge ${config.cls}" title="${config.text}">` +
        `<i class="fa-regular ${config.icon}"></i></span>`
}

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
            name: 'state',
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
             * @param {String}  data.state
             * @param {String}  data.title
             * @returns {String}
             */
            calculate({id, isLeaf, state, title}) {
                if (isLeaf) {
                    return `<span class="discussion-tree-node">${getDiscussionStateBadgeHtml(state)}` +
                        `<b>${id}</b> <span class="discussion-title">${title}</span></span>`
                }

                return title || id
            }
        }]
    }
}

export default Neo.setupClass(Discussion);
