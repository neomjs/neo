import Button                  from '../../../../src/button/Base.mjs';
import GoogleMapsComponent     from '../../../../src/component/wrapper/GoogleMaps.mjs';
import MainContainerController from './MainContainerController.mjs';
import Toolbar                 from '../../../../src/toolbar/Base.mjs';
import Viewport                from '../../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.component.wrapper.googleMaps.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className : 'Neo.examples.component.wrapper.googleMaps.MainContainer',
        autoMount : true,
        controller: MainContainerController,
        layout    : {ntype: 'vbox', align: 'stretch'},

        items: [{
            module   : GoogleMapsComponent,
            flex     : 1,
            reference: 'google-maps-component'
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
    }}
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
