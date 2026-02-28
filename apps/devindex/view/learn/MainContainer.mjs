import ContentComponent from './Component.mjs';
import Controller       from './MainContainerController.mjs';
import SharedContainer  from '../../../../src/app/content/Container.mjs';
import StateProvider    from './MainContainerStateProvider.mjs';

/**
 * @class DevIndex.view.learn.MainContainer
 * @extends Neo.app.content.Container
 */
class MainContainer extends SharedContainer {
    static config = {
        /**
         * @member {String} className='DevIndex.view.learn.MainContainer'
         * @protected
         */
        className: 'DevIndex.view.learn.MainContainer',
        /**
         * @member {String[]} cls=['devindex-learn-container', 'portal-shared-background']
         */
        cls: ['devindex-learn-container', 'portal-shared-background'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: Controller,
        /**
         * @member {Object} pageContainerConfig
         */
        pageContainerConfig: {
            contentConfig: {
                module: ContentComponent
            }
        },
        /**
         * @member {Neo.state.Provider} stateProvider=MainContainerStateProvider
         * @reactive
         */
        stateProvider: StateProvider
    }
}

export default Neo.setupClass(MainContainer);
