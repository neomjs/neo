import ComponentController from '../../../src/controller/Component.mjs';
import NeoArray            from '../../../src/util/Array.mjs';

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
        className: 'Website.view.MainContainerController',
        /**
         * @member {String[]} mainTabs=['home','blog','examples','docs']
         * @protected
         */
        mainTabs: ['home', 'blog', 'examples', 'docs']
    }}

    /**
     *
     * @param {Object} value
     * @param {Object} oldValue
     */
    onHashChange(value, oldValue) {
        let me               = this,
            hash             = value && value.hash,
            tabContainer     = me.getReference('main-tab-container'),
            activeChildIndex = -1,
            activeIndex      = me.mainTabs.indexOf(hash.mainview),
            store;

        switch (hash.mainview) {
            case 'home':
                switch (hash.childview) {
                    case 'developers':
                        activeChildIndex = 0;
                        break;
                    default:
                        activeChildIndex = 1;
                        break;
                }

                me.getReference('home-tab-container').activeIndex = activeChildIndex;
                break;
            case 'blog':
                store = me.getReference('blog-list').store;
                break;
            case 'examples':
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
                store = me.getReference('docs-list').store;
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
     *
     * @param {Object} data
     */
    onNavLinkClick(data) {
        const targetId = data.target.data.target;

        Neo.main.DomAccess.scrollIntoView({
            id: targetId
        }).then(() => {
            setTimeout(() => {
                Neo.main.DomAccess.setStyle({
                    id: targetId,
                    style: {
                        color: 'red'
                    }
                }).then(() => {
                    setTimeout(() => {
                        Neo.main.DomAccess.setStyle({
                            id: targetId,
                            style: {
                                color: null
                            }
                        });
                    }, 300)
                });
            }, 900)
        });
    }

    /**
     *
     * @param {Object} data
     */
    onSearchFieldChange(data) {
        this.getReference('blog-list').filterItems(data);
    }

    /**
     * @param {Object} data
     */
    onSwitchThemeButtonClick(data) {
        let me     = this,
            button = data.component,
            view   = me.view,
            cls, iconCls, theme;

        if (button.iconCls === 'fa fa-sun') {
            iconCls = 'fa fa-moon';
            theme   = 'neo-theme-light';
        } else {
            iconCls = 'fa fa-sun';
            theme   = 'neo-theme-dark';
        }

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