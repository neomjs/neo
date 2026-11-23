import Controller        from '../../../../src/controller/Component.mjs';
import CubeLayoutButton  from './CubeLayoutButton.mjs'; // required for the Portal App .md file
import SeoService        from '../../service/Seo.mjs';
import {getSearchParams} from '../../Util.mjs';

/**
 * @class Portal.view.learn.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.MainContainerController'
         * @protected
         */
        className: 'Portal.view.learn.MainContainerController',
        /**
         * @member {Object} routes
         */
        routes: {
            '/learn'          : 'onRouteDefault',
            '/learn/{*itemId}': 'onRouteLearnItem'
        }
    }

    /** @member {Number} #learnRouteRequest Identifies the latest Learn navigation while the tree loads. */
    #learnRouteRequest = 0

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let {windowId} = this;

        Neo.Main.getByPath({
            path: 'location.search',
            windowId
        }).then(data => {
            this.setState({
                deck: getSearchParams(data).deck || 'learnneo'
            })
        })
    }

    /**
     * @summary Navigates to a learn tree item, honoring an explicit `record.route` override when present.
     * @param {String} learnItem
     */
    navigateTo(learnItem) {
        let record = this.getStateProvider()?.getStore('tree')?.get(learnItem);

        Neo.Main.setRoute({
            value   : record?.route || `/learn/${learnItem}`,
            windowId: this.component.windowId
        })
    }


    /**
     * @param {Object} data
     */
    onIntersect(data) {
        let panel    = this.getReference('page-sections-container'),
            list     = panel.list,
            record   = list.store.get(parseInt(data.data.recordId));

        if (record && !list.isAnimating) {
            list.selectionModel.select(record)
        }
    }

    /**
     * @param {Object} data
     */
    onNextPageButtonClick(data) {
        this.navigateTo(this.getStateProvider().getData('nextPageRecord').id)
    }

    /**
     * @param {Object} data
     */
    onPageSectionsToggleButtonClick(data) {
        this.getReference('page-sections-container').toggleCls('neo-expanded')
    }

    /**
     * @param {Object} data
     */
    onPreviousPageButtonClick(data) {
        this.navigateTo(this.getStateProvider().getData('previousPageRecord').id)
    }

    /**
     * @summary Selects the default intro topic on first visit, or restores tree selection to `currentPageRecord`.
     * @param {Object} data
     */
    onRouteDefault(data) {
        let currentPageRecord = this.getStateProvider().data.currentPageRecord;

        this.#learnRouteRequest++;
        this.getReference('content')?.setRouteSection(currentPageRecord);

        if (!currentPageRecord) {
            this.onRouteLearnItem({itemId: 'benefits/Introduction'})
        } else {
            this.getReference('tree')?.selectionModel.select(currentPageRecord)
        }
    }

    /**
     * @summary Selects the requested article and section and sets the window title.
     * @param {Object} data
     * @param {String} data.itemId
     * @param {Object} value
     * @param {Object} oldValue
     */
    async onRouteLearnItem({itemId}, value, oldValue) {
        let stateProvider = this.getStateProvider(),
            store         = stateProvider.getStore('tree'),
            tree          = this.getReference('tree');

        // The route's `{*itemId}` compiles to `(.*)`, so a deep link to a section arrives with its
        // fragment attached: `guides/x/Page#some-heading`. Record ids never contain one, so passing it
        // through means an exact-lookup miss and a blank page — the id has to be separated from the
        // in-page anchor here. Route params are the app's to interpret; widening the shared router's
        // wildcard would change capture semantics for every routed app.
        const request              = ++this.#learnRouteRequest,
              [recordId, fragment] = itemId.split('#', 2),
              route                = value?.hashString || `/learn/${recordId}`,
              navigationId         = value?.hashString
                  ? SeoService.registerNavigation({route: value.hashString, windowId: this.windowId})
                  : undefined;

        // Ensure the tree has the correct route prefix for this controller context
        if (tree.routePrefix !== '/learn') {
            tree.routePrefix = '/learn'
        }

        const select = async () => {
            if (request !== this.#learnRouteRequest || this.isDestroyed) return;

            const record = store.get(recordId);

            if (record?.route) {
                Neo.Main.setRoute({
                    value   : record.route,
                    windowId: this.component.windowId
                });
                return
            }

            this.getReference('content')?.setRouteSection(record, fragment);
            stateProvider.data.currentPageRecord = record;

            if (record?.name) {
                SeoService.setRouteTitle({
                    navigationId,
                    route,
                    title   : /neo\.mjs/i.test(record.name) ? record.name : `${record.name} - Neo.mjs`,
                    windowId: this.windowId
                })
            }

            if (!oldValue?.hashString?.startsWith('/learn')) {
                await tree.expandAndScrollToItem(recordId)
            } else {
                tree.expandParents(recordId)
            }
        };

        if (store.getCount() > 0) {
            await select()
        } else {
            store.on({
                load : select,
                delay: 10,
                once : true
            })
        }
    }

    /**
     * @summary Synchronizes the contents selection and reveals an explicitly routed heading.
     * @param {Object} data
     * @param {Object|null} data.record
     * @param {Boolean} [data.scrollToHeading=true]
     */
    onRouteSection({record, scrollToHeading=true}) {
        const {list} = this.getReference('page-sections-container');

        if (record) {
            list.selectionModel.select(record);

            if (scrollToHeading) return list.onSelectionChange({record})
        } else {
            list.selectionModel.deselectAll()
        }
    }

    /**
     * @param {Object} data
     */
    onSideNavToggleButtonClick(data) {
        this.getReference('sidenav-container').toggleCls('neo-expanded')
    }
}

export default Neo.setupClass(MainContainerController);
