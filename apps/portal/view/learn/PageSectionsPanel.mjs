import PageSectionsList from './PageSectionsList.mjs';
import Panel            from '../../../../src/container/Panel.mjs';

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
            dock : 'top',
            items: [{
                ntype: 'label',
                text : 'On this page'
            }, '->', {
                iconCls: 'fas fa-chevron-right',
                ui     : 'secondary',
                tooltip: 'Collapse Sections'
            }]
        }],
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : PageSectionsList,
            reference: 'list'
        }]
    }

    /**
     * Convenience shortcut
     * @member {Portal.view.learn.PageSectionsList} list
     */
    get list() {
        return this.getReference('list')
    }
}

Neo.setupClass(PageSectionsPanel);

export default PageSectionsPanel;
