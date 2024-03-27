import Container        from '../../../../src/container/Base.mjs';
import PageSectionsList from './PageSectionsList.mjs';

/**
 * @class Portal.view.learn.PageSectionsContainer
 * @extends Neo.container.Base
 */
class PageSectionsContainer extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.PageSectionsContainer'
         * @protected
         */
        className: 'Portal.view.learn.PageSectionsContainer',
        /**
         * @member {String[]} cls=['portal-page-sections-container']
         */
        cls: ['portal-page-sections-container'],
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

Neo.setupClass(PageSectionsContainer);

export default PageSectionsContainer;
