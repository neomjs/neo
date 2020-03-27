import {default as Viewport} from '../../src/container/Viewport.mjs';

/**
 * @class TestApp.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'TestApp.MainContainer',
        ntype    : 'main-container',

        autoMount: true,

        layout: 'fit',

        style: {
            padding: '50px'
        },

        items: [{
            ntype: 'component',
            html : 'Hello World!'
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};
