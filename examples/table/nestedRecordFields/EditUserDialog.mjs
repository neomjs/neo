import CheckBox     from '../../../src/form/field/CheckBox.mjs';
import CountryField from '../../../src/form/field/Country.mjs';
import Dialog       from '../../../src/dialog/Base.mjs';
import TextField    from '../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.table.nestedRecordFields.EditUserDialog
 * @extends Neo.dialog.Base
 */
class EditUserDialog extends Dialog {
    static config = {
        /**
         * @member {String} className='Neo.examples.table.nestedRecordFields.EditUserDialog'
         * @protected
         */
        className: 'Neo.examples.table.nestedRecordFields.EditUserDialog',
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
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            flex      : 'none',
            labelWidth: 110
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : TextField,
            labelText: 'Firstname',
            listeners: {change: 'up.onFirstnameFieldChange'},
            reference: 'firstname-field'
        }, {
            module   : TextField,
            labelText: 'Lastname',
            listeners: {change: 'up.onLastnameFieldChange'},
            reference: 'lastname-field'
        }, {
            module    : CountryField,
            bind      : {store: 'stores.countries'},
            labelText : 'Country',
            listeners : {change: 'up.onCountryFieldChange'},
            reference : 'country-field',
            valueField: 'code'
        }, {
            module   : CheckBox,
            labelText: 'Selected',
            listeners: {change: 'up.onSelectedFieldChange'},
            reference: 'selected-field',
            style    : {marginTop: '1em'}
        }]
    }

    /**
     * Triggered after the record config got changed
     * @param {Record|null} value
     * @param {Record|null} oldValue
     * @protected
     */
    async afterSetRecord(value, oldValue) {
        if (value) {
            let me       = this,
                {record} = me;

            // ensure the store has its data
            await me.timeout(20);

            me.getItem('country-field')  .value   = record.country;
            me.getItem('firstname-field').value   = record['user.firstname'];
            me.getItem('lastname-field') .value   = record['user.lastname'];
            me.getItem('selected-field') .checked = record['annotations.selected'];
        }
    }

    /**
     * @param {Object} data
     */
    onCountryFieldChange(data) {
        this.record.country = data.value.code
    }

    /**
     * @param {Object} data
     */
    onFirstnameFieldChange(data) {
        this.record['user.firstname'] = data.value
    }

    /**
     * @param {Object} data
     */
    onLastnameFieldChange(data) {
        this.record['user.lastname'] = data.value
    }

    /**
     * @param {Object} data
     */
    onSelectedFieldChange(data) {
        let me    = this,
            store = me.getStateProvider().getStore('mainStore');

        if (data.value === false) {
            me.record['annotations.selected'] = false
        } else {
            // Assuming we want to support a single row selection
            store.items.forEach(record => {
                record['annotations.selected'] = record === me.record ? data.value : false
            })
        }
    }
}

export default Neo.setupClass(EditUserDialog);
