import Dialog                   from '../../../src/dialog/Base.mjs';
import EditUserDialogController from './EditUserDialogController.mjs';
import TextField                from '../../../src/form/field/Text.mjs';

/**
<<<<<<<< HEAD:examples/stateProvider/dialog/EditUserDialog.mjs
 * @class Neo.examples.stateProvider.dialog.EditUserDialog
========
 * @class Neo.examples.stateProvider.multiWindow.EditUserDialog
>>>>>>>> dev:examples/stateProvider/multiWindow/EditUserDialog.mjs
 * @extends Neo.dialog.Base
 */
class EditUserDialog extends Dialog {
    static config = {
        /**
<<<<<<<< HEAD:examples/stateProvider/dialog/EditUserDialog.mjs
         * @member {String} className='Neo.examples.stateProvider.dialog.EditUserDialog'
         * @protected
         */
        className: 'Neo.examples.stateProvider.dialog.EditUserDialog',
========
         * @member {String} className='Neo.examples.stateProvider.multiWindow.EditUserDialog'
         * @protected
         */
        className: 'Neo.examples.stateProvider.multiWindow.EditUserDialog',
>>>>>>>> dev:examples/stateProvider/multiWindow/EditUserDialog.mjs
        /**
         * @member {Object} containerConfig={style:{padding:'1em'}}
         */
        containerConfig: {
            style: {
                padding: '1em'
            }
        },
        /**
         * @member {Neo.controller.Component} controller=EditUserDialogController
         */
        controller: EditUserDialogController,
        /**
         * @member {String} title='Edit User'
         */
        title: 'Edit User',
        /**
         * @member {Object[]} items
         */
        items: [{
            module    : TextField,
            bind      : {value: data => data.user.firstname},
            flex      : 'none',
            labelText : 'Firstname:',
            labelWidth: 110,
            listeners : {change: 'onFirstnameTextFieldChange'}
        }, {
            module    : TextField,
            bind      : {value: data => data.user.lastname},
            flex      : 'none',
            labelText : 'Lastname:',
            labelWidth: 110,
            listeners : {change: 'onLastnameTextFieldChange'}
        }]
    }
}

export default Neo.setupClass(EditUserDialog);
