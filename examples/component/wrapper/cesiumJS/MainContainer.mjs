import Button            from '../../../../src/button/Base.mjs';
import CesiumJSComponent from '../../../../src/component/wrapper/CesiumJS.mjs';
import Toolbar           from '../../../../src/container/Toolbar.mjs';
import Viewport          from '../../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.component.wrapper.cesiumJS.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className : 'Neo.examples.component.wrapper.cesiumJS.MainContainer',
        autoMount : true,
        layout    : {ntype: 'vbox', align: 'stretch'},

        items: [{
            module: CesiumJSComponent,
            flex  : 1
        }, {
            module: Toolbar,
            flex  : 'none',
            style : {margin: '20px'},
            items : [{
                module : Button,
                iconCls: 'fa-solid fa-plane',
                text   : 'Fly to'
            }]
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
