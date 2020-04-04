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
                text: 'Cases'
            }, {
                text: 'Active'
            }, {
                text: 'Recovered'
            }, {
                text: 'Deaths'
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