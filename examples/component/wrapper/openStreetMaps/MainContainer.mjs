import Button                  from '../../../../src/button/Base.mjs';
import NumberField             from '../../../../src/form/field/Number.mjs';
import Toolbar                 from '../../../../src/toolbar/Base.mjs';
import Viewport                from '../../../../src/container/Viewport.mjs';
import MapComponent            from "./MapComponent.mjs";
import MainContainerController from './MainContainerController.mjs';

/**
 * @class Neo.examples.component.wrapper.OpenStreetMaps.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        className : 'Neo.examples.component.wrapper.OpenStreetMaps.MainContainer',
        autoMount : true,
        controller: MainContainerController,
        layout    : {ntype: 'vbox', align: 'stretch'},

        items: [{
            module   : MapComponent,
            flex     : 1,
            listeners: {zoomChange: 'onMapZoomChange'},
            reference: 'openstreetmaps-component',
            height   : Viewport.height-100
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
                module : Button,
                handler: 'onFlyToIcelandButtonClick',
                height : 27,
                iconCls: 'fa-solid fa-plane',
                style  : {marginLeft: '10px'},
                text   : 'Fly to Iceland'
            }, {
                module              : NumberField, //TODO The numbered field loops around, need to see if that's configurable
                clearToOriginalValue: true,
                labelPosition       : 'inline',
                labelText           : 'zoom',
                listeners           : {change: 'onZoomFieldChange'},
                minValue            : 1, //TODO minValue and maxValue should probably be setup to match the min and max zoom levels of the map
                maxValue            : 28, 
                reference           : 'zoom-field',
                style               : {marginLeft: '10px'},
                value               : 6, //TODO use openlayers view.fit() to set the initial zoom level to a box containing Iceland
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
    }
}

export default Neo.setupClass(MainContainer);
