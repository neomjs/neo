import Viewport from '../../src/container/Viewport.mjs';

/**
 * @class CovidMap.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        /**
         * @member {String} className='CovidMap.MainContainer'
         * @protected
         */
        className: 'SharedCovidMap.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'fit'}
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};