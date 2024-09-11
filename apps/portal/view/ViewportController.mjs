import Controller        from '../../../src/controller/Component.mjs';
import CubeLayout        from '../../../src/layout/Cube.mjs';
import NeoArray          from '../../../src/util/Array.mjs';
import {getSearchParams} from '../Util.mjs';

/**
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
         */
        activeIndex_: null,
        /**
         * @member {String|null} defaultHash='/home'
         */
        defaultHash: '/home',
        /**
         * @member {String} mainContentLayout_='mixed'
         */
        mainContentLayout_: 'mixed',
        /**
         * @member {Object} routes
         */
        routes: {
            '/about-us'         : 'onAboutUsRoute',
            '/blog'             : 'onBlogRoute',
            '/docs'             : 'onDocsRoute',
            '/examples'         : 'onExamplesRoute',
            '/examples/{itemId}': 'onExamplesRoute',
            '/home'             : 'onHomeRoute',
            '/learn'            : 'onLearnRoute',
            '/learn/{itemId}'   : 'onLearnRoute',
            '/services'         : 'onServicesRoute'
        },
        /**
         * Values are: large, medium, small, xSmall
         * @member {String|null} size_=null
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
        let {activeIndex} = this,
            container     = this.component.getItem('main-content'); // happens before instantiation

        if (value === 'cube') {
            container.layout = {ntype: 'cube', activeIndex, fitContainer: true, hideInactiveCardsOnDestroy: true}
        } else {
            container.layout = {ntype: 'card', activeIndex}
        }
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
    async onAppConnect(data) {
        let {appName, windowId} = data,
            app                 = Neo.apps[appName],
            mainView            = app.mainView;

        if (appName === 'PortalPreview') {
            let searchString    = await Neo.Main.getByPath({path: 'location.search', windowId}),
                livePreviewId   = getSearchParams(searchString).id,
                livePreview     = Neo.getComponent(livePreviewId),
                sourceContainer = livePreview.getReference('preview'),
                {tabContainer}  = livePreview,
                sourceView      = sourceContainer.removeAt(0, false);

            livePreview.previewContainer = mainView;
            mainView.add(sourceView);

            tabContainer.activeIndex = 0; // switch to the source view

            tabContainer.getTabAtIndex(1).disabled = true
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
     */
    async onAppDisconnect(data) {
        let {appName, windowId} = data,
            app                 = Neo.apps[appName],
            mainView            = app.mainView;

        // Closing a code preview window needs to drop the preview back into the related main app
        if (appName === 'PortalPreview') {
            let searchString    = await Neo.Main.getByPath({path: 'location.search', windowId}),
                livePreviewId   = getSearchParams(searchString).id,
                livePreview     = Neo.getComponent(livePreviewId),
                sourceContainer = livePreview.getReference('preview'),
                {tabContainer}  = livePreview,
                sourceView      = mainView.removeAt(0, false);

            livePreview.previewContainer = null;
            sourceContainer.add(sourceView);

            livePreview.disableRunSource = true; // will get reset after the next activeIndex change (async)
            tabContainer.activeIndex = 1;        // switch to the source view

            livePreview.getReference('popout-window-button').disabled = false;
            tabContainer.getTabAtIndex(1).disabled = false
        }
        // Close popup windows when closing or reloading the main window
        else if (appName === 'Portal') {
            Neo.Main.windowCloseAll({windowId})
        }
    }

    /**
     * @param {Object[]} records
     */
    onBlogPostStoreLoad(records) {
        this.getReference('blog-header-button').badgeText = records.length + ''
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onBlogRoute(params, value, oldValue) {
        this.setMainContentIndex(2)
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
            connect   : me.onAppConnect,
            disconnect: me.onAppDisconnect,
            scope     : me
        });
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
    onServicesRoute(params, value, oldValue) {
        this.setMainContentIndex(3)
    }

    /**
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
                    container.layout = {ntype: 'cube', activeIndex, fitContainer: true, hideInactiveCardsOnDestroy: true}
                }

                await me.timeout(200);

                container.layout.activeIndex = index;

                await me.timeout(1100);

                if (transitionId === me.#transitionId) {
                    container.layout = {ntype: 'card', activeIndex: index}
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

            headerSocialIcons.cls = cls


            if (hidden && vertical) {
                await me.timeout(200)
            }

            headerSocialIcons.hidden = hidden;
        }
    }
}

export default Neo.setupClass(ViewportController);
