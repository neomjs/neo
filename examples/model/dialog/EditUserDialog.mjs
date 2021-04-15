import Dialog                   from '../../../src/dialog/Base.mjs';
import EditUserDialogController from './EditUserDialogController.mjs';
import TextField                from '../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.model.dialog.EditUserDialog
 * @extends Neo.dialog.Base
 */
class EditUserDialog extends Dialog {
    static getConfig() {return {
        className: 'Neo.examples.model.dialog.DemoWindow',

        containerConfig: {
            style: {
                padding: '1em'
            }
        },

        controller: EditUserDialogController,

        items: [{
            module    : TextField,
            flex      : 'none',
            labelText : 'Firstname:',
            labelWidth: 110,

            bind: {
                value: '${data.user.firstname}'
            },

            listeners: {
                change: 'onFirstnameTextFieldChange'
            }
        }, {
            module    : TextField,
            flex      : 'none',
            labelText : 'Lastname:',
            labelWidth: 110,

            bind: {
                value: '${data.user.lastname}'
            },

            listeners: {
                change: 'onLastnameTextFieldChange'
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