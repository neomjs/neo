import Viewport from '../../src/container/Viewport.mjs';

/**
 * @class Covid2.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'Covid2.MainContainer',
        ntype    : 'main-container',

        autoMount: true,
        layout   : {ntype: 'fit'}
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};