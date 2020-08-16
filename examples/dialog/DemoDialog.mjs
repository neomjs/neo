import Dialog from '../../src/container/Dialog.mjs';

/**
 * @class Window.DemoDialog
 * @extends Neo.container.Dialog
 */
class DemoDialog extends Dialog {
    static getConfig() {return {
        className: 'Dialog.DemoWindow',
        height   : '40%',
        width    : '40%'
    }}
}

Neo.applyClassConfig(DemoDialog);

export {DemoDialog as default};