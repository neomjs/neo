import Component from '../../../../src/controller/Component.mjs';

/**
 * @summary Routes published families and shares one build selection without mirroring tab indexes.
 * @class Portal.view.examples.TabContainerController
 * @extends Neo.controller.Component
 */
class TabContainerController extends Component {
    static config = {
        /**
         * @member {String} className='Portal.view.examples.TabContainerController'
         * @protected
         */
        className: 'Portal.view.examples.TabContainerController',
        /**
         * @member {Object} routes
         */
        routes: {
            '/examples'         : 'onExamplesRoute',
            '/examples/{itemId}': 'onExamplesRoute'
        }
    }

    /**
     * Serializes route settlement after the catalog load.
     * @member {Number} routeGeneration=0
     */
    routeGeneration = 0

    /**
     * Shares the in-flight catalog read across concurrent routes.
     * @member {Promise|null} catalogLoadPromise=null
     */
    catalogLoadPromise = null

    /**
     * @summary Reconciles family availability after the canonical catalog has loaded.
     */
    onComponentConstructed() {
        const store = this.component.getCatalogStore();

        store.on('load', this.onCatalogLoad, this);
        store.getCount() && this.onCatalogLoad()
    }

    /**
     * @summary Publishes only families with records, deriving every header from the view's definitions.
     */
    onCatalogLoad() {
        const view      = this.component,
              families  = new Set(),
              available = new Set();

        view.getCatalogStore().forEach(record => families.add(record.family));
        view.familyDefinitions.forEach(definition => {
            if (definition.family === null || families.has(definition.family)) available.add(definition.route)
        });

        view.getTabButtons().slice().reverse().forEach(button => {
            if (!available.has(button.route)) view.removeAt(button.index)
        });

        view.familyDefinitions.forEach((definition, rank) => {
            if (available.has(definition.route) && !view.getTabButtons().some(button => button.route === definition.route)) {
                const next = view.getTabButtons().find(button => view.familyDefinitions.findIndex(item => item.route === button.route) > rank);
                view.insert(next ? next.index : view.getCount(), view.createFamilyItem(definition))
            }
        })
    }

    /**
     * @summary Resolves old build routes to Featured and absent family routes to the same fallback.
     * @param {Object} [params={}]
     */
    async onExamplesRoute(params={}) {
        const view       = this.component,
              generation = ++this.routeGeneration,
              legacyMode = view.buildModes.find(mode => mode.id === params.itemId),
              store      = view.getCatalogStore();

        if (legacyMode) this.getStateProvider().setData({catalogMode: legacyMode.id});
        if (!store.isLoaded) {
            this.catalogLoadPromise ||= store.load().finally(() => {this.catalogLoadPromise = null});
            await this.catalogLoadPromise
        }
        if (this.isDestroyed || generation !== this.routeGeneration) return;

        const route = !legacyMode && params.itemId ? '/examples/' + params.itemId : '/examples',
              tab   = view.getTabButtons().find(button => button.route === route)
                  || view.getTabButtons().find(button => button.route === '/examples');

        view.activeIndex = tab.index
    }

    /**
     * @summary Updates every list through the section's shared build state.
     * @param {Object} record Selected native menu record.
     */
    onSelectBuild(record) {
        if (this.component.buildModes.some(mode => mode.id === record.id)) {
            this.getStateProvider().setData({catalogMode: record.id})
        }
    }
}

export default Neo.setupClass(TabContainerController);
