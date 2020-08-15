import Window from '../../src/container/Window.mjs';

/**
 * @class Window.DemoWindow
 * @extends Neo.container.Window
 */
class DemoWindow extends Window {
    static getConfig() {return {
        className: 'Window.DemoWindow',
        height   : 500,
        width    : 500
    }}
}

Neo.applyClassConfig(DemoWindow);

export {DemoWindow as default};