import ComposeDialog from './ComposeDialog.mjs';
import Controller    from '../../../src/controller/Component.mjs';

/**
 * @summary Connects user actions to the inbox, retained reader and one live draft.
 * @class Email.view.WorkspaceController
 * @extends Neo.controller.Component
 */
class WorkspaceController extends Controller {
    static config = {
        /** @member {String} className='Email.view.WorkspaceController' */
        className: 'Email.view.WorkspaceController'
    }

    /** @member {Set<String>} #opening */
    #opening = new Set()

    /**
     * @summary Captures stable references before hosts leave the source component tree.
     */
    onComponentConstructed() {
        const me = this;

        ['detail', 'detailPopout', 'reader', 'inbox', 'composeButton'].forEach(name => me.getReference(name));
        me.getReference('composeButton').handler = () => me.onCompose();
        me.getReference('detailPopout').handler = () => me.openInWindow('detail');
        me.getReference('inbox').view.selectionModel.on({selectionChange: me.onSelectionChange, scope: me})
    }

    /**
     * @summary Shows the existing draft or focuses its popup without navigating it again.
     * @returns {Promise<void>}
     */
    async onCompose() {
        const me = this;

        if (me.isDestroyed || me.#opening.has('compose') || me.#opening.has('showCompose')) {
            return
        }

        if (me.component.detachedItems.has('compose')) {
            await Neo.Main.windowFocus({windowName: 'compose', windowId: me.component.windowId});
            return
        }

        me.#opening.add('showCompose');

        try {
            let compose = me.getReference('compose');

            if (!compose) {
                compose = me.component.add({module: ComposeDialog});
                me.getReference('compose');
                me.getReference('draft');
                compose.on({headerAction: me.onComposeAction, scope: me});
                await me.component.promiseUpdate()
            } else if (!compose.mounted) {
                compose.hidden = false;
                await compose.mountedPromise
            }
        } finally {
            me.#opening.delete('showCompose')
        }
    }

    /**
     * @summary Leaves maximize/hide to Dialog and handles only the app's pop-out action.
     * @param {Object} data
     * @param {String} data.action
     */
    onComposeAction({action}) {
        if (action === 'popout') {
            this.openInWindow('compose')
        }
    }

    /**
     * @summary Updates the provider travelling with the reader, including while detached.
     * @param {Object} data
     * @param {Email.model.Email[]} data.records
     */
    onSelectionChange({records}) {
        this.getReference('detail').stateProvider.setData('email', records[0] || null)
    }

    /**
     * @summary Admits one popup per host. Reopening a detached named popup would reload its draft.
     * @param {String} name The detail or compose reference.
     * @returns {Promise<Boolean>} Whether this activation admitted a new popup.
     */
    async openInWindow(name) {
        const me        = this;
        const dashboard = me.component;
        const widget    = me.getReference(name);
        const opening   = me.#opening;

        if (me.isDestroyed || dashboard.isDestroyed || !widget || widget.isDestroyed ||
            opening.has(name) || dashboard.detachedItems.has(name) || widget.parent !== dashboard ||
            (name === 'detail' && !widget.stateProvider.getData('email'))) {
            return false
        }

        opening.add(name);
        me.syncWindowControls();

        try {
            const rect = await widget.getDomRect();

            if (me.isDestroyed || dashboard.isDestroyed || widget.isDestroyed ||
                widget.parent !== dashboard || dashboard.detachedItems.has(name)) {
                return false
            }

            return !!await dashboard.openWidgetInPopup(widget, rect)
        } finally {
            opening.delete(name);

            if (!me.isDestroyed) {
                me.syncWindowControls()
            }
        }
    }

    /**
     * @summary Native popup chrome closes the window; source controls cannot hide its only draft.
     */
    syncWindowControls() {
        const me      = this;
        const compose = me.getReference('compose');
        me.getReference('detailPopout').hidden = me.getReference('detail').windowId !== me.component.windowId ||
            me.component.detachedItems.has('detail') || me.#opening.has('detail');

        if (!compose) {
            return
        }

        const detached = compose.windowId !== me.component.windowId ||
            me.component.detachedItems.has('compose') || me.#opening.has('compose');
        compose.keys = detached ? {} : {Escape: 'onKeyDownEscape'};
        compose.headerToolbar.items.forEach(item => {
            if (item.action) {
                item.hidden = detached
            }
        })
    }
}

export default Neo.setupClass(WorkspaceController);
