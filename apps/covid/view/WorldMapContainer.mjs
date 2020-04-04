import {default as Container}   from '../../../src/container/Base.mjs';

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
         * @member {Object} layout={ntype: 'hbox', align: 'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Array} items
         */
        items: []
    }}
}

Neo.applyClassConfig(WorldMapContainer);

export {WorldMapContainer as default};