import Controller from '../../../../src/controller/Component.mjs';
import '../../../../src/button/Split.mjs';

/**
 * @summary Loads the action definitions and connects their named handlers to the draft.
 * @class Neo.examples.toolbar.application.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='Neo.examples.toolbar.application.view.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.toolbar.application.view.MainContainerController'
    }

    /**
     * @summary Loads and adds the action configs from the example's own JSON document.
     * @returns {Promise<void>}
     */
    async loadToolbar() {
        const me      = this,
              toolbar = me.getReference('actions'),
              status  = me.getReference('status');

        try {
            const url   = new URL('resources/data/toolbar-items.json', Neo.config.url.base).href,
                  items = await toolbar.loadItems({url});

            toolbar.add(items);
            status.text = 'Toolbar ready'
        } catch (error) {
            if (error !== Neo.isDestroyed) {
                status.text = 'Could not load toolbar actions'
            }
        }
    }

    /**
     * @summary Adds a heading to the draft.
     */
    onInsertHeading() {
        this.appendToDraft('## Highlights', 'Heading inserted')
    }

    /**
     * @summary Adds a checklist item to the draft.
     */
    onInsertChecklistItem() {
        this.appendToDraft('- [ ] Confirm the release', 'Checklist item inserted')
    }

    /**
     * @summary Toggles the editor's font and reports the current choice.
     * @param {Object} data
     * @param {Neo.button.Base} data.component
     */
    onToggleMonospace({component}) {
        const me    = this,
              draft = me.getReference('draft');

        component.pressed = !component.pressed;
        draft[component.pressed ? 'addCls' : 'removeCls']('neo-toolbar-application-monospace');
        me.getReference('status').text = component.pressed ? 'Monospace on' : 'Monospace off'
    }

    /**
     * @summary Clears the draft.
     */
    onClearDraft() {
        const me = this;

        me.getReference('draft').value = '';
        me.getReference('status').text = 'Draft cleared'
    }

    /**
     * @summary Adds one line without replacing the user's draft.
     * @param {String} line The action's text.
     * @param {String} message The visible status.
     */
    appendToDraft(line, message) {
        const me    = this,
              draft = me.getReference('draft');

        draft.value = draft.value ? `${draft.value}\n${line}` : line;
        me.getReference('status').text = message
    }
}

export default Neo.setupClass(MainContainerController);
