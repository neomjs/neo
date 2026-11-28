import Controller from '../../../../src/controller/Component.mjs';

/**
 * @summary Shows the view selected by the owning window's route while retaining every destination card.
 * @class Neo.examples.toolbar.navigation.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='Neo.examples.toolbar.navigation.view.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.toolbar.navigation.view.MainContainerController',
        /**
         * @member {String} defaultHash='/inbox'
         */
        defaultHash: '/inbox',
        /**
         * @member {Object} routes
         */
        routes: {'/{destination}': 'showDestination'}
    }

    /**
     * @summary Clears the draft and navigates to its editor through the normal route handler.
     */
    onNewDraft() {
        this.getReference('schedule-draft').value = '';
        Neo.Main.setRoute({value: '/schedule', windowId: this.windowId})
    }

    /**
     * @summary Projects the route into the existing card layout.
     * @param {Object} params
     * @param {String} params.destination
     */
    showDestination({destination}) {
        const content = this.getReference('route-content'),
              index   = content.items.findIndex(item => item.reference === `${destination}-card`);

        if (index >= 0) {
            content.layout.activeIndex = index
        }
    }
}

export default Neo.setupClass(MainContainerController);
