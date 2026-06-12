import CanvasWrapper   from '../../content/CanvasWrapper.mjs';
import Component       from './Component.mjs';
import Controller      from './MainContainerController.mjs';
import PageContainer   from './PageContainer.mjs';
import SharedContainer from '../../../../../src/app/content/Container.mjs';
import StateProvider   from './MainContainerStateProvider.mjs';

/**
 * @class Portal.view.news.discussions.MainContainer
 * @extends Neo.app.content.Container
 */
class MainContainer extends SharedContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.news.discussions.MainContainer'
         * @protected
         */
        className: 'Portal.view.news.discussions.MainContainer',
        /**
         * @member {String[]} cls=['portal-discussions-maincontainer']
         * @reactive
         */
        cls: ['portal-discussions-maincontainer'],
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
                contentComponent: Component,
                module          : CanvasWrapper
            }
        },
        /**
         * @member {Neo.state.Provider} stateProvider=MainContainerStateProvider
         * @reactive
         */
        stateProvider: StateProvider,
        /**
         * @member {Object} treeConfig
         */
        treeConfig: {
            displayField       : 'treeNodeName',
            lazyChildLoad      : true,
            lazyChildUrlPrefix : '../../apps/portal/resources/data/'
        }
    }
}

export default Neo.setupClass(MainContainer);
