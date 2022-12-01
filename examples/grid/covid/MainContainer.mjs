import GridContainer from './GridContainer.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.grid.covid.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.grid.covid.MainContainer'
         * @protected
         */
        className: 'Neo.examples.grid.covid.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {Object[]} items=[GridContainer]
         */
        items: [GridContainer],
        /**
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'fit'},
        /**
         * @member {Object} style={padding:'20px'}
         */
        style: {padding: '20px'}
    }}
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
