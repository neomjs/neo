import Container               from '../../../src/container/Base.mjs';
import HeaderContainer         from './HeaderContainer.mjs';
import MainContainerController from './MainContainerController.mjs';
import TabContainer            from '../../../src/tab/Container.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class Website.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Website.view.MainContainer'
         * @protected
         */
        className: 'Website.view.MainContainer',
        /**
         * @member {String[]} baseCls=['website-main-container','neo-viewport']
         */
        baseCls: ['website-main-container', 'neo-viewport'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object} layout={ntype: 'hbox',align: 'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Array} items
         */
        items: [{
            module: Container,
            cls   : ['website-center-region'],
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module   : HeaderContainer,
                flex     : 'none',
                reference: 'header-container'
            }, {
                module     : TabContainer,
                activeIndex: null, // render no items initially
                cls        : ['website-main-tabcontainer', 'neo-tab-container'],
                flex       : 1,
                reference  : 'main-tab-container',
                sortable   : true,

                items: [{
                    module         : () => import('./home/TabContainer.mjs'),
                    reference      : 'home',
                    tabButtonConfig: {
                        editRoute: false,
                        iconCls  : 'fa fa-home',
                        route    : 'mainview=home',
                        text     : 'Home'
                    }
                }, {
                    module         : () => import('./blog/Container.mjs'),
                    reference      : 'blog',
                    tabButtonConfig: {
                        editRoute: false,
                        iconCls  : 'fa fa-rss',
                        reference: 'blog-header-button',
                        route    : 'mainview=blog',
                        text     : 'Blog'
                    }
                }, {
                    module         : () => import('./examples/TabContainer.mjs'),
                    reference      : 'examples',
                    tabButtonConfig: {
                        editRoute: false,
                        iconCls  : 'fa fa-images',
                        route    : 'mainview=examples',
                        text     : 'Examples'
                    }
                }, {
                    module         : () => import('./examples/List.mjs'),
                    reference      : 'docs',
                    storeUrl       : '../../apps/website/data/docs.json',
                    tabButtonConfig: {
                        editRoute: false,
                        iconCls  : 'fa fa-hands-helping',
                        route    : 'mainview=docs',
                        text     : 'Docs'
                    }
                }]
            }]
        }]
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
