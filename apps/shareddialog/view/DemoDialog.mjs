import Dialog                 from '../../../src/dialog/Base.mjs';
import {default as TextField} from '../../../src/form/field/Text.mjs';

/**
 * @class Window.DemoDialog
 * @extends Neo.dialog.Base
 */
class DemoDialog extends Dialog {
    static getConfig() {return {
        className: 'Dialog.DemoWindow',

        containerConfig: {
            style: {
                padding: '20px'
            }
        },

        items: [{
            module   : TextField,
            flex     : 'none',
            labelText: 'Field 1'
        }, {
            module   : TextField,
            flex     : 'none',
            labelText: 'Field 2'
        }],

        wrapperStyle: {
            height: '40%',
            width : '40%'
        }
    }}
}

Neo.applyClassConfig(DemoDialog);

export {DemoDialog as default};