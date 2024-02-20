import Dialog                   from '../../../src/dialog/Base.mjs';
import EditUserDialogController from './EditUserDialogController.mjs';
import TextField                from '../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.model.multiWindow.EditUserDialog
 * @extends Neo.dialog.Base
 */
class EditUserDialog extends Dialog {
    static config = {
        /**
         * @member {String} className='Neo.examples.model.multiWindow.EditUserDialog'
         * @protected
         */
        className: 'Neo.examples.model.multiWindow.EditUserDialog',
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
        }],
        /**
         * @member {Object} wrapperStyle={height: '300px',width : '400px'}
         */
        wrapperStyle: {
            height: '300px',
            width : '400px'
        }
    }
}

Neo.setupClass(EditUserDialog);

export default EditUserDialog;
