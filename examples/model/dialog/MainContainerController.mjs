import Component      from '../../../src/controller/Component.mjs';
import EditUserDialog from './EditUserDialog.mjs';

/**
 * @class Neo.examples.model.dialog.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.model.dialog.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.model.dialog.MainContainerController',
        /**
         * @member {Neo.examples.dialog.EditUserDialog|null} dialog=null
         */
        dialog: null
    }}

    /**
     *
     * @param {Object} data
     */
    onEditUserButtonClick(data) {
        let me = this;

        if (!me.dialog) {
            me.dialog = Neo.create(EditUserDialog, {
                animateTargetId: me.getReference('edit-user-button').id,
                appName        : me.component.appName,

                model: {
                    parent: me.getModel()
                }
            });
        }

        //me.dialog.show();
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};