import Controller        from '../../../src/controller/Component.mjs';
import CubeLayout        from '../../../src/layout/Cube.mjs';
import NeoArray          from '../../../src/util/Array.mjs';
import SeoService        from '../service/Seo.mjs';

/**
 * @summary The main controller for the portal's viewport.
 *
 * This controller is the central hub for the portal application. It is responsible for:
 * - **Top-Level Routing:** It uses the `routes` config to map the main URL hash changes (e.g., /home, /learn, /blog) to specific methods, which in turn control which main view is active. It's important to note that while this controller handles the top-level navigation, child views can implement their own nested routing logic (see `Portal.view.learn.MainContainerController` for an example).
 * - **Layout Management:** It manages the main content area's layout, including the "mixed" mode which uses a CubeLayout for slick transitions between views.
 * - **SEO:** It coordinates with the `DocumentHead` main thread addon to update the document's title and meta tags on each route change, ensuring the application is SEO-friendly.
 * - **Multi-Window Coordination:** It handles the disconnection of child windows, such as the live code example previews.
 *
 * @class Portal.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Controller {
    /**
     * Valid values for mainContentLayout
     * @member {String[]} mainContentLayouts=['card','cube','mixed']
     * @protected
     * @static
     */
    static mainContentLayouts = ['card', 'cube', 'mixed']

    static config = {
        /**
         * @member {String} className='Portal.view.ViewportController'
         * @protected
         */
        className: 'Portal.view.ViewportController',
        /**
         * @member {String} ntype='viewport-controller'
         * @protected
         */
        ntype: 'viewport-controller',
        /**
         * @member {Number|null} activeIndex_=null
         * @reactive
         */
        activeIndex_: null,
        /**
         * @member {String|null} defaultHash='/home'
         */
        defaultHash: '/home',
        /**
         * @member {String} mainContentLayout_='card'
         * @reactive
         */
        mainContentLayout_: 'card',
        /**
         * @member {Object} routes
         */
        routes: {
            '/about-us'         : 'onAboutUsRoute',
            '/docs'             : 'onDocsRoute',
            '/examples'         : 'onExamplesRoute',
            '/examples/{itemId}': 'onExamplesRoute',
            '/home'             : 'onHomeRoute',
            '/learn'            : 'onLearnRoute',
            '/learn/{*itemId}'  : 'onLearnRoute',
            '/news'             : 'onNewsRoute',
            '/news/{*itemId}'   : 'onNewsRoute',
            '/services'         : 'onServicesRoute'
        },
        /**
         * Values are: large, medium, small, xSmall
         * @member {String|null} size_=null
         * @reactive
         */
        size_: null
    }

    /**
     * @member {String[]} connectedApps=[]
     */
    connectedApps = []
    /**
     * Internal flag to store the amount of main navigation changes
     * @member {Number} #transitionId=0
     * @private
     */
    #transitionId = 0

    /**
     * Triggered after the size activeIndex got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetActiveIndex(value, oldValue) {
        value !== null && this.updateHeaderToolbar()
    }

    /**
     * Triggered after the mainContentLayout config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetMainContentLayout(value, oldValue) {
        let me                      = this,
            {activeIndex, windowId} = me,
            container               = me.component.getItem('main-content'); // happens before instantiation

        if (oldValue === undefined) {
            // We can not turn this method itself into async and await the addon response,
            // since the container needs its layout right away
            Neo.main.addon.LocalStorage.readLocalStorageItem({
                key: 'mainContentLayout',
                windowId
            }).then(({value}) => {
                if (value && value !== 'card') {
                    me.mainContentLayout = value
                }
            })
        }

        if (value === 'cube') {
            container.layout = {ntype: 'cube', activeIndex, fitContainer: true, hideInactiveCardsOnDestroy: true}
        } else {
            container.layout = {ntype: 'card', activeIndex}
        }

        Neo.main.addon.LocalStorage.updateLocalStorageItem({key: 'mainContentLayout', value, windowId})
    }

    /**
     * Triggered after the size config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetSize(value, oldValue) {
        value && this.updateHeaderToolbar()
    }

    /**
     * Triggered before the mainContentLayout config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetMainContentLayout(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'mainContentLayout')
    }

    /**
     * The route handlers (e.g., onAboutUsRoute, onBlogRoute) are now only responsible for
     * setting the main content index. The logic for updating the document head is centralized
     * in the onHashChange method.
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onAboutUsRoute(params, value, oldValue) {
        this.setMainContentIndex(5)
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
     */
    async onAppDisconnect({appName, windowId}) {
        // Close popup windows when closing or reloading the main window
        if (appName === 'Portal') {
            Neo.Main.windowCloseAll({windowId})
        }
    }

    /**
     * @param {Object} data
     */
    onBlogSearchFieldChange(data) {
        this.getReference('blog-list').filterItems(data)
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        Neo.currentWorker.on({
            disconnect: me.onAppDisconnect,
            scope     : me
        })
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onDocsRoute(params, value, oldValue) {
        this.setMainContentIndex(6)
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onExamplesRoute(params, value, oldValue) {
        this.setMainContentIndex(4)
    }

    /**
     * This is the central handler for all route changes. It is now responsible for delegating
     * the document's head metadata (title and description) updates to the `Portal.service.Seo` service.
     * @param {Object} value               The new route object.
     * @param {String} value.hashString    The new hash string.
     * @param {Object} oldValue            The previous route object.
     * @param {String} oldValue.hashString The previous hash string.
     * @returns {Promise<void>}
     */
    async onHashChange(value, oldValue) {
        await super.onHashChange(value, oldValue);
        SeoService.onRouteChanged(value)
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onHomeRoute(params, value, oldValue) {
        this.setMainContentIndex(0)
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onLearnRoute(params, value, oldValue) {
        this.setMainContentIndex(1)
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onNewsRoute(params, value, oldValue) {
        this.setMainContentIndex(2)
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onServicesRoute(params, value, oldValue) {
        this.setMainContentIndex(3)
    }

    /**
     * This method orchestrates the visual transition between the main content cards.
     * It uses a "mixed" layout mode, which temporarily switches to a CubeLayout for
     * a 3D transition effect, and then back to a CardLayout for performance.
     * @param {Number} index
     */
    async setMainContentIndex(index) {
        let me                               = this,
            {activeIndex, mainContentLayout} = me,
            container                        = me.getReference('main-content'),
            updateLayout                     = true,
            transitionId;

        if (index !== activeIndex) {
            me.activeIndex = index;

            if (
                mainContentLayout === 'mixed' &&
                // skip the initial layout-switch, since we do not need a transition
                Neo.isNumber(activeIndex) &&
                // also skip the layout switch in case the index >= 6, since a cube only has 6 faces
                index < 6 &&
                // also skip the layout switch in case we navigate back from a non-cube item
                activeIndex < 6
            ) {
                me.#transitionId++;

                transitionId = me.#transitionId;
                updateLayout = false;

                // enable "fast clicking" on main nav items => do not replace a cube layout with a new instance of cube
                if (container.layout.ntype !== 'layout-cube') {
                    await container.set({
                        layout: {ntype: 'cube', activeIndex, fitContainer: true, hideInactiveCardsOnDestroy: true}
                    });
                    await me.timeout(20)
                }

                container.layout.activeIndex = index;

                await me.timeout(1100);

                if (transitionId === me.#transitionId) {
                    await container.set({
                        layout: {ntype: 'card', activeIndex: index}
                    });
                    await me.timeout(20)
                }
            }

            if (updateLayout) {
                container.layout.activeIndex = index
            }
        }
    }

    /**
     *
     */
    async updateHeaderToolbar() {
        let me                  = this,
            {activeIndex, size} = me;

        if (Neo.isNumber(activeIndex) && size) {
            let headerSocialIcons = me.getReference('header-social-icons'),
                {cls}             = headerSocialIcons,
                vertical          = size === 'x-small',
                hidden            = activeIndex !== 0 && vertical;

            NeoArray.toggle(cls, 'hide-sidebar', hidden);

            if (!hidden) {
                NeoArray.toggle(cls, 'separate-bar', vertical)
            }

            headerSocialIcons.cls = cls;


            if (hidden && vertical) {
                await me.timeout(200)
            }

            headerSocialIcons.hidden = hidden
        }
    }
}

export default Neo.setupClass(ViewportController);
