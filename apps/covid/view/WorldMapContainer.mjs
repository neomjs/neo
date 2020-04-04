import {default as Container}   from '../../../src/container/Base.mjs';
import Toolbar                  from '../../../src/container/Toolbar.mjs';
import WorldMapComponent        from './WorldMapComponent.mjs';

/**
 * @class Covid.view.WorldMapContainer
 * @extends Neo.container.Base
 */
class WorldMapContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.WorldMapContainer'
         * @private
         */
        className: 'Covid.view.WorldMapContainer',
        /**
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Array} items
         */
        items: [{
            module: Toolbar,
            items : ['->', {
                style: {marginRight: '2px'},
                text : '<span style="color: #bbbbbb">●</span> Cases'
            }, {
                style: {marginRight: '2px'},
                text : '<span style="color: #64b5f6">●</span> Active'
            }, {
                style: {marginRight: '2px'},
                text : '<span style="color: #28ca68">●</span> Recovered'
            }, {
                text: '<span style="color: #fb6767">●</span> Deaths'
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