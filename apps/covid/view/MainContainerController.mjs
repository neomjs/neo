import {default as ComponentController} from '../../../src/controller/Component.mjs';

/**
 * @class Covid.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static getConfig() {return {
        className: 'Covid.view.MainContainerController'
    }}

    onConstructed() {
        super.onConstructed();

        console.log('MainContainerController onConstructed');
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};