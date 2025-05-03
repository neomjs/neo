import Controller from '../../src/controller/Component.mjs';

/**
 * @class Neo.examples.panel.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        className: 'Neo.examples.panel.MainContainerController'
    }

    onButton1Click(data) {
        console.log('onButton1Click', data, this)
    }

    onButton2Click(data) {
        console.log('onButton2Click', data, this)
    }
}

export default Neo.setupClass(MainContainerController);
