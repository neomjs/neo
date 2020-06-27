import BlogContainer             from './blog/Container.mjs';
import {default as Component}    from '../../../src/component/Base.mjs';
import ExamplesTabContainer      from './examples/TabContainer.mjs';
import HeaderContainer           from './HeaderContainer.mjs';
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
            module: HeaderContainer
        }, {
            module     : TabContainer,
            activeIndex: 1, // todo: remove, just for development
            flex       : 1,
            style      : {margin: '20px'},

            items: [{
                module: Component,
                cls   : ['neo-examples-tab-component'],
                style : {padding: '20px'},
                tabButtonConfig: {
                    iconCls: 'fa fa-home',
                    text   : 'Home'
                },
                vdom: {innerHTML: 'Amazing text to describe neo.mjs'}
            }, {
                module         : BlogContainer,
                tabButtonConfig: {
                    iconCls: 'fa fa-play-circle',
                    text   : 'Blog'
                }
            }, {
                module         : ExamplesTabContainer,
                tabButtonConfig: {
                    iconCls: 'fa fa-images',
                    text   : 'Examples'
                }
            }, {
                module: Component,
                cls   : ['neo-examples-tab-component'],
                style : {padding: '20px'},
                tabButtonConfig: {
                    iconCls: 'fa fa-table',
                    text   : 'Docs'
                },
                vdom: {innerHTML: 'Docs'}
            }]
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};