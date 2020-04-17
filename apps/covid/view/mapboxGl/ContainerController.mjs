import {default as ComponentController} from '../../../../src/controller/Component.mjs';

/**
 * @class Covid.view.mapboxGl.ContainerController
 * @extends Neo.controller.Component
 */
class ContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.mapboxGl.ContainerController'
         * @private
         */
        className: 'Covid.view.mapboxGl.ContainerController',
        /**
         * @member {String} ntype='mapboxgl-container-controller'
         * @private
         */
        ntype: 'mapboxgl-container-controller'
    }}
}

Neo.applyClassConfig(ContainerController);

export {ContainerController as default};