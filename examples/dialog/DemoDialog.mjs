import Dialog from '../../src/dialog/Base.mjs';

/**
 * @class Neo.examples.dialog.DemoDialog
 * @extends Neo.dialog.Base
 */
class DemoDialog extends Dialog {
    static config = {
        className: 'Neo.examples.dialog.DemoWindow',
        title    : 'My Dialog',

        wrapperStyle: {
            height: '40%',
            width : '40%'
        }
    }
}

Neo.applyClassConfig(DemoDialog);

export default DemoDialog;
