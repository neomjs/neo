import TreeModel from '../../data/TreeModel.mjs';

/**
 * @summary One app of a web desktop, or a group of apps, in its apps tree (`Neo.desktop.store.Apps`).
 *
 * A group is a node with `isLeaf: false`, and an app names its group as `parentId`. The fields are the ones a
 * launcher, a start menu and a taskbar read. A consumer subclasses the model for its own fields, a permission key for
 * instance, and the apps store's filter decides from them.
 * @class Neo.desktop.model.App
 * @extends Neo.data.TreeModel
 */
class App extends TreeModel {
    static config = {
        /**
         * @member {String} className='Neo.desktop.model.App'
         * @protected
         */
        className: 'Neo.desktop.model.App',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            // The app's color: its icon's background in the launcher
            name: 'color',
            type: 'String'
        }, {
            name: 'description',
            type: 'String'
        }, {
            // A start menu (`Neo.menu.List`) calls the method of this name for a chosen app. An app's reaches up the
            // component chain to the `Neo.desktop.Container` that owns the menu; a group opens its submenu instead.
            name     : 'handler',
            type     : 'String',
            calculate: data => data.isLeaf === false ? null : 'up.onStartMenuAppChoose'
        }, {
            name: 'iconCls',
            type: 'String'
        }, {
            name: 'id',
            type: 'String'
        }, {
            // `Neo.list.Base` renders a header row for records flagged this way (`useHeaders`)
            name     : 'isHeader',
            type     : 'Boolean',
            calculate: data => data.isLeaf === false
        }, {
            // The place among its siblings: the apps store sorts by it, and a launcher's drag writes it
            name: 'order',
            type: 'Number'
        }, {
            name: 'text',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(App);
