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
         * @member {String[]} examplesTabs=['devmode','dist_dev','dist_prod']
         * @protected
         */
        examplesTabs: ['devmode', 'dist_dev', 'dist_prod'],
        /**
         * @member {String[]} homeTabs=['developers','executives']
         * @protected
         */
        homeTabs: ['developers', 'executives'],
        /**
         * @member {String[]} mainTabs=['home','blog','examples','docs']
         * @protected
         */
        mainTabs: ['home', 'blog', 'examples', 'docs']
    }}

    /**
     *
     */
    onViewParsed() {
        super.onViewParsed();

        let me = this;

        me.getReference('examples-tab-container').on('moveTo', me.onTabMove.bind(me, 'examplesTabs'));
        me.getReference('home-tab-container').    on('moveTo', me.onTabMove.bind(me, 'homeTabs'));
        me.getReference('main-tab-container').    on('moveTo', me.onTabMove.bind(me, 'mainTabs'));
    }

    /**
     *
     * @param {Object} value
     * @param {Object} oldValue
     */
    onHashChange(value, oldValue) {
        let me           = this,
            hash         = value && value.hash,
            tabContainer = me.getReference('main-tab-container'),
            activeIndex  = me.mainTabs.indexOf(hash.mainview),
            store;

        switch (hash.mainview) {
            case 'home':
                if (hash.childview) {
                    me.getReference('home-tab-container').activeIndex = me.homeTabs.indexOf(hash.childview);
                }
                break;
            case 'blog':
                store = me.getReference('blog-list').store;
                break;
            case 'examples':
                switch (hash.childview) {
                    case 'devmode':
                        store = me.getReference('examples-devmode-list').store;
                        break;
                    case 'dist_dev':
                        store = me.getReference('examples-dist-dev-list').store;
                        break;
                    default:
                        store = me.getReference('examples-dist-prod-list').store;
                        break;
                }

                if (hash.childview) {
                    me.getReference('examples-tab-container').activeIndex = me.examplesTabs.indexOf(hash.childview);
                }
                break;
            case 'docs':
                store = me.getReference('docs-list').store;
                break;
        }

        if (activeIndex > -1) {
            tabContainer.activeIndex = activeIndex;
        }

        if (store && store.getCount() < 1) {
            setTimeout(() => {
                store.load();
            }, 50);
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

    /**
     * @param {String} target examplesTabs, homeTabs, mainTabs
     * @param {Object} data
     */
    onTabMove(target, data) {
        NeoArray.move(this[target], data.fromIndex, data.toIndex);
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};