import ContentComponent from './Component.mjs';
import Controller       from './MainContainerController.mjs';
import SharedContainer  from '../../../../../src/app/content/Container.mjs';
import StateProvider    from './MainContainerStateProvider.mjs';

/**
 * @class Portal.view.news.blog.MainContainer
 * @extends Neo.app.content.Container
 */
class MainContainer extends SharedContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.news.blog.MainContainer'
         * @protected
         */
        className: 'Portal.view.news.blog.MainContainer',
        /**
         * @member {String[]} cls=['portal-blog-maincontainer']
         * @reactive
         */
        cls: ['portal-blog-maincontainer'],
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
