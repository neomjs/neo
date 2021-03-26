import Component from '../../src/controller/Component.mjs';

/**
 * @class ComponentModelExample.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Component {
    static getConfig() {return {
        className: 'ComponentModelExample.MainContainerController',
        ntype    : 'main-container-controller'
    }}

    /**
     *
     * @param {Object} data
     */
    onButton1Click(data) {
        this.view.model.data['button1Text'] = 'Button 1';
    }

    /**
     *
     * @param {Object} data
     */
    onButton2Click(data) {
        this.view.model.data['button1Text'] = 'Button 2';
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};
