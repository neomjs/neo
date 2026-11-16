import {isDescriptor, mergeFrom} from '../../core/ConfigSymbols.mjs';
import Container                 from '../../container/Base.mjs';
import PageContainer             from './PageContainer.mjs';
import SectionsContainer         from './SectionsContainer.mjs';
import Splitter                  from './Splitter.mjs';
import TreeList                  from './TreeList.mjs';

/**
 * @summary Renders the article before navigation while CSS preserves the visual column order.
 *
 * @class Neo.app.content.Container
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static config = {
        /**
         * @member {String} className='Neo.app.content.Container'
         * @protected
         */
        className: 'Neo.app.content.Container',
        /**
         * @member {String[]} baseCls=['neo-app-content-container','neo-container']
         * @reactive
         */
        baseCls: ['neo-app-content-container', 'neo-container'],
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
                    weight   : 40,
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
                    resizeTarget: 'next',
                    size        : 3,
                    weight      : 30
                },
                pageContainer: {
                    [mergeFrom]: 'pageContainerConfig',
                    weight     : 10
                },
                'page-sections-container': {
                    module   : SectionsContainer,
                    reference: 'page-sections-container',
                    weight   : 20
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
