import {default as ComponentController} from '../../../src/controller/Component.mjs';

/**
 * @class Covid.view.HelixContainerController
 * @extends Neo.controller.Component
 */
class HelixContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.HelixContainerController'
         * @private
         */
        className: 'Covid.view.HelixContainerController'
    }}
}

Neo.applyClassConfig(HelixContainerController);

export {HelixContainerController as default};