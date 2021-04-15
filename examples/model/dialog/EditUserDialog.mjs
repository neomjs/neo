import Dialog    from '../../../src/dialog/Base.mjs';
import TextField from '../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.model.dialog.EditUserDialog
 * @extends Neo.dialog.Base
 */
class EditUserDialog extends Dialog {
    static getConfig() {return {
        className: 'Neo.examples.model.dialog.DemoWindow',

        items: [{
            module    : TextField,
            flex      : 'none',
            labelText : 'Firstname:',
            labelWidth: 110,
            width     : 300,

            /*bind: {
                value: '${data.user.firstname}'
            },*/

            listeners: {
                change: 'onFirstnameTextFieldChange'
            }
        }],

        wrapperStyle: {
            height: '300px',
            width : '400px'
        }
    }}
}

Neo.applyClassConfig(EditUserDialog);

export {EditUserDialog as default};