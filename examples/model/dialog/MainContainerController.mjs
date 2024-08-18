import Controller from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.model.dialog.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='Neo.examples.model.dialog.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.model.dialog.MainContainerController',
        /**
         * @member {Neo.examples.dialog.EditUserDialog|null} dialog=null
         */
        dialog: null
    }

    /**
     * @param {Object} data
     */
    onEditUserButtonClick(data) {
        let me = this;

        if (!me.dialog) {
            import('./EditUserDialog.mjs').then(module => {
                me.dialog = Neo.create({
                    module         : module.default,
                    animateTargetId: me.getReference('edit-user-button').id,
                    appName        : me.component.appName,
                    closeAction    : 'hide',

                    model: {
                        parent: me.getModel()
                    }
                })
            })
        } else {
            me.dialog.show()
        }
    }
}

export default Neo.setupClass(MainContainerController);
