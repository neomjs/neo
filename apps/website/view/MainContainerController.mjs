import {default as ComponentController} from '../../../src/controller/Component.mjs';

/**
 * @class Website.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='Website.view.MainContainerController'
         * @protected
         */
        className: 'Website.view.MainContainerController'
    }}

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        // todo: move once routes are in place
        setTimeout(() => {
            let me       = this,
                blogList = me.getReference('blog-list');

            blogList.store.load();
        }, 10);
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};