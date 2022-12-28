import Button                  from '../../../../src/button/Base.mjs';
import GoogleMapsComponent     from '../../../../src/component/wrapper/GoogleMaps.mjs';
import MainContainerController from './MainContainerController.mjs';
import NumberField             from '../../../../src/form/field/Number.mjs';
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
            reference: 'google-maps-component',

            markerStoreConfig: {
                data: [{
                    id      : '1',
                    position: {lat: -34.397, lng: 150.644},
                    title   : 'Hello neo'
                }]
            }
        }, {
            module: Toolbar,
            flex  : 'none',
            style : {margin: '20px'},
            items : [{
                module : Button,
                handler: 'onFlyToButtonClick',
                height : 27,
                iconCls: 'fa-solid fa-plane',
                text   : 'Fly to San Fran'
            }, {
                module              : NumberField,
                clearToOriginalValue: true,
                labelPosition       : 'inline',
                labelText           : 'zoom',
                listeners           : {change: 'onZoomFieldChange'},
                minValue            : 0,
                maxValue            : 10,
                style               : {marginLeft: '10px'},
                value               : 8,
                width               : 100
            }, {
                module : Button,
                handler: 'onRemoveMarkerButtonClick',
                height : 27,
                iconCls: 'fa-solid fa-trash',
                mode   : 'hide',
                style  : {marginLeft: '10px'},
                text   : 'Hide marker'
            }]
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
