import Container                   from '../../../src/container/Base.mjs';
import NumberField                 from '../../../src/form/field/Number.mjs';
import Toolbar                     from '../../../src/container/Toolbar.mjs';
import WorldMapComponent           from './WorldMapComponent.mjs';
import WorldMapContainerController from './WorldMapContainerController.mjs';

/**
 * @class SharedCovid.view.WorldMapContainer
 * @extends Neo.container.Base
 */
class WorldMapContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='SharedCovid.view.WorldMapContainer'
         * @protected
         */
        className: 'SharedCovid.view.WorldMapContainer',
        /**
         * @member {Neo.controller.Component} controller=WorldMapContainerController
         */
        controller: WorldMapContainerController,
        /**
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Array} items
         */
        items: [{
            module: Toolbar,
            flex  : 'none',
            items : [{
                ntype    : 'label',
                reference: 'currentMapViewLabel',
                style    : {marginRight: '20px'},
                text     : 'Current view: Active'
            }, {
                module       : NumberField,
                clearToOriginalValue: true,
                labelPosition: 'inline',
                labelText    : 'HeatRule maxValue',
                maxValue     : 1e6,
                minValue     : 100,
                reference    : 'heatRuleField',
                stepSize     : 100,
                style        : {margin: 0},
                value        : 15000,
                width        : 150,

                listeners: {
                    change: 'onHeatRuleFieldChange'
                }
            }, '->', {
                handler: 'onSeriesButtonClick',
                series : 'cases',
                style  : {marginRight: '2px'},
                text   : '<span style="color: #bbbbbb">●</span> Cases'
            }, {
                handler: 'onSeriesButtonClick',
                series : 'active',
                style  : {marginRight: '2px'},
                text   : '<span style="color: #64b5f6">●</span> Active'
            }, {
                handler: 'onSeriesButtonClick',
                series : 'recovered',
                style  : {marginRight: '2px'},
                text   : '<span style="color: #28ca68">●</span> Recovered'
            }, {
                handler: 'onSeriesButtonClick',
                series : 'deaths',
                text   : '<span style="color: #fb6767">●</span> Deaths'
            }]
        }, {
            module   : WorldMapComponent,
            flex     : 1,
            reference: 'worldmap'
        }]
    }}
}

Neo.applyClassConfig(WorldMapContainer);

export {WorldMapContainer as default};