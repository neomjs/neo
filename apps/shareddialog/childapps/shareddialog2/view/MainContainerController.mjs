import ComponentController from '../../../../../src/controller/Component.mjs';

/**
 * @class SharedDialog2.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static config = {
        /**
         * @member {String} className='SharedDialog2.view.MainContainerController'
         * @protected
         */
        className: 'SharedDialog2.view.MainContainerController'
    }

    /**
     * @param {Object} data
     */
    onCreateDialogButtonClick(data) {
        Neo.apps['SharedDialog']?.mainView.controller.createDialog(data, this.component.appName)
    }
}

export default Neo.setupClass(MainContainerController);
