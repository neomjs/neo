import ComponentController from '../../../../src/controller/Component.mjs';
import SocketConnection    from '../../../../src/data/connection/WebSocket.mjs';

/**
 * @class MyApp.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    /**
     * @member {MyApp.view.AddUserDialog|null} addUserDialog=null
     */
    addUserDialog = null

    static getConfig() {return {
        /**
         * @member {String} className='MyApp.view.MainContainerController'
         * @protected
         */
        className: 'MyApp.view.MainContainerController'
    }}

    /**
     * @param {Object} data
     */
    onAddUserButtonClick(data) {
        let me = this;

        if (!me.addUserDialog) {
            import('./AddUserDialog.mjs').then(module => {
                me.addUserDialog = Neo.create(module.default, {
                    animateTargetId: data.component.id,
                    appName        : me.component.appName,
                    closeAction    : 'hide'
                });
            });
        } else {
            me.addUserDialog.show();
        }
    }

    /**
     * Sending messages through a WebSocket inside the data worker
     * @param {Object} data
     */
    onUserServiceReadButtonClick(data) {
        MyApp.backend.UserService.read().then(response => {
            console.log(response);
        })
    }
}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
