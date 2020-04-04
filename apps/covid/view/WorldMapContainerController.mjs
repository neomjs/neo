import {default as ComponentController} from '../../../src/controller/Component.mjs';

/**
 * @class Covid.view.WorldMapContainerController
 * @extends Neo.controller.Component
 */
class WorldMapContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.WorldMapContainerController'
         * @private
         */
        className: 'Covid.view.WorldMapContainerController'
    }}

    /**
     *
     * @param {Object} data
     */
    onSeriesButtonClick(data) {
        console.log('onSeriesButtonClick', data.component.series);
    }
}

Neo.applyClassConfig(WorldMapContainerController);

export {WorldMapContainerController as default};