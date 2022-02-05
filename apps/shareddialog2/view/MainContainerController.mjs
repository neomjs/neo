import ComponentController from '../../../src/controller/Component.mjs';

/**
 * @class SharedDialog2.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='SharedDialog2.view.MainContainerController'
         * @protected
         */
        className: 'SharedDialog2.view.MainContainerController'
    }}

    /**
     * @param {Object} data
     */
    onCreateDialogButtonClick(data) {
        let app = Neo.apps['SharedDialog'];

        if (app) {
            app.mainView.controller.createDialog(data, this.component.appName);
        }
    }
}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
