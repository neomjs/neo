import {default as ComponentController} from '../../../src/controller/Component.mjs';

/**
 * @class RealWorld2.view.HeaderToolbarController
 * @extends Neo.controller.Component
 */
class HeaderToolbarController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.view.HeaderToolbarController'
         * @private
         */
        className: 'RealWorld2.view.HeaderToolbarController'
    }}

    onHomeButtonClick() {
        console.log('onHomeButtonClick');
    }

    onNewArticleButtonClick() {
        console.log('onNewArticleButtonClick');
    }

    onProfileButtonClick() {
        console.log('onProfileButtonClick');
    }

    onSettingsButtonClick() {
        console.log('onSettingsButtonClick');
    }
}

Neo.applyClassConfig(HeaderToolbarController);

export {HeaderToolbarController as default};