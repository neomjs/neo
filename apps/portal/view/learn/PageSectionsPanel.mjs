import Container        from '../../../../src/container/Base.mjs';
import PageSectionsList from './PageSectionsList.mjs';

/**
 * @class Portal.view.learn.PageSectionsPanel
 * @extends Neo.container.Base
 */
class PageSectionsPanel extends Container {
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
         * @member {Object[]} items
         */
        items: [{
            vdom:
                {cn: [
                        {tag: 'h3', html: 'On this page'}
                    ]}

        }, {
            module   : PageSectionsList,
            reference: 'list'
        }],
        /**
         * @member {Object} layout={ntype:'vbox'}
         */
        layout: {
            ntype: 'vbox'
        }
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
