import Controller from '../../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.toolbar.breadcrumb.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='Neo.examples.toolbar.breadcrumb.view.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.toolbar.breadcrumb.view.MainContainerController'
    }

    /**
     * @param {Object} data
     */
    onActiveKeyButtonClick(data) {
        this.getReference('breadcrumb-toolbar').activeKey = data.component.activeKey;
    }
}

Neo.setupClass(MainContainerController);

export default MainContainerController;
