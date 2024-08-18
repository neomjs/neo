import ComponentController from '../../../src/controller/Component.mjs';
import Toast               from '../../../src/component/Toast.mjs';

/**
 * @class Neo.examples.component.toast.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.toast.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.component.toast.MainContainerController'
    }

    theme = 'light'

    /**
     * @param {Object} config
     */
    onToggleTheme(config) {
        const
            add         = (this.theme === 'light') ? 'dark' : 'light',
            remove      = add === 'light' ? 'dark' : 'light',
            themeButton = this.getReference('theme-button'),
            buttonIcon  = add === 'light' ? 'sun' : 'moon';

        this.theme = add;

        Neo.main.DomAccess.setBodyCls({remove: ['neo-theme-' + remove] , add: ['neo-theme-' + add]});
        themeButton.iconCls = 'fa fa-' + buttonIcon
    }
}

export default Neo.setupClass(MainContainerController);
