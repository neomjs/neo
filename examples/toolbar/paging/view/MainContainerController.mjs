import ComponentController from '../../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.toolbar.paging.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    /**
     * @member {Neo.examples.toolbar.paging.view.AddUserDialog|null} addUserDialog=null
     */
    addUserDialog = null

    static config = {
        /**
         * @member {String} className='Neo.examples.toolbar.paging.view.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.toolbar.paging.view.MainContainerController'
    }

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
                })
            })
        } else {
            me.addUserDialog.show()
        }
    }

    /**
     * @param {Object} data
     */
    onShowFiltersButtonClick(data) {
        let userTable = this.getReference('user-table');

        userTable.showHeaderFilters = !userTable.showHeaderFilters
    }

    /**
     * Sending messages through a WebSocket inside the data worker
     * @param {Object} data
     */
    onUserServiceReadButtonClick(data) {
        MyApp.backend.UserService.read().then(response => {
            console.log(response)
        })
    }
}

export default Neo.setupClass(MainContainerController);
