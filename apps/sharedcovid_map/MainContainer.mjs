import Viewport from '../../src/container/Viewport.mjs';

/**
 * @class CovidMap.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'CovidMap.MainContainer',

        autoMount: true,
        layout   : {ntype: 'fit'}
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};