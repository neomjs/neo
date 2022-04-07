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
        MyApi.UserService.getAll().then(response => console.log(response));
    }

    /**
     * @param {Object} data
     */
    onGetAllUsersButtonClick(data) {
        MyApi.FriendService.getAll();
    }

    /**
     * @param {Object} data
     */
    onGetAllUsersPlusFriendsButtonClick(data) {
        MyApi.UserService.getAll();
        MyApi.FriendService.getAll();
    }
}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
