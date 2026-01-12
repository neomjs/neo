import ContentComponent from './Component.mjs';
import Controller       from './MainContainerController.mjs';
import SharedContainer  from '../../shared/content/Container.mjs';
import StateProvider    from './MainContainerStateProvider.mjs';

/**
 * @class Portal.view.news.release.MainContainer
 * @extends Portal.view.shared.content.Container
 */
class MainContainer extends SharedContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.news.release.MainContainer'
         * @protected
         */
        className: 'Portal.view.news.release.MainContainer',
        /**
         * @member {String[]} cls=['portal-release-maincontainer']
         * @reactive
         */
        cls: ['portal-release-maincontainer'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: Controller,
        /**
         * @member {Object} pageContainerConfig
         */
        pageContainerConfig: {
            buttonTextField: 'id',
            contentConfig  : {
                module: ContentComponent
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
