import ContentComponent from './Component.mjs';
import Controller       from './MainContainerController.mjs';
import SharedContainer  from '../shared/content/Container.mjs';
import StateProvider    from './MainContainerStateProvider.mjs';

/**
 * @class Portal.view.learn.MainContainer
 * @extends Portal.view.shared.content.Container
 */
class MainContainer extends SharedContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.MainContainer'
         * @protected
         */
        className: 'Portal.view.learn.MainContainer',
        /**
         * @member {String[]} cls=['portal-shared-background']
         */
        cls: ['portal-shared-background'],
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
