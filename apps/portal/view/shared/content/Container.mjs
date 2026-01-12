import {isDescriptor}  from '../../../../../src/core/ConfigSymbols.mjs';
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
         * @member {String[]} baseCls=['portal-shared-content-container','neo-container']
         * @reactive
         */
        baseCls: ['portal-shared-content-container', 'neo-container'],
        /**
         * @member {String} buttonTextField='name'
         */
        buttonTextField: 'name',
        /**
         * @member {Neo.component.Base|null} contentComponent=null
         */
        contentComponent: null,
        /**
         * Default items configuration using the Proxy Config Pattern
         * @member {Object} contentItems_
         */
        contentItems_: {
            [isDescriptor]: true,
            merge         : 'deep',
            value         : {
                sideNav: {
                    module   : Container,
                    cls      : ['sidenav-container'],
                    flex     : 'none',
                    layout   : 'fit',
                    reference: 'sidenav-container',
                    tag      : 'aside',
                    weight   : 10,
                    items    : {
                        tree: {
                            module   : TreeList,
                            reference: 'tree'
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
                    module          : '@config:pageContainerModule',
                    buttonTextField : '@config:buttonTextField',
                    contentComponent: '@config:contentComponent',
                    weight          : 30
                },
                sections: {
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
         * @member {Neo.component.Base} pageContainerModule=PageContainer
         */
        pageContainerModule: PageContainer,
        /**
         * @member {Object|null} treeConfig=null
         */
        treeConfig: null
    }

    /**
     * @param {Object} value
     * @param {Object} oldValue
     */
    afterSetContentItems(value, oldValue) {
        let me = this;

        if (value) {
            // Manually merge treeConfig if it exists
            if (me.treeConfig && value.sideNav?.items?.tree) {
                Neo.assignDefaults(value.sideNav.items.tree, me.treeConfig);
            }
            me.items = value;
        }
    }
}

export default Neo.setupClass(MainContainer);
