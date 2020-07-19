import {default as ComponentController} from '../../../src/controller/Component.mjs';

/**
 * @class CalendarBasic.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='CalendarBasic.MainContainerController'
         * @protected
         */
        className: 'CalendarBasic.MainContainerController'
    }}

    /**
     *
     * @param {Object} data
     */
    onSwitchThemeButtonClick(data) {
        console.log('onSwitchThemeButtonClick');
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};