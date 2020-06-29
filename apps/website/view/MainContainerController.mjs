import {default as ComponentController} from '../../../src/controller/Component.mjs';
import NeoArray                         from '../../../src/util/Array.mjs';

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
            let me           = this,
                blogList     = me.getReference('blog-list'),
                examplesList = me.getReference('examples-devmode-list');

            blogList    .store.load();
            examplesList.store.load();
        }, 10);
    }

    /**
     * @param {Object} data
     */
    onSwitchThemeButtonClick(data) {
        let me       = this,
            button   = data.component,
            logo     = me.getReference('logo'),
            logoPath = 'https://raw.githubusercontent.com/neomjs/pages/master/resources/images/apps/covid/',
            vdom     = logo.vdom,
            view     = me.view,
            cls, iconCls, theme;

        if (button.iconCls === 'fa fa-sun') {
            iconCls = 'fa fa-moon';
            theme   = 'neo-theme-light';
        } else {
            iconCls = 'fa fa-sun';
            theme   = 'neo-theme-dark';
        }

        vdom.src = logoPath + (theme === 'neo-theme-dark' ? 'covid_logo_dark.jpg' : 'covid_logo_light.jpg');
        logo.vdom = vdom;

        cls = [...view.cls];

        view.cls.forEach(item => {
            if (item.includes('neo-theme')) {
                NeoArray.remove(cls, item);
            }
        });

        NeoArray.add(cls, theme);
        view.cls = cls;

        button.iconCls = iconCls;
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};