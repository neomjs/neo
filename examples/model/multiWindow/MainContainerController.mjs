import Component from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.model.multiWindow.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Component {
    /**
     * @member {Neo.examples.dialog.EditUserDialog|null} dialog=null
     */
    dialog = null

    static config = {
        /**
         * @member {String} className='Neo.examples.model.multiWindow.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.model.multiWindow.MainContainerController'
    }

    /**
     * @param {Boolean} enable
     */
    enableEditUserButton(enable) {
        this.getReference('edit-user-button').disabled = !enable;
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

                    model: {
                        parent: me.getModel()
                    }
                });
            });
        } else {
            me.dialog.show();
        }
    }
}

Neo.setupClass(MainContainerController);

export default MainContainerController;
