import Dialog from '../../../src/dialog/Base.mjs';

/**
 * @class Window.DemoDialog
 * @extends Neo.dialog.Base
 */
class DemoDialog extends Dialog {
    static getConfig() {return {
        className: 'Dialog.DemoWindow',

        wrapperStyle: {
            height: '40%',
            width : '40%'
        }
    }}
}

Neo.applyClassConfig(DemoDialog);

export {DemoDialog as default};