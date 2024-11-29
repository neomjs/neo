import Controller from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.stateProvider.multiWindow.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    /**
     * @member {Neo.examples.stateProvider.multiWindow.dialog.EditUserDialog|null} dialog=null
     */
    dialog = null

    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.multiWindow.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.stateProvider.multiWindow.MainContainerController'
    }

    /**
     * @param {Boolean} enable
     */
    enableEditUserButton(enable) {
        this.getReference('edit-user-button').disabled = !enable
    }

    /**
     * @param {Object} data
     */
    onEditUserButtonClick(data) {
        let me = this;

        me.enableEditUserButton(false);

        if (!me.dialog) {
            import('./EditUserDialog.mjs').then(module => {
                me.dialog = Neo.create({
                    module         : module.default,
                    animateTargetId: me.getReference('edit-user-button').id,
                    appName        : me.component.appName,
                    closeAction    : 'hide',

                    listeners: {
                        hide: me.enableEditUserButton.bind(me, true)
                    },

                    stateProvider: {
                        parent: me.getStateProvider()
                    }
                })
            })
        } else {
            me.dialog.show()
        }
    }
}

export default Neo.setupClass(MainContainerController);
