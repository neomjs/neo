import Button                  from '../../../../src/button/Base.mjs';
import NumberField             from '../../../../src/form/field/Number.mjs';
import ThemeSwitcher           from '../../../../src/button/ThemeSwitcher.mjs';
import Toolbar                 from '../../../../src/toolbar/Base.mjs';
import Viewport                from '../../../../src/container/Viewport.mjs';
import MapComponent            from "./MapComponent.mjs";
import MainContainerController from './MainContainerController.mjs';

/**
 * @class Neo.examples.component.wrapper.OpenStreetMaps.MainContainer
 * @extends Neo.container.Viewport
 * @summary OpenStreetMap wrapper demonstration with zoom controls and live theme switching.
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
            reference: 'openstreetmaps-component'
        }, {
            module: Toolbar,
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            style : {gap: '8px', padding: '10px 12px'},
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
                text   : 'Fly to Iceland'
            }, {
                module              : NumberField,
                clearToOriginalValue: true,
                labelPosition       : 'inline',
                labelText           : 'zoom',
                listeners           : {change: 'onZoomFieldChange'},
                minValue            : 1,
                maxValue            : 28,
                reference           : 'zoom-field',
                value               : 6,
                width               : 100
            }, {
                module : Button,
                handler: 'onRemoveMarkerButtonClick',
                height : 27,
                iconCls: 'fa-solid fa-trash',
                mode   : 'hide',
                text   : 'Hide marker'
            }, '->', {
                module: ThemeSwitcher
            }]
        }]
    }
}

export default Neo.setupClass(MainContainer);
