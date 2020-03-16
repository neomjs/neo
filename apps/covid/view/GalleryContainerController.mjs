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

    /**
     *
     * @param {Object} opts
     */
    onChangeTranslateX(opts) {
        console.log('onChangeTranslateX', arguments);
    }

    /**
     *
     */
    onCollapseButtonClick() {
        const panel  = this.getReference('controls-panel'),
              expand = panel.width === 40;

        panel.width = expand ? 250 : 40;

        this.getReference('collapse-button').text   = expand ? 'X' : '+';
    }
}

Neo.applyClassConfig(GalleryContainerController);

export {GalleryContainerController as default};