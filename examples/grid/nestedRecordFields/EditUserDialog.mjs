import Button       from '../../../src/button/Base.mjs';
import CheckBox     from '../../../src/form/field/CheckBox.mjs';
import CountryField from '../../../src/form/field/Country.mjs';
import DateField    from '../../../src/form/field/Date.mjs';
import Dialog       from '../../../src/dialog/Base.mjs';
import TextField    from '../../../src/form/field/Text.mjs';

/**
 * @summary Modal form dialog for editing a partner row's nested `user` and `address` fields with explicit Save/Cancel
 * commit semantics, keyboard focus trapping, and focus restoration to the triggering row button.
 * @class Neo.examples.grid.nestedRecordFields.EditUserDialog
 * @extends Neo.dialog.Base
 */
class EditUserDialog extends Dialog {
    static config = {
        className  : 'Neo.examples.grid.nestedRecordFields.EditUserDialog',
        closeAction: 'hide',
        cls        : ['neo-edit-partner-dialog'],
        keys       : {
            Enter : 'onKeyDownEnter',
            Escape: 'onKeyDownEscape'
        },
        modal    : true,
        record_  : null,
        title    : 'Edit Partner Contact',
        trapFocus: true,

        style: {
            width: 'min(420px, calc(100vw - 24px))'
        },

        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'},
            style : {padding: '16px'}
        },

        itemDefaults: {
            flex      : 'none',
            labelWidth: 108,
            width     : '100%'
        },

        items: [{
            module   : TextField,
            labelText: 'First Name',
            reference: 'firstname-field'
        }, {
            module   : TextField,
            labelText: 'Last Name',
            reference: 'lastname-field'
        }, {
            module   : TextField,
            labelText: 'City',
            reference: 'city-field'
        }, {
            module    : CountryField,
            bind      : {store: 'stores.countries'},
            labelText : 'Country',
            reference : 'country-field',
            valueField: 'code'
        }, {
            module   : TextField,
            labelText: 'Organization',
            reference: 'organization-field'
        }, {
            module   : DateField,
            labelText: 'Renewal Date',
            reference: 'date-field'
        }, {
            module   : CheckBox,
            labelText: 'Selected Row',
            reference: 'selected-field',
            style    : {marginTop: '6px'}
        }, {
            ntype : 'container',
            layout: {ntype: 'hbox', align: 'center', pack: 'end'},
            style : {gap: '8px', marginTop: '14px'},
            width : '100%',

            items: [{
                module   : Button,
                handler  : 'up.onCancelButtonClick',
                reference: 'cancel-button',
                text     : 'Cancel'
            }, {
                module   : Button,
                cls      : ['neo-dialog-save-button'],
                handler  : 'up.onSaveButtonClick',
                reference: 'save-button',
                text     : 'Save'
            }]
        }]
    }

    /**
     * Populates draft form fields whenever `record` changes without mutating the record until Save.
     * @param {Record|null} value
     * @param {Record|null} oldValue
     * @protected
     */
    async afterSetRecord(value, oldValue) {
        if (value) {
            await this.timeout(20);
            this.populateFields(value)
        }
    }

    /**
     * @summary The row's `Edit` button that opened the dialog takes focus back, ahead of the component focus came
     * from: the grid view takes focus on the way in. The engine hands it over as the dialog leaves the DOM.
     * @returns {Neo.component.Base|null}
     */
    getFocusReturnTarget() {
        return this.animateTarget || super.getFocusReturnTarget()
    }

    /**
     * Discards draft edits and hides the dialog.
     */
    onCancelButtonClick() {
        this.populateFields(this.record);
        this.closeOrHide()
    }

    /**
     * Submits the form on `Enter` inside plain text inputs while leaving buttons and picker fields (`Country`, `Date`)
     * to their own `Enter` handlers.
     * @param {Object} data
     */
    onKeyDownEnter(data) {
        let me      = this,
            pathIds = new Set((data?.path || []).map(node => node.id)),
            skipIds = [
                me.down({reference: 'cancel-button'})?.id,
                me.down({reference: 'country-field'})?.id,
                me.down({reference: 'date-field'})?.id,
                me.headerToolbar?.id
            ];

        if (skipIds.some(id => id && pathIds.has(id))) {
            return
        }

        me.onSaveButtonClick()
    }

    /**
     * Commits draft field edits back to `this.record` via `record.set(...)`, updating nested `user` and `address`
     * objects and marking changed grid cells via `trackModifiedFields`, then closes the dialog.
     */
    onSaveButtonClick() {
        let me     = this,
            record = me.record;

        if (!record) {
            return
        }

        let firstname    = me.down({reference: 'firstname-field'}).value ?? '',
            lastname     = me.down({reference: 'lastname-field'}).value ?? '',
            city         = me.down({reference: 'city-field'}).value ?? '',
            rawCountry   = me.down({reference: 'country-field'}).value,
            country      = Neo.isRecord(rawCountry) ? rawCountry.code : (rawCountry?.code || rawCountry || ''),
            organization = me.down({reference: 'organization-field'}).value ?? '',
            date         = me.down({reference: 'date-field'}).getSubmitValue?.() || me.down({reference: 'date-field'}).value || '',
            selected     = Boolean(me.down({reference: 'selected-field'}).checked),
            updates      = {},
            userDiff     = {},
            addressDiff  = {};

        if (firstname !== record['user.firstname']) {
            userDiff.firstname = firstname
        }
        if (lastname !== record['user.lastname']) {
            userDiff.lastname = lastname
        }
        if (Object.keys(userDiff).length > 0) {
            updates.user = {...record.user, ...userDiff}
        }

        if (city !== record['address.city']) {
            addressDiff.city = city
        }
        if (country && country !== record['address.country']) {
            addressDiff.country = country
        }
        if (Object.keys(addressDiff).length > 0) {
            updates.address = {...record.address, ...addressDiff}
        }

        if (organization !== record.organization) {
            updates.organization = organization
        }
        if (date && date !== record.date) {
            updates.date = date
        }

        if (Object.keys(updates).length > 0) {
            record.set(updates)
        }

        if (selected !== Boolean(record['annotations.selected'])) {
            let store = me.getStateProvider().getStore('mainStore');

            if (!selected) {
                record.set({annotations: {selected: false}})
            } else {
                store.forEach(item => {
                    if (Boolean(item['annotations.selected']) !== (item === record)) {
                        item.set({annotations: {selected: item === record}})
                    }
                })
            }
        }

        me.closeOrHide()
    }

    /**
     * Copies values from `record` into the form controls without writing back to the store.
     * @param {Record|null} record
     */
    populateFields(record) {
        if (!record) {
            return
        }

        let me = this;

        me.down({reference: 'firstname-field'})   .value   = record['user.firstname'];
        me.down({reference: 'lastname-field'})    .value   = record['user.lastname'];
        me.down({reference: 'city-field'})        .value   = record['address.city'];
        me.down({reference: 'country-field'})     .value   = record['address.country'];
        me.down({reference: 'organization-field'}).value   = record.organization;
        me.down({reference: 'date-field'})        .value   = record.date;
        me.down({reference: 'selected-field'})    .checked = Boolean(record['annotations.selected'])
    }

    /**
     * Restores the draft fields from the record before the dialog mounts, in case a previous open left edits
     * behind: the dialog takes focus into `First Name` as it mounts, so a later reset would erase what is typed.
     * @param {...*} args
     */
    show(...args) {
        this.populateFields(this.record);
        super.show(...args)
    }
}

export default Neo.setupClass(EditUserDialog);
