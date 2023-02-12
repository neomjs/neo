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
                    {id: 1,  name: 'Home',          parentId: null, route: '/home/'},
                    {id: 2,  name: 'Accessibility', parentId: 1,    route: '/home/accessibility/'},
                    {id: 3,  name: 'Imprint',       parentId: 1,    route: '/home/imprint/'},
                    {id: 4,  name: 'News',          parentId: 1,    route: '/home/news/'},
                    {id: 5,  name: 'Forms',         parentId: null, route: '/forms/'},
                    {id: 6,  name: 'Group 1',       parentId: 5,    route: '/forms/group1/'},
                    {id: 7,  name: 'Page 1',        parentId: 6,    route: '/forms/group1/page1/'},
                    {id: 8,  name: 'Page 2',        parentId: 6,    route: '/forms/group1/page2/'},
                    {id: 9,  name: 'Group 2',       parentId: 5,    route: '/forms/group2/'},
                    {id: 10, name: 'Page 1',        parentId: 9,    route: '/forms/group2/page1/'},
                    {id: 11, name: 'Page 2',        parentId: 9,    route: '/forms/group2/page2/'},
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
            }, {
                activeKey: 5,
                text     : 'Forms'
            }, {
                activeKey: 7,
                text     : 'Group 1, Page 1'
            }, {
                activeKey: 8,
                text     : 'Group 1, Page 2'
            }, {
                activeKey: 10,
                text     : 'Group 2, Page 1'
            }, {
                activeKey: 11,
                text     : 'Group 2, Page 2'
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
