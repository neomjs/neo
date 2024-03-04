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
            module: List,
            bind  : {store: 'stores.contentSections'},
            cls   : ['topics-tree']
        }]
    }
}

Neo.setupClass(PageSectionsPanel);

export default PageSectionsPanel;
