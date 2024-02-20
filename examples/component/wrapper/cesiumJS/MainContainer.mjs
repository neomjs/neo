import Button                  from '../../../../src/button/Base.mjs';
import CesiumJSComponent       from '../../../../src/component/wrapper/CesiumJS.mjs';
import MainContainerController from './MainContainerController.mjs';
import Toolbar                 from '../../../../src/toolbar/Base.mjs';
import Viewport                from '../../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.component.wrapper.cesiumJS.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        className : 'Neo.examples.component.wrapper.cesiumJS.MainContainer',
        autoMount : true,
        controller: MainContainerController,
        layout    : {ntype: 'vbox', align: 'stretch'},

        items: [{
            module   : CesiumJSComponent,
            flex     : 1,
            reference: 'cesium-component'
        }, {
            module: Toolbar,
            flex  : 'none',
            style : {margin: '20px'},
            items : [{
                module : Button,
                handler: 'onFlyToButtonClick',
                iconCls: 'fa-solid fa-plane',
                text   : 'Fly to San Fran'
            }]
        }]
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
