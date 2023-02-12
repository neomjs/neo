import BreadcrumbToolbar       from '../../../../src/toolbar/Breadcrumb.mjs';
import MainContainerController from './MainContainerController.mjs';
import Viewport                from '../../../../src/container/Viewport.mjs';

/**
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
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : BreadcrumbToolbar,
            activeKey: 2,
            flex     : 'none',
            reference: 'breadcrumb-toolbar',

            store: {
                data: [
                    {id: 1, name: 'Home',          parentId: null, route: '/home/'},
                    {id: 2, name: 'Accessibility', parentId: 1,    route: '/home/accessibility/'},
                    {id: 3, name: 'Imprint',       parentId: 1,    route: '/home/imprint/'},
                    {id: 4, name: 'News',          parentId: 1,    route: '/home/news/'},
                ]
            }
        }, {
            ntype: 'toolbar',
            flex : 'none',
            style: {marginTop: '30px'},

            itemDefaults: {
                ntype  : 'button',
                handler: 'onActiveKeyButtonClick',
                style  : {marginRight: '10px'}
            },

            items: [{
                activeKey: 1,
                text     : 'Home'
            }, {
                activeKey: 2,
                text     : 'Accessibility'
            }]
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object} style={padding:'20px'}
         */
        style: {padding: '20px'}
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
