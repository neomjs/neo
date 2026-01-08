import ContentComponent from './Component.mjs';
import Controller       from './MainContainerController.mjs';
import SharedContainer  from '../shared/content/Container.mjs';
import StateProvider    from './MainContainerStateProvider.mjs';

/**
 * @class Portal.view.release.MainContainer
 * @extends Portal.view.shared.content.Container
 */
class MainContainer extends SharedContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.release.MainContainer'
         * @protected
         */
        className: 'Portal.view.release.MainContainer',
        /**
         * @member {String[]} cls=['portal-release-maincontainer']
         * @reactive
         */
        cls: ['portal-release-maincontainer'],
        /**
         * @member {Neo.component.Base} contentComponent=ContentComponent
         */
        contentComponent: ContentComponent,
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: Controller,
        /**
         * @member {Neo.state.Provider} stateProvider=MainContainerStateProvider
         * @reactive
         */
        stateProvider: StateProvider
    }
}

export default Neo.setupClass(MainContainer);
