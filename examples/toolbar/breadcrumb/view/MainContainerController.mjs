import Controller  from '../../../../src/controller/Component.mjs';
import HashHistory from '../../../../src/util/HashHistory.mjs';
import folders     from './folders.mjs';

/**
 * @summary Shows the folder the hash route names. The breadcrumb follows the same route by itself, so a subfolder's
 * button and a crumb only set the route.
 * @class Neo.examples.toolbar.breadcrumb.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='Neo.examples.toolbar.breadcrumb.view.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.toolbar.breadcrumb.view.MainContainerController'
    }

    /**
     * Stops listening to the route.
     * @param {...*} args
     */
    destroy(...args) {
        HashHistory.un('change', this.onHashChange, this);
        super.destroy(...args)
    }

    /**
     * Listens to the route, and shows the folder of a route that arrived before this listener.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        HashHistory.on('change', me.onHashChange, me);

        me.onHashChange(HashHistory.first(me.windowId))
    }

    /**
     * @param {Object|null} value The new HashHistory entry
     */
    onHashChange(value) {
        let route = value?.hashString,
            folder;

        if (route && !route.endsWith('/')) {
            route += '/'
        }

        folder = route && folders.find(item => item.route === route);

        folder && this.showFolder(folder)
    }

    /**
     * Shows a folder's name and description, and one button per subfolder, which sets its route.
     * @param {Object} folder
     */
    showFolder(folder) {
        let me         = this,
            subfolders = me.getReference('subfolders'),
            children   = folders.filter(item => item.parentId === folder.id);

        me.getReference('folder-name').text        = folder.name;
        me.getReference('folder-description').text = folder.description;

        subfolders.removeAll();

        subfolders.add(children.length ? children.map(child => ({
            ntype  : 'button',
            iconCls: 'fa fa-folder',
            route  : child.route,
            text   : child.name
        })) : [{ntype: 'label', cls: ['neo-breadcrumb-folders-empty'], text: 'No subfolders. A crumb above goes back up.'}])
    }
}

export default Neo.setupClass(MainContainerController);
