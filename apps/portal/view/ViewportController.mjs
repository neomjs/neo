import Controller        from '../../../src/controller/Component.mjs';
import CubeLayout        from '../../../src/layout/Cube.mjs';
import {getSearchParams} from '../Util.mjs';

/**
 * @class Portal.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Controller {
    /**
     * Valid values for mainContentLayout
     * @member {String[]} iconPositions=['top','right','bottom','left']
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
         * @member {Number|null} activeIndex=null
         */
        activeIndex: null,
        /**
         * @member {String|null} defaultHash='/home'
         */
        defaultHash: '/home',
        /**
         * @member {String} mainContentLayout_='cube'
         */
        mainContentLayout_: 'mixed',
        /**
         * @member {Object} routes
         */
        routes: {
            '/blog'          : 'onBlogRoute',
            '/docs'          : 'onDocsRoute',
            '/home'          : 'onHomeRoute',
            '/learn'         : 'onLearnRoute',
            '/learn/{itemId}': 'onLearnRoute',
            '/services'      : 'onServicesRoute',
        }
    }

    /**
     * @member {String[]} connectedApps=[]
     */
    connectedApps = []

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
     * Triggered before the mainContentLayout config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetMainContentLayout(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'mainContentLayout')
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
                tabContainer    = livePreview.tabContainer,
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
                tabContainer    = livePreview.tabContainer,
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
        this.setMainContentIndex(4)
    }

    /**
     * @param {Number} index
     */
    async setMainContentIndex(index) {
        let me                               = this,
            {activeIndex, mainContentLayout} = me,
            container                        = me.getReference('main-content'),
            updateLayout                     = true;

        if (index !== activeIndex) {
            // skip the initial layout-switch, since we do not need a transition
            if (mainContentLayout === 'mixed' && Neo.isNumber(activeIndex)) {
                updateLayout = false;

                container.wrapperStyle; // todo: without accessing the getter, the flex value can get lost.

                container.layout = {ntype: 'cube', activeIndex, fitContainer: true, hideInactiveCardsOnDestroy: true};

                await me.timeout(200);

                container.layout.activeIndex = index;

                await me.timeout(1100);

                container.layout = {ntype: 'card', activeIndex: index}
            }

            if (updateLayout) {
                container.layout.activeIndex = index
            }

            me.activeIndex = index
        }
    }
}

Neo.setupClass(ViewportController);

export default ViewportController;
