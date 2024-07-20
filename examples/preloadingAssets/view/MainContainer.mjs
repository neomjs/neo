import Component               from '../../../src/component/Base.mjs';
import MainContainerController from './MainContainerController.mjs'
import TabContainer            from '../../../src/tab/Container.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.preloadingAssets.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.preloadingAssets.view.MainContainer'
         * @protected
         */
        className: 'Neo.examples.preloadingAssets.view.MainContainer',
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'fit'},
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
                style : {flex: 'none', padding: '20px'}
            },

            items: [{
                tabButtonConfig: {
                    iconCls: 'fa fa-user-astronaut',
                    text   : 'Bob'
                },

                vdom: {
                    tag: 'img',
                    src: 'https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/examples/ai_images/000150.jpg'
                }
            }, {
                tabButtonConfig: {
                    iconCls: 'fa fa-user-ninja',
                    text   : 'Alice'
                },

                vdom: {
                    tag: 'img',
                    src: 'https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/examples/ai_images/000074.jpg'
                }
            }],
            /**
             * @member {Object} listeners
             */
            listeners: {
                activeIndexChange: 'onActiveIndexChange',
                mounted          : 'onMounted'
            }
        }]
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
