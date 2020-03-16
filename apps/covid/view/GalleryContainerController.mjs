import {default as ComponentController} from '../../../src/controller/Component.mjs';

/**
 * @class Covid.view.GalleryContainerController
 * @extends Neo.controller.Component
 */
class GalleryContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.GalleryContainerController'
         * @private
         */
        className: 'Covid.view.GalleryContainerController'
    }}
}

Neo.applyClassConfig(GalleryContainerController);

export {GalleryContainerController as default};