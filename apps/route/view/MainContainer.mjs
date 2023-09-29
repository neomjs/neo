import Component               from '../../../src/component/Base.mjs';
import MainContainerController from './MainContainerController.mjs';
import TabContainer            from '../../../src/tab/Container.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class Route.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Route.view.MainContainer'
         * @protected
         */
        className: 'Route.view.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object[]} items
         */
        items: [{
            module: TabContainer,
            height: 300,
            width : 500,
            style : {flex: 'none', margin: '20px'},

            itemDefaults: {
                module: Component,
                cls   : ['neo-examples-tab-component'],
                style : {padding: '20px'},
            },

            items: [{
                tabButtonConfig: {
                    iconCls: 'fa fa-home',
                    text   : 'Tab 1'
                },
                vdom: {innerHTML: 'Welcome to your new Neo App.'}
            }, {
                tabButtonConfig: {
                    iconCls: 'fa fa-play-circle',
                    text   : 'Tab 2'
                },
                vdom: {innerHTML: 'Have fun creating something awesome!'}
            },{
                tabButtonConfig: {
                    iconCls: 'fa fa-play-circle',
                    text   : 'Tab 3'
                },
                vdom: {innerHTML: 'Have fun creating something awesome!'}
            }]
        }],
        /*
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'fit'}
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;