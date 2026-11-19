import BreadcrumbToolbar       from '../../../../src/toolbar/Breadcrumb.mjs';
import Container               from '../../../../src/container/Base.mjs';
import Label                   from '../../../../src/component/Label.mjs';
import MainContainerController from './MainContainerController.mjs';
import Viewport                from '../../../../src/container/Viewport.mjs';
import folders                 from './folders.mjs';

/**
 * @summary A breadcrumb over a real hierarchy, the engine repository's folders. The page shows the current folder's
 * description and its subfolders: a subfolder goes one level down, a crumb goes back up, and the hash route holds
 * the place across a reload.
 * @class Neo.examples.toolbar.breadcrumb.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.toolbar.breadcrumb.view.MainContainer'
         * @protected
         */
        className: 'Neo.examples.toolbar.breadcrumb.view.MainContainer',
        /**
         * @member {String[]} cls=['neo-breadcrumb-folders']
         */
        cls: ['neo-breadcrumb-folders'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: MainContainerController,
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : BreadcrumbToolbar,
            activeKey: 4,
            flex     : 'none',
            reference: 'breadcrumb-toolbar',
            store    : {data: folders.map(({id, name, parentId, route}) => ({id, name, parentId, route}))}
        }, {
            module   : Label,
            cls      : ['neo-breadcrumb-folders-name'],
            reference: 'folder-name',
            text     : ''
        }, {
            module   : Label,
            cls      : ['neo-breadcrumb-folders-description'],
            reference: 'folder-description',
            text     : ''
        }, {
            module   : Container,
            cls      : ['neo-breadcrumb-folders-children'],
            flex     : 'none',
            layout   : {ntype: 'hbox', align: 'start', wrap: 'wrap'},
            reference: 'subfolders'
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }
}

export default Neo.setupClass(MainContainer);
