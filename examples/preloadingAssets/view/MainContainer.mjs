import ImageComponent          from './ImageComponent.mjs';
import MainContainerController from './MainContainerController.mjs'
import TabContainer            from '../../../src/tab/Container.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.preloadingAssets.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'Neo.examples.preloadingAssets.view.MainContainer',
        autoMount: true,
        controller: MainContainerController,
        layout   : {ntype: 'fit'},

        items: [{
            module: TabContainer,
            height: 300,
            width : 500,
            style : {flex: 'none', margin: '20px'},

            itemDefaults: {
                module: ImageComponent,
                style : {flex: 'none', padding: '20px'}
            },

            items: [{
                src: '../../../resources/examples/ai_images/000150.jpg',

                tabButtonConfig: {
                    iconCls: 'fa fa-user-astronaut',
                    text   : 'Bob'
                }
            }, {
                src: '../../../resources/examples/ai_images/000074.jpg',

                tabButtonConfig: {
                    iconCls: 'fa fa-user-ninja',
                    text   : 'Alice'
                }
            }],

            listeners: {
                activeIndexChange: 'onActiveIndexChange',
                mounted: 'onMounted'
            }
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
