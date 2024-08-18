import Controller from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.model.multiWindow.EditUserDialogController
 * @extends Neo.controller.Component
 */
class EditUserDialogController extends Controller {
    static config = {
        /**
         * @member {String} className='Neo.examples.model.multiWindow.EditUserDialogController'
         * @protected
         */
        className: 'Neo.examples.model.multiWindow.EditUserDialogController'
    }

    /**
     * @param {Object} data
     */
    onFirstnameTextFieldChange(data) {
        this.getModel().setData({
            'user.firstname': data.value || ''
        })
    }

    /**
     * @param {Object} data
     */
    onLastnameTextFieldChange(data) {
        this.getModel().setData({
            'user.lastname': data.value || ''
        })
    }
}

export default Neo.setupClass(EditUserDialogController);
