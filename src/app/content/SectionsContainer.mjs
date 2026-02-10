import Container    from '../../container/Base.mjs';
import SectionsList from './SectionsList.mjs';

/**
 * @class Neo.app.content.SectionsContainer
 * @extends Neo.container.Base
 */
class SectionsContainer extends Container {
    static config = {
        /**
         * @member {String} className='Neo.app.content.SectionsContainer'
         * @protected
         */
        className: 'Neo.app.content.SectionsContainer',
        /**
         * @member {String[]} cls=['neo-app-content-sections-container']
         * @reactive
         */
        cls: ['neo-app-content-sections-container'],
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype  : 'button',
            cls    : ['sections-container-button'],
            handler: 'onPageSectionsToggleButtonClick',
            iconCls: 'fas fa-bars',
            ui     : 'secondary',

            bind: {
                disabled: data => data.countSections < 1,
                hidden  : data => data.size === 'large'
            }
        }, {
            vdom:
            {cn: [
                {tag: 'h3', text: 'On this page'}
            ]}
        }, {
            module   : SectionsList,
            listeners: {pageListSelect: 'up.onPageListSelect'},
            reference: 'list'
        }],
        /**
         * @member {Object} layout={ntype:'vbox'}
         * @reactive
         */
        layout: {ntype: 'vbox'},
        /**
         * @member {String} tag='aside'
         * @reactive
         */
        tag: 'aside'
    }

    /**
     * Convenience shortcut
     * @member {Neo.app.content.SectionsList} list
     */
    get list() {
        return this.getReference('list')
    }

    /**
     * @param {Object} data
     */
    onPageListSelect(data) {
        this.toggleCls('neo-expanded', false)
    }
}

export default Neo.setupClass(SectionsContainer);
