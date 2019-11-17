import Component from '../../src/controller/Component.mjs';

/**
 * @class TestApp.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Component {
    static getConfig() {return {
        className: 'TestApp.MainContainerController',
        ntype    : 'main-container-controller'
    }}

    onButton1Click(data) {
        console.log('onButton1Click', data, this);
    }

    onButton2Click(data) {
        console.log('onButton2Click', data, this);
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};
