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

        return;
        // todo: move once routes are in place
        setTimeout(() => {
            let me           = this,
                blogList     = me.getReference('blog-list'),
                examplesList = me.getReference('examples-devmode-list');

            blogList    .store.load();
            examplesList.store.load();
            me.getReference('examples-dist-dev-list').store.load();
            me.getReference('examples-dist-prod-list').store.load();
            me.getReference('docs-list').store.load();
        }, 10);
    }

    /**
     *
     * @param {Object} value
     * @param {Object} oldValue
     */
    onHashChange(value, oldValue) {
        let me               = this,
            view             = me.view,
            hash             = value && value.hash,
            tabContainer     = me.getReference('main-tab-container'),
            activeChildIndex = -1,
            activeIndex      = -1,
            store;

        switch (hash.mainview) {
            case 'home':
                activeIndex = 0;
                break;
            case 'blog':
                activeIndex = 1;
                store       = me.getReference('blog-list').store;
                break;
            case 'examples':
                activeIndex = 2;

                switch (hash.childview) {
                    case 'devmode':
                        activeChildIndex = 0;
                        store            = me.getReference('examples-devmode-list').store;
                        break;
                    case 'dist_dev':
                        activeChildIndex = 1;
                        store            = me.getReference('examples-dist-dev-list').store;
                        break;
                    default:
                        activeChildIndex = 2;
                        store            = me.getReference('examples-dist-prod-list').store;
                        break;
                }

                me.getReference('examples-tab-container').activeIndex = activeChildIndex;
                break;
            case 'docs':
                activeIndex = 3;
                store       = me.getReference('docs-list').store;
                break;
        }

        if (activeIndex > -1) {
            tabContainer.activeIndex = activeIndex;
        }

        if (store && store.getCount() < 1) {
            store.load();
        }
    }

    /**
     * @param {Object} data
     */
    onSwitchThemeButtonClick(data) {
        let me              = this,
            button          = data.component,
            headerContainer = me.getReference('header-container'),
            style           = headerContainer.style,
            view            = me.view,
            cls, color, iconCls, theme;

        if (button.iconCls === 'fa fa-sun') {
            color   = '#666';
            iconCls = 'fa fa-moon';
            theme   = 'neo-theme-light';
        } else {
            color   = '#2b2b2b';
            iconCls = 'fa fa-sun';
            theme   = 'neo-theme-dark';
        }

        style.backgroundColor = color;
        headerContainer.style = style;

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