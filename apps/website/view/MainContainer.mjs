import BlogContainer             from './blog/Container.mjs';
import {default as Component}    from '../../../src/component/Base.mjs';
import {default as ExamplesList} from './examples/List.mjs';
import ExamplesTabContainer      from './examples/TabContainer.mjs';
import HeaderContainer           from './HeaderContainer.mjs';
import HomeTabContainer          from './home/TabContainer.mjs';
import MainContainerController   from './MainContainerController.mjs';
import {default as TabContainer} from '../../../src/tab/Container.mjs';
import Viewport                  from '../../../src/container/Viewport.mjs';

/**
 * @class Website.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        /**
         * @member {String} className='Website.view.MainContainer'
         * @protected
         */
        className: 'Website.view.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Array} items
         */
        items: [{
            module   : HeaderContainer,
            reference: 'header-container'
        }, {
            module     : TabContainer,
            activeIndex: 2, // todo: remove, just for development
            flex       : 1,
            style      : {margin: '10px'},

            items: [{
                module         : HomeTabContainer,
                tabButtonConfig: {
                    iconCls: 'fa fa-home',
                    route  : 'mainview=home',
                    text   : 'Home'
                }
            }, {
                module         : BlogContainer,
                tabButtonConfig: {
                    iconCls: 'fa fa-rss',
                    route  : 'mainview=blog',
                    text   : 'Blog'
                }
            }, {
                module         : ExamplesTabContainer,
                tabButtonConfig: {
                    iconCls: 'fa fa-images',
                    route  : 'mainview=examples',
                    text   : 'Examples'
                }
            }, {
                module         : ExamplesList,
                reference      : 'docs-list',
                storeUrl       : '../../apps/website/data/docs.json',
                tabButtonConfig: {
                    iconCls: 'fa fa-hands-helping',
                    route  : 'mainview=docs',
                    text   : 'Docs'
                }
            }]
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};