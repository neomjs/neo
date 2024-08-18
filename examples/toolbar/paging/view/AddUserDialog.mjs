import Dialog    from '../../../../src/dialog/Base.mjs';
import TextField from '../../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.toolbar.paging.view.AddUserDialog
 * @extends Neo.dialog.Base
 */
class AddUserDialog extends Dialog {
    static config = {
        /**
         * @member {String} className='Neo.examples.toolbar.paging.view.AddUserDialog'
         * @protected
         */
        className: 'Neo.examples.toolbar.paging.view.AddUserDialog',
        /**
         * @member {Object} containerConfig={style:{padding:'1em'}}
         */
        containerConfig: {
            style: {
                padding: '1em'
            }
        },
        /**
         * @member {Object[]} headers
         */
        headers: [{
            cls  : ['neo-footer-toolbar', 'neo-toolbar'],
            dock : 'bottom',
            items: ['->', {
                text: 'Submit'
            }]
        }],
        /**
         * @member {Object[]} items
         */
        items: [{
            module    : TextField,
            flex      : 'none',
            labelText : 'Firstname:',
            labelWidth: 110
        }, {
            module    : TextField,
            flex      : 'none',
            labelText : 'Lastname:',
            labelWidth: 110
        }],
        /**
         * @member {Boolean} resizable=false
         */
        resizable: false,
        /**
         * @member {String} title='Edit User'
         */
        title: 'Add User',
        /**
         * @member {Object} wrapperStyle={height:'300px',width:'400px'}
         */
        wrapperStyle: {
            height: '300px',
            width : '400px'
        }
    }
}

export default Neo.setupClass(AddUserDialog);
