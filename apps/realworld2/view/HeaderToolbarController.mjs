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

    onGalleryButtonClick() {
        this.setRoute('/gallery');
    }

    onHelixButtonClick() {
        this.setRoute('/helix');
    }

    onHomeButtonClick() {
        this.setRoute('/');
    }

    onNewArticleButtonClick() {
        this.setRoute('/editor');
    }

    onSettingsButtonClick() {
        this.setRoute('/settings');
    }

    /**
     *
     * @param {String} hash
     */
    setRoute(hash) {
        Neo.Main.setRoute({
            value: hash
        });
    }
}

Neo.applyClassConfig(HeaderToolbarController);

export {HeaderToolbarController as default};