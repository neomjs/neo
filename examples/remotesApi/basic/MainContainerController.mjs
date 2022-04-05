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
        console.log('onGetAllFriendsButtonClick');
    }

    /**
     * @param {Object} data
     */
    onGetAllUsersButtonClick(data) {
        console.log('onGetAllUsersButtonClick');
    }

    /**
     * @param {Object} data
     */
    onGetAllUsersPlusFriendsButtonClick(data) {
        console.log('onGetAllUsersPlusFriendsButtonClick');
    }
}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
