import ComponentController from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.remotesApi.basic.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.remotesApi.basic.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.remotesApi.basic.MainContainerController'
    }}

    /**
     * @param {Object} data
     */
    onGetAllFriendsButtonClick(data) {
        Neo.remotes.UserService.getAll().then(data => console.log(data));
    }

    /**
     * @param {Object} data
     */
    onGetAllUsersButtonClick(data) {
        Neo.remotes.FriendService.getAll();
    }

    /**
     * @param {Object} data
     */
    onGetAllUsersPlusFriendsButtonClick(data) {
        Neo.remotes.UserService.getAll();
        Neo.remotes.FriendService.getAll();
    }
}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
