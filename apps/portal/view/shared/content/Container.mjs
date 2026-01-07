import Container         from '../../../../../src/container/Base.mjs';
import PageContainer     from './PageContainer.mjs';
import SectionsContainer from './SectionsContainer.mjs';
import Splitter          from '../../../../../src/component/Splitter.mjs';
import TreeList          from './TreeList.mjs';

/**
 * @class Portal.view.shared.content.Container
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.shared.content.Container'
         * @protected
         */
        className: 'Portal.view.shared.content.Container',
        /**
         * @member {String[]} cls=['portal-shared-content-container']
         * @reactive
         */
        cls: ['portal-shared-content-container'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : Container,
            cls      : ['sidenav-container'],
            flex     : 'none',
            layout   : 'fit',
            reference: 'sidenav-container',
            tag      : 'aside',

            items: [{
                module   : TreeList,
                reference: 'tree'
            }, {
                ntype  : 'button',
                bind   : {hidden: data => data.size !== 'x-small'},
                cls    : ['sidenav-button'],
                handler: 'onSideNavToggleButtonClick',
                iconCls: 'fas fa-bars',
                ui     : 'secondary'
            }]
        }, {
            module      : Splitter,
            bind        : {hidden: data => data.size === 'x-small'},
            cls         : ['main-content-splitter'],
            resizeTarget: 'previous',
            size        : 3
        }, {
            module: PageContainer
        }, {
            module   : SectionsContainer,
            reference: 'page-sections-container'
        }],
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'stretch'}
    }
}

export default Neo.setupClass(MainContainer);
