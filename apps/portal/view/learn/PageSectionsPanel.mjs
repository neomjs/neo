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
    onSelectionChange(data) {
        let record = data.record;

        record && Neo.main.DomAccess.scrollIntoView({
            id      : `${record.sourceId}__section__${record.id}`,
            windowId: this.windowId
        })
    }
}

Neo.setupClass(PageSectionsPanel);

export default PageSectionsPanel;
