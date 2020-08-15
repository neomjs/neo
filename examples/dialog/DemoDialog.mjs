import Dialog from '../../src/container/Dialog.mjs';

/**
 * @class Window.DemoDialog
 * @extends Neo.container.Dialog
 */
class DemoDialog extends Dialog {
    static getConfig() {return {
        className: 'Dialog.DemoWindow',
        height   : 500,
        width    : 500
    }}
}

Neo.applyClassConfig(DemoDialog);

export {DemoDialog as default};