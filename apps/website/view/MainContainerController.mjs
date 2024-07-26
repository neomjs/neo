import ComponentController from '../../../src/controller/Component.mjs';
import NeoArray            from '../../../src/util/Array.mjs';

/**
 * @class Website.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static config = {
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
        mainTabs: ['home', 'blog', 'examples', 'docs'],
        /**
         * @member {String[]} mainTabsListeners=[]
         * @protected
         */
        mainTabsListeners: []
    }

    /**
     * @param {Number} tabIndex
     * @returns {Neo.component.Base}
     */
    getView(tabIndex) {
        return this.getReference(this.mainTabs[tabIndex]);
    }

    /**
     * @param {Object[]} records
     */
    onBlogPostStoreLoad(records) {
        this.getReference('blog-header-button').badgeText = records.length + ''
    }

    /**
     *
     */
    onComponentConstructed() {
        let me = this;

        me.getReference('main-tab-container').on('moveTo', me.onTabMove.bind(me, 'mainTabs'));
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        if (!Neo.config.hash) {
            this.onHashChange({
                hash      : {mainview: 'home'},
                hashString: 'mainview=home'
            }, null);
        }
    }

    /**
     * @param {Object} value
     * @param {Object} oldValue
     */
    onHashChange(value, oldValue) {
        let me           = this,
            hash         = value?.hash,
            tabContainer = me.getReference('main-tab-container'),
            activeIndex  = me.mainTabs.indexOf(hash.mainview),
            activeView   = me.getView(activeIndex),
            listeners    = me.mainTabsListeners,
            store;

        if (tabContainer && activeIndex > -1) {
            tabContainer.activeIndex = activeIndex;
        }

        if (!activeView || !activeView.isConstructed) {
            me.timeout(10).then(() => {
                me.onHashChange(value, oldValue);
            });

            return
        }

        switch (hash.mainview) {
            case 'home': {
                if (!listeners['home']) {
                    listeners.push('home');
                    activeView.on('moveTo', me.onTabMove.bind(me, 'homeTabs'));
                }

                if (hash.childview) {
                    activeView.activeIndex = me.homeTabs.indexOf(hash.childview);
                }
                break;
            }
            case 'blog': {
                store = me.getReference('blog-list').store;
                break;
            }
            case 'examples': {
                if (!listeners['examples']) {
                    listeners.push('examples');
                    activeView.on('moveTo', me.onTabMove.bind(me, 'examplesTabs'));
                }

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
                    activeView.activeIndex = me.examplesTabs.indexOf(hash.childview);
                }
                break;
            }
            case 'docs': {
                store = me.getReference('docs').store;
                break;
            }
        }

        if (store?.getCount() < 1) {
            me.timeout(50).then(() => {
                store.load()
            })
        }
    }

    /**
     * @param {Object} data
     */
    onNavLinkClick(data) {
        const targetId = data.target.data.target;

        Neo.main.DomAccess.scrollIntoView({
            id: targetId
        }).then(() => {
            this.timeout(900).then(() => {
                Neo.main.DomAccess.setStyle({
                    id: targetId,
                    style: {
                        color: 'red'
                    }
                }).then(() => {
                    this.timeout(300).then(() => {
                        Neo.main.DomAccess.setStyle({
                            id: targetId,
                            style: {
                                color: null
                            }
                        })
                    })
                })
            })
        })
    }

    /**
     * @param {Object} data
     */
    onSearchFieldChange(data) {
        this.getReference('blog-list').filterItems(data);
    }

    /**
     * @param {Object} data
     */
    onSwitchThemeButtonClick(data) {
        let me        = this,
            button    = data.component,
            component = me.component,
            cls, iconCls, theme;

        if (button.iconCls === 'fa fa-sun') {
            iconCls = 'fa fa-moon';
            theme   = 'neo-theme-light';
        } else {
            iconCls = 'fa fa-sun';
            theme   = 'neo-theme-dark';
        }

        cls = [...component.cls];

        component.cls.forEach(item => {
            if (item.includes('neo-theme')) {
                NeoArray.remove(cls, item);
            }
        });

        NeoArray.add(cls, theme);
        component.cls = cls;

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

Neo.setupClass(MainContainerController);

export default MainContainerController;
