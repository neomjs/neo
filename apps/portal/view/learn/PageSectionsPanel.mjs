import List  from '../../../../src/list/Base.mjs';
import Panel from '../../../../src/container/Panel.mjs';

/**
 * @class Portal.view.learn.PageSectionsPanel
 * @extends Neo.container.Panel
 */
class PageSectionsPanel extends Panel {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.PageSectionsPanel'
         * @protected
         */
        className: 'Portal.view.learn.PageSectionsPanel',
        /**
         * @member {String[]} cls=['portal-page-sections-panel']
         */
        cls: ['portal-page-sections-panel'],
        /**
         * @member {Object[]} headers
         */
        headers: [{
            dock: 'top',
            text: 'On this page'
        }],
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : List,
            bind     : {store: 'stores.contentSections'},
            cls      : ['topics-tree'],
            reference: 'list'
        }]
    }

    /**
     * Internal flag to indicate that node.scrollIntoView() is running with an animation
     * @member {Boolean} isAnimating=false
     */
    isAnimating = false

    /**
     * Convenience shortcut
     * @member {Neo.list.Base} list
     */
    get list() {
        return this.getReference('list')
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        // me.getReference('list').on('selectionChange', me.onSelectionChange, me) // todo
        me.getReference('list').on('itemClick', me.onSelectionChange, me)
    }

    /**
     * @param {Object} data
     */
    async onSelectionChange(data) {
        let me     = this,
            record = data.record;

        if (record) {
            me.isAnimating = true;

            await Neo.main.DomAccess.scrollIntoView({
                querySelector: `[data-record-id='${record.id}']`,
                windowId     : me.windowId
            });

            // better safe than sorry
            await me.timeout(200);

            me.isAnimating = false
        }
    }
}

Neo.setupClass(PageSectionsPanel);

export default PageSectionsPanel;
