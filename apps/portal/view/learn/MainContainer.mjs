import Container                  from '../../../../src/container/Base.mjs';
import ContentTreeList            from './ContentTreeList.mjs';
import MainContainerController    from './MainContainerController.mjs';
import MainContainerStateProvider from './MainContainerStateProvider.mjs';
import PageContainer              from './PageContainer.mjs';
import PageSectionsContainer      from './PageSectionsContainer.mjs';
import Splitter                   from '../../../../src/component/Splitter.mjs';

/**
 * @class Portal.view.learn.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.MainContainer'
         * @protected
         */
        className: 'Portal.view.learn.MainContainer',
        /**
         * @member {String[]} cls=['portal-learn-maincontainer']
         * @reactive
         */
        cls: ['portal-learn-maincontainer'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: MainContainerController,
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
                module   : ContentTreeList,
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
            module   : PageSectionsContainer,
            reference: 'page-sections-container'
        }],
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Neo.state.Provider} stateProvider=MainContainerStateProvider
         * @reactive
         */
        stateProvider: MainContainerStateProvider
    }
}

export default Neo.setupClass(MainContainer);
