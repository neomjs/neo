import TreeModel from '../../../src/data/TreeModel.mjs';

/**
 * @summary One launchable app, or a group of apps, in the desktop's navigation tree.
 *
 * An app names the permission key that grants it. A group names none: the apps store's filter keeps a group exactly
 * when it keeps one of the group's apps (`Neo.data.TreeStore` ancestor preservation), so a group needs no rule of its
 * own and never shows up empty. A group that matched the filter itself would keep its whole subtree, which is why
 * groups carry no permission.
 * @class WebDesktop.model.App
 * @extends Neo.data.TreeModel
 */
class App extends TreeModel {
    static config = {
        /**
         * @member {String} className='WebDesktop.model.App'
         * @protected
         */
        className: 'WebDesktop.model.App',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'color',
            type: 'String'
        }, {
            name: 'description',
            type: 'String'
        }, {
            name: 'iconCls',
            type: 'String'
        }, {
            name: 'id',
            type: 'String'
        }, {
            // list.Base renders a header row for records flagged this way (`useHeaders`)
            name     : 'isHeader',
            type     : 'Boolean',
            calculate: data => data.isLeaf === false
        }, {
            name: 'permission',
            type: 'String'
        }, {
            name: 'text',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(App);
