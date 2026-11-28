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
        /**
         * @member {String} className='Neo.examples.dialog.DemoDialog'
         * @protected
         */
        className: 'Neo.examples.dialog.DemoDialog',
        /**
         * Whether the editor opens and closes through its opener.
         * @member {Boolean} animated_=true
         * @reactive
         */
        animated_: true,
        /**
         * @member {String[]} cls
         */
        cls: ['neo-dialog-contact-editor'],
        /**
         * @member {Object} containerConfig
         */
        containerConfig: {cls: ['neo-dialog-contact-fields'], layout: {ntype: 'vbox', align: 'stretch', gap: '0.75em'}},
        /**
         * @member {Boolean} modal=true
         */
        modal: true,
        /**
         * The opener remains available when the scene switches animation back on.
         * @member {String|null} optionalAnimateTargetId=null
         */
        optionalAnimateTargetId: null,
        /**
         * The contact this editor writes only on Save.
         * @member {Object|null} record=null
         */
        record: null
    }

    /**
     * @member {Neo.examples.dialog.DemoDialog|null} dialog=null
     */
    dialog = null;

    /**
     * Guards the nest action while measuring the parent.
     * @member {Boolean} #openingDialog=false
     */
    #openingDialog = false;

    /**
     * @summary Builds the contact draft and docks its actions as the dialog's footer.
     * @param {Object} config
     */
    construct(config) {
        const {record} = config,
              width    = 'min(34rem, calc(100vw - 2rem))';

        super.construct({
            ...config,
            headers: [{
                module: Toolbar,
                cls   : ['neo-footer-toolbar', 'neo-toolbar'],
                dock  : 'bottom',
                layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
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
            }],
            title       : `Edit ${record.name}`,
            wrapperStyle: config.animated !== false
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
    async createDialog(data) {
        if (this.dialog || this.#openingDialog) return;

        this.#openingDialog = true;

        try {
            const style = this.maximized ? undefined : await this.getNestedPosition();

            if (!this.mounted || this.hidden || this.isDestroyed) return;

            const contacts = this.app.mainView.getReference('contactList').store,
                  next     = (contacts.indexOf(this.record) + 1) % contacts.getCount();

            this.dialog = Neo.create(DemoDialog, {
                animated               : this.animated,
                appName                : this.appName,
                boundaryContainerId    : this.boundaryContainerId,
                keepInBoundary         : true,
                listeners              : {close: this.onWindowClose, scope: this},
                modal                  : this.modal,
                optionalAnimateTargetId: data.component.id,
                record                 : contacts.getAt(next),
                ...(style && {style}),
                theme    : this.getTheme(),
                trapFocus: true,
                windowId : this.windowId
            })
        } finally {
            this.#openingDialog = false
        }
    }

    /**
     * @summary Offsets a nested editor toward the available space beside the parent on each axis.
     * @returns {Promise<Object|undefined>}
     */
    async getNestedPosition() {
        const [parent, body] = await this.getDomRect([this.id, 'document.body']);

        if (!parent || !body) return;

        const shift = (position, start, end, size) => {
            const step   = 24,
                  min    = start + 8,
                  max    = Math.max(min, end - size - 8),
                  before = position - min,
                  after  = max - position,
                  target = position + (after >= step || after >= before ? step : -step);

            return `${Math.max(min, Math.min(max, target))}px`
        };

        return {
            left     : shift(parent.left, body.left, body.right, parent.width),
            top      : shift(parent.top, body.top, body.bottom, parent.height),
            transform: 'none'
        }
    }

    /** @summary Commits the draft to the contact and closes the editor. */
    save() {
        const team = this.getReference('contactTeam').value;

        this.record.set({
            name : this.getReference('contactName').value,
            email: this.getReference('contactEmail').value,
            team : Neo.isRecord(team) ? team.id : team
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
