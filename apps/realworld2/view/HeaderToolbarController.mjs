import ComponentController from '../../../src/controller/Component.mjs';

/**
 * @class RealWorld2.view.HeaderToolbarController
 * @extends Neo.controller.Component
 */
class HeaderToolbarController extends ComponentController {
    static config = {
        /**
         * @member {String} className='RealWorld2.view.HeaderToolbarController'
         * @protected
         */
        className: 'RealWorld2.view.HeaderToolbarController'
    }

    onGalleryButtonClick() {
        this.setRoute('/gallery');
    }

    onHelixButtonClick() {
        this.setRoute('/helix');
    }

    onHomeButtonClick() {
        this.setRoute('/');
    }

    onLoginButtonClick() {
        this.setRoute('/login');
    }

    onNewArticleButtonClick() {
        this.setRoute('/editor');
    }

    onSettingsButtonClick() {
        this.setRoute('/settings');
    }

    /**
     * @param {String} hash
     */
    setRoute(hash) {
        Neo.Main.setRoute({
            value: hash
        });
    }
}

export default Neo.setupClass(HeaderToolbarController);
