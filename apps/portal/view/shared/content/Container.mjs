import {isDescriptor, mergeFrom} from '../../../../../src/core/ConfigSymbols.mjs';
import Container                 from '../../../../../src/container/Base.mjs';
import PageContainer             from './PageContainer.mjs';
import SectionsContainer         from './SectionsContainer.mjs';
import Splitter                  from '../../../../../src/component/Splitter.mjs';
import TreeList                  from './TreeList.mjs';

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
         * @member {String[]} baseCls=['portal-shared-content-container','neo-container']
         * @reactive
         */
        baseCls: ['portal-shared-content-container', 'neo-container'],
        /**
         * @member {Object} items
         */
        items: {
            [isDescriptor]: true,
            clone         : 'deep',
            merge         : 'deep',
            value         : {
                'sidenav-container': {
                    module   : Container,
                    cls      : ['sidenav-container'],
                    flex     : 'none',
                    layout   : 'fit',
                    reference: 'sidenav-container',
                    tag      : 'aside',
                    weight   : 10,
                    items    : {
                        tree: {
                            module     : TreeList,
                            [mergeFrom]: 'treeConfig',
                            reference  : 'tree'
                        },
                        toggleBtn: {
                            ntype  : 'button',
                            bind   : {hidden: data => data.size !== 'x-small'},
                            cls    : ['sidenav-button'],
                            handler: 'onSideNavToggleButtonClick',
                            iconCls: 'fas fa-bars',
                            ui     : 'secondary'
                        }
                    }
                },
                splitter: {
                    module      : Splitter,
                    bind        : {hidden: data => data.size === 'x-small'},
                    cls         : ['main-content-splitter'],
                    resizeTarget: 'previous',
                    size        : 3,
                    weight      : 20
                },
                pageContainer: {
                    [mergeFrom]: 'pageContainerConfig',
                    weight     : 30
                },
                'page-sections-container': {
                    module   : SectionsContainer,
                    reference: 'page-sections-container',
                    weight   : 40
                }
            }
        },
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * Configuration for the PageContainer item.
         * Subclasses override this to swap the module or configure the content.
         * @member {Object} pageContainerConfig_
         * @reactive
         */
        pageContainerConfig_: {
            [isDescriptor]: true,
            merge         : 'deep',
            value         : {
                module         : PageContainer,
                buttonTextField: 'name',
                contentConfig  : {
                    module: null
                }
            }
        },
        /**
         * @member {Object|null} treeConfig_=null
         * @reactive
         */
        treeConfig_: {
            [isDescriptor]: true,
            merge         : 'deep',
            value         : null
        }
    }
}

export default Neo.setupClass(MainContainer);
