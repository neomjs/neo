import Button   from '../../src/button/Base.mjs';
import ComboBox from '../../src/form/field/ComboBox.mjs';
import Dialog   from '../../src/dialog/Base.mjs';
import Text     from '../../src/form/field/Text.mjs';
import Toolbar  from '../../src/toolbar/Base.mjs';

/**
 * @summary Edits a contact in an independent draft until Save writes it back to the list's Store.
 * @class Neo.examples.dialog.DemoDialog
 * @extends Neo.dialog.Base
 */
class DemoDialog extends Dialog {
    static config = {
        className              : 'Neo.examples.dialog.DemoDialog',
        animated_              : true,
        cls                    : ['neo-dialog-contact-editor'],
        containerConfig        : {cls: ['neo-dialog-contact-fields'], layout: {ntype: 'vbox', align: 'stretch', gap: '0.75em'}},
        modal                  : true,
        optionalAnimateTargetId: null,
        record                 : null
    }

    dialog = null;

    /**
     * @summary Builds the contact draft and action row.
     * @param {Object} config
     */
    construct(config) {
        const {record} = config,
              width    = 'min(34rem, calc(100vw - 2rem))';

        super.construct({
            ...config,
            title       : `Edit ${record.name}`,
            wrapperStyle: config.animated
                ? {width}
                : {width, left: '50%', top: '50%', transform: 'translate(-50%, -50%)'}
        });

        this.items = [{
            module       : Text,
            reference    : 'contactName',
            name         : 'name',
            labelText    : 'Name',
            labelPosition: 'top',
            value        : record.name
        }, {
            module       : Text,
            reference    : 'contactEmail',
            name         : 'email',
            labelText    : 'Email',
            labelPosition: 'top',
            value        : record.email
        }, {
            module       : ComboBox,
            reference    : 'contactTeam',
            name         : 'team',
            labelText    : 'Team',
            labelPosition: 'top',
            value        : record.team,
            store        : {data: [
                {id: 'design', name: 'Design'},
                {id: 'engineering', name: 'Engineering'},
                {id: 'production', name: 'Production'},
                {id: 'operations', name: 'Operations'}
            ]}
        }, {
            module: Toolbar,
            cls   : ['neo-dialog-contact-actions'],
            layout: {ntype: 'hbox', align: 'center', gap: '0.5em', wrap: 'wrap'},
            items : [{
                module : Button,
                handler: 'up.createDialog',
                text   : 'Edit another contact'
            }, '->', {
                module : Button,
                handler: 'up.cancel',
                text   : 'Cancel'
            }, {
                module : Button,
                handler: 'up.save',
                text   : 'Save'
            }]
        }]
    }

    /**
     * @summary Selects the opener as the animation target when animation is enabled.
     * @param {Boolean} value
     * @protected
     */
    afterSetAnimated(value) {
        this.animateTargetId = value ? this.optionalAnimateTargetId : null;

        if (this.dialog) {
            this.dialog.animated = value
        }
    }

    /**
     * @summary Carries the scene's modal setting into an open nested editor.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetModal(value, oldValue) {
        super.afterSetModal(value, oldValue);

        if (this.dialog) {
            this.dialog.modal = value
        }
    }

    /**
     * @summary Opens a nested draft for the next contact and remembers the button that opened it.
     * @param {Object} data
     */
    createDialog(data) {
        if (this.dialog) return;

        const contacts = this.app.mainView.getReference('contactList').store,
              next     = (contacts.indexOf(this.record) + 1) % contacts.getCount();

        this.dialog = Neo.create(DemoDialog, {
            animated               : this.animated,
            appName                : this.appName,
            boundaryContainerId    : this.boundaryContainerId,
            listeners              : {close: this.onWindowClose, scope: this},
            modal                  : this.modal,
            optionalAnimateTargetId: data.component.id,
            record                 : contacts.getAt(next),
            theme                  : this.getTheme(),
            trapFocus              : true,
            windowId               : this.windowId
        })
    }

    /** @summary Commits the draft to the contact and closes the editor. */
    save() {
        this.record.set({
            name : this.getReference('contactName').value,
            email: this.getReference('contactEmail').value,
            team : this.getReference('contactTeam').value
        });

        this.closeOrHide()
    }

    /** @summary Closes without writing the draft to the contact. */
    cancel() {
        this.closeOrHide()
    }

    /** @summary Releases the closed nested editor. */
    onWindowClose() {
        this.dialog = null
    }

    /**
     * @summary Disposes any nested draft with its owning editor.
     * @param {...*} args Arguments to pass to the superclass destroy method.
     */
    destroy(...args) {
        this.dialog?.destroy(true);
        super.destroy(...args)
    }
}

export default Neo.setupClass(DemoDialog);
