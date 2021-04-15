import Component from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.model.dialog.EditUserDialogController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.model.dialog.EditUserDialogController'
         * @protected
         */
        className: 'Neo.examples.model.dialog.EditUserDialogController'
    }}

    /**
     *
     * @param {Object} data
     */
    onFirstnameTextFieldChange(data) {
        console.log(this.getModel());

        this.getModel().setData({
            'user.firstname': data.value
        });
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};