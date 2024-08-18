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
                    {id: 6,  name: 'Form 1',        parentId: 5,    route: '/forms/form1/'},
                    {id: 7,  name: 'Page 1',        parentId: 6,    route: '/forms/form1/page1/'},
                    {id: 8,  name: 'Page 2',        parentId: 6,    route: '/forms/form1/page2/'},
                    {id: 9,  name: 'Form 2',        parentId: 5,    route: '/forms/form2/'},
                    {id: 10, name: 'Page 1',        parentId: 9,    route: '/forms/form2/page1/'},
                    {id: 11, name: 'Page 2',        parentId: 9,    route: '/forms/form2/page2/'}
                ]
            }
        }, {
            ntype: 'label',
            style: {marginTop: '40px'},
            text : 'Navigate to'
        }, {
            ntype : 'toolbar',
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'start'},

            itemDefaults: {
                ntype  : 'button',
                handler: 'onActiveKeyButtonClick',
                style  : {marginTop: '10px'}
            },

            items: [{
                activeKey: 1,
                text     : 'Home'
            }, {
                activeKey: 2,
                style    : {marginLeft: '20px', marginTop: '10px'},
                text     : 'Accessibility'
            }, {
                activeKey: 3,
                style    : {marginLeft: '20px', marginTop: '10px'},
                text     : 'Imprint'
            }, {
                activeKey: 4,
                style    : {marginLeft: '20px', marginTop: '10px'},
                text     : 'News'
            }, {
                activeKey: 5,
                text     : 'Forms'
            }, {
                activeKey: 6,
                style    : {marginLeft: '20px', marginTop: '10px'},
                text     : 'Form 1'
            }, {
                activeKey: 7,
                style    : {marginLeft: '40px', marginTop: '10px'},
                text     : 'Page 1'
            }, {
                activeKey: 8,
                style    : {marginLeft: '40px', marginTop: '10px'},
                text     : 'Page 2'
            }, {
                activeKey: 9,
                style    : {marginLeft: '20px', marginTop: '10px'},
                text     : 'Form 2'
            }, {
                activeKey: 10,
                style    : {marginLeft: '40px', marginTop: '10px'},
                text     : 'Page 1'
            }, {
                activeKey: 11,
                style    : {marginLeft: '40px', marginTop: '10px'},
                text     : 'Page 2'
            }]
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'start'},
        /**
         * @member {Object} style={padding:'20px'}
         */
        style: {padding: '20px'}
    }
}

export default Neo.setupClass(MainContainer);
