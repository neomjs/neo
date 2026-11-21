import Controller from '../../../../src/controller/Component.mjs';
import folders    from './folders.mjs';

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
     * @param {Object|null} value The new HashHistory entry
     */
    onHashChange(value) {
        if (value?.windowId && value.windowId !== this.windowId) {
            return
        }

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
