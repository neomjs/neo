import Viewport from '../../src/container/Viewport.mjs';

/**
 * @class SharedCovidHelix.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'SharedCovidHelix.MainContainer',

        autoMount: true,
        layout   : {ntype: 'fit'}
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};