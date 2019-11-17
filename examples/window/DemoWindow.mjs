import Window from '../../src/container/Window.mjs';

/**
 * @class TestApp.DemoWindow
 * @extends Neo.container.Window
 */
class DemoWindow extends Window {
    static getConfig() {return {
        className: 'TestApp.DemoWindow',
        ntype    : 'demo-window',
        height   : 500,
        width    : 500

    }}
}

Neo.applyClassConfig(DemoWindow);

export {DemoWindow as default};