import Button        from '../../src/button/Base.mjs';
import Component     from '../../src/component/Base.mjs';
import CheckBox      from '../../src/form/field/CheckBox.mjs';
import List          from '../../src/list/Base.mjs';
import ThemeSwitcher from '../../src/button/ThemeSwitcher.mjs';
import Toolbar       from '../../src/toolbar/Base.mjs';
import Viewport      from '../../src/container/Viewport.mjs';
import DemoDialog    from './DemoDialog.mjs';

/**
 * @summary Displays a contact list and opens an editor for the selected contact.
 * @class Neo.examples.dialog.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.dialog.MainContainer'
         * @protected
         */
        className: 'Neo.examples.dialog.MainContainer',
        /**
         * @member {String[]} cls
         */
        cls: ['neo-dialog-contact-scene'],
        /**
         * @member {Object} layout
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Component,
            flex  : 'none',
            vdom  : {tag: 'header', cn: [
                {tag: 'h1', text: 'Studio contacts'},
                {tag: 'p', text: 'Edit a contact, drag its title bar, or open another editor.'}
            ]}
        }, {
            module: Toolbar,
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', gap: '0.5em 1em', wrap: 'wrap'},
            items : [{
                module   : Button,
                reference: 'editorOpener',
                handler  : 'up.createDialog',
                text     : 'Edit selected contact'
            }, {
                module        : CheckBox,
                checked       : true,
                hideLabel     : true,
                hideValueLabel: false,
                listeners     : {change: 'up.onBoundaryContainerIdChange'},
                valueLabel    : 'Keep inside window'
            }, {
                module        : CheckBox,
                checked       : true,
                hideLabel     : true,
                hideValueLabel: false,
                listeners     : {change: 'up.onConfigChange'},
                targetConfig  : 'animated',
                valueLabel    : 'Animated'
            }, {
                module        : CheckBox,
                checked       : true,
                hideLabel     : true,
                hideValueLabel: false,
                listeners     : {change: 'up.onConfigChange'},
                targetConfig  : 'modal',
                valueLabel    : 'Modal'
            }, '->', {
                module: ThemeSwitcher
            }]
        }, {
            module     : List,
            reference  : 'contactList',
            cls        : ['neo-dialog-contact-list'],
            activeIndex: 0,
            store      : {
                model: {fields: [
                    {name: 'id', type: 'String'},
                    {name: 'name', type: 'String'},
                    {name: 'team', type: 'String'},
                    {name: 'email', type: 'String'}
                ]},
                data: [
                    {id: 'avery', name: 'Avery Chen', team: 'design', email: 'avery@example.com'},
                    {id: 'riley', name: 'Riley Patel', team: 'engineering', email: 'riley@example.com'},
                    {id: 'morgan', name: 'Morgan Reyes', team: 'production', email: 'morgan@example.com'},
                    {id: 'jordan', name: 'Jordan Kim', team: 'operations', email: 'jordan@example.com'}
                ]
            }
        }]
    }

    /**
     * @member {String|null} boundaryContainerId='document.body'
     */
    boundaryContainerId = 'document.body';
    /**
     * @member {Neo.examples.dialog.DemoDialog|null} dialog=null
     */
    dialog = null;
    /**
     * @member {Boolean} #landingOpened=false
     */
    #landingOpened = false;

    /**
     * @summary Opens the first editor after its real focus-return target has mounted.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (value && !this.#landingOpened) {
            this.#landingOpened = true;

            const opener = this.getReference('editorOpener');

            opener.mountedPromise.then(() => {
                if (!this.isDestroyed && this.mounted && !this.dialog) {
                    this.createDialog({component: opener})
                }
            })
        }
    }

    /**
     * @summary Applies the viewport theme to the open editors attached to the document.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTheme(value, oldValue) {
        super.afterSetTheme(value, oldValue);

        for (let editor = this.dialog; editor; editor = editor.dialog) {
            editor.theme = value
        }
    }

    /**
     * @summary Opens the selected contact's editor with the button as its focus-return target.
     * @param {Object} data
     */
    createDialog(data) {
        if (this.dialog) return;

        const list   = this.getReference('contactList'),
              itemId = list.selectionModel?.items[0],
              record = (itemId && list.store.get(list.getItemRecordId(itemId))) || list.store.getAt(0);

        this.dialog = Neo.create(DemoDialog, {
            animated               : this.down({valueLabel: 'Animated'}).checked,
            appName                : this.appName,
            boundaryContainerId    : this.boundaryContainerId,
            listeners              : {close: this.onWindowClose, scope: this},
            modal                  : this.down({valueLabel: 'Modal'}).checked,
            optionalAnimateTargetId: data.component.id,
            record,
            theme                  : this.getTheme(),
            trapFocus              : true,
            windowId               : this.windowId
        })
    }

    /**
     * @summary Centers drag confinement on the current page when selected.
     * @param {Object} opts
     */
    onBoundaryContainerIdChange(opts) {
        this.boundaryContainerId = opts.value ? 'document.body' : null;

        for (let editor = this.dialog; editor; editor = editor.dialog) {
            editor.boundaryContainerId = this.boundaryContainerId
        }
    }

    /**
     * @summary Applies the scene controls to the open editor.
     * @param {Object} opts
     */
    onConfigChange(opts) {
        if (this.dialog) {
            this.dialog[opts.component.targetConfig] = opts.value
        }
    }

    /** @summary Releases the closed top-level editor. */
    onWindowClose() {
        this.dialog = null
    }

    /**
     * @summary Tears down any editor still attached to the document.
     * @param {...*} args Arguments to pass to the superclass destroy method.
     */
    destroy(...args) {
        this.dialog?.destroy(true);
        super.destroy(...args)
    }
}

export default Neo.setupClass(MainContainer);
