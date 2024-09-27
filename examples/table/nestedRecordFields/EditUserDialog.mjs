import Dialog    from '../../../src/dialog/Base.mjs';
import TextField from '../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.table.nestedRecordFields.EditUserDialog
 * @extends Neo.dialog.Base
 */
class EditUserDialog extends Dialog {
    static config = {
        /**
         * @member {String} className='Neo.examples.model.dialog.EditUserDialog'
         * @protected
         */
        className: 'Neo.examples.model.dialog.EditUserDialog',
        /**
         * @member {String} closeAction='hide'
         */
        closeAction: 'hide',
        /**
         * @member {Object} containerConfig={style:{padding:'1em'}}
         */
        containerConfig: {
            style: {
                padding: '1em'
            }
        },
        /**
         * @member {Boolean} modal=true
         */
        modal: true,
        /**
         * @member {Record|null} record_=null
         */
        record_: null,
        /**
         * @member {String} title='Edit User'
         */
        title: 'Edit User',
        /**
         * @member {Object[]} items
         */
        items: [{
            module    : TextField,
            flex      : 'none',
            labelText : 'Firstname:',
            labelWidth: 110,
            listeners : {change: 'up.onFirstnameTextFieldChange'},
            reference : 'firstname-field'
        }, {
            module    : TextField,
            flex      : 'none',
            labelText : 'Lastname:',
            labelWidth: 110,
            listeners : {change: 'up.onLastnameTextFieldChange'},
            reference : 'lastname-field'
        }]
    }

    /**
     * Triggered after the record config got changed
     * @param {Record|null} value
     * @param {Record|null} oldValue
     * @protected
     */
    afterSetRecord(value, oldValue) {
        if (value) {
            let me = this;

            me.getItem('firstname-field').value = me.record.user.firstname;
            me.getItem('lastname-field') .value = me.record.user.lastname
        }
    }

    /**
     * @param {Object} data
     */
    onFirstnameTextFieldChange(data) {
        this.record.user.firstname = data.value
    }

    /**
     * @param {Object} data
     */
    onLastnameTextFieldChange(data) {
        this.record.user.lastname = data.value
    }
}

export default Neo.setupClass(EditUserDialog);
