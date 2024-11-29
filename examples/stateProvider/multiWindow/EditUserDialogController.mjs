import Controller from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.stateProvider.multiWindow.EditUserDialogController
 * @extends Neo.controller.Component
 */
class EditUserDialogController extends Controller {
    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.multiWindow.EditUserDialogController'
         * @protected
         */
        className: 'Neo.examples.stateProvider.multiWindow.EditUserDialogController'
    }

    /**
     * @param {Object} data
     */
    onFirstnameTextFieldChange(data) {
        this.getStateProvider().setData({
            'user.firstname': data.value || ''
        })
    }

    /**
     * @param {Object} data
     */
    onLastnameTextFieldChange(data) {
        this.getStateProvider().setData({
            'user.lastname': data.value || ''
        })
    }
}

export default Neo.setupClass(EditUserDialogController);
