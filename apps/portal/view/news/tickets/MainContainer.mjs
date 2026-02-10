import CanvasWrapper    from './CanvasWrapper.mjs';
import Controller       from './MainContainerController.mjs';
import PageContainer    from './PageContainer.mjs';
import SharedContainer  from '../../../../../src/app/content/Container.mjs';
import StateProvider    from './MainContainerStateProvider.mjs';

/**
 * @class Portal.view.news.tickets.MainContainer
 * @extends Neo.app.content.Container
 */
class MainContainer extends SharedContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.news.tickets.MainContainer'
         * @protected
         */
        className: 'Portal.view.news.tickets.MainContainer',
        /**
         * @member {String[]} cls=['portal-tickets-maincontainer']
         * @reactive
         */
        cls: ['portal-tickets-maincontainer'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: Controller,
        /**
         * @member {Object} pageContainerConfig
         */
        pageContainerConfig: {
            module         : PageContainer,
            buttonTextField: 'id',
            contentConfig  : {
                module: CanvasWrapper
            }
        },
        /**
         * @member {Neo.state.Provider} stateProvider=MainContainerStateProvider
         * @reactive
         */
        stateProvider: StateProvider,
        /**
         * @member {Object} treeConfig={displayField:'treeNodeName'}
         */
        treeConfig: {
            displayField: 'treeNodeName'
        }
    }
}

export default Neo.setupClass(MainContainer);
