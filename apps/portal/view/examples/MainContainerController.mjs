import Component from '../../../../src/controller/Component.mjs';
import Example   from '../../model/Example.mjs';

/**
 * @summary Routes the page of all examples and the group pages, publishes the groups of the selected build, and shares
 * one build selection. The route is the one writer of the open group: no view writes the hash.
 * @class Portal.view.examples.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Component {
    static config = {
        /**
         * @member {String} className='Portal.view.examples.MainContainerController'
         * @protected
         */
        className: 'Portal.view.examples.MainContainerController',
        /**
         * @member {Object} routes
         */
        routes: {
            '/examples'         : 'onExamplesRoute',
            '/examples/{itemId}': 'onExamplesRoute'
        }
    }

    /**
     * Shares the in-flight catalog read across concurrent routes.
     * @member {Promise|null} catalogLoadPromise=null
     */
    catalogLoadPromise = null
    /**
     * The group the route names, or null for all examples. A group that does not publish in the selected build shows
     * the page of all examples, and its own page while it publishes again.
     * @member {String|null} openFamily=null
     */
    openFamily = null
    /**
     * Serializes route settlement after the catalog load.
     * @member {Number} routeGeneration=0
     */
    routeGeneration = 0

    /**
     * @summary Publishes the groups once the canonical catalog has loaded, and again on every later load.
     */
    onComponentConstructed() {
        const store = this.component.getCatalogStore();

        store.on('load', this.publishGroups, this);
        store.getCount() && this.publishGroups()
    }

    /**
     * @summary Resolves a group route to its page, and old build routes, unknown groups and groups without a card in
     * the selected build to the page of all examples.
     * @param {Object} [params={}]
     */
    async onExamplesRoute(params={}) {
        const me         = this,
              view       = me.component,
              generation = ++me.routeGeneration,
              legacyMode = view.buildModes.find(mode => mode.id === params.itemId),
              store      = view.getCatalogStore();

        if (legacyMode) me.getStateProvider().setData({catalogMode: legacyMode.id});
        if (!store.isLoaded) {
            me.catalogLoadPromise ||= store.load().finally(() => {me.catalogLoadPromise = null});
            await me.catalogLoadPromise
        }
        if (me.isDestroyed || generation !== me.routeGeneration) return;

        const route = !legacyMode && params.itemId ? '/examples/' + params.itemId : null;

        me.openFamily = route && view.familyDefinitions.find(definition => definition.route === route)?.family || null;
        me.showOpenGroup()
    }

    /**
     * @summary Updates every page through the section's shared build state.
     * @param {Object} record Selected native menu record.
     */
    onSelectBuild(record) {
        if (this.component.buildModes.some(mode => mode.id === record.id)) {
            this.getStateProvider().setData({catalogMode: record.id})
        }
    }

    /**
     * @summary Counts what each group publishes in the selected build, writes the groups that publish to the groups
     * store, and gives each of them a page beside the page of all examples.
     *
     * A group counts its home records, so every example counts once and the counts add up to the count of all
     * examples. The records other groups lend it through `alsoIn` show on its page and count as `crossCount`. A group
     * with neither gets no entry and no page. Runs on each catalog load and build selection.
     */
    publishGroups() {
        const view                             = this.component,
              {catalogMode, familyDefinitions} = view,
              published                        = view.getCatalogStore().items.filter(record => Example.publishes(record, catalogMode)),
              all                              = {...view.allExamples, count: published.length, crossCount: 0},
              allPage                          = view.getAllPage(),
              groupStore                       = view.getGroupStore(),
              groups                           = [];

        familyDefinitions.forEach(definition => {
            const {family}   = definition,
                  count      = published.filter(record => record.family === family).length,
                  crossCount = published.filter(record => record.alsoIn?.includes(family)).length;

            count + crossCount > 0 && groups.push({...definition, count, crossCount})
        });

        groupStore.data = groups;

        // The first card: where a route without a published group lands
        allPage ? allPage.group = all : view.add(view.createGroupPage(all));

        view.getGroupPages().forEach(page => {
            const group = groupStore.get(page.family);

            group ? page.group = group : view.remove(page)
        });

        groupStore.forEach(group => {
            view.getGroupPage(group.family) || view.add(view.createGroupPage(group))
        });

        this.showOpenGroup()
    }

    /**
     * @summary Shows the page of the open group, or the page of all examples when no group is open or it does not
     * publish. Pages come and go with the build, so the card is found by its group each time, never kept as an index.
     */
    showOpenGroup() {
        const view = this.component,
              page = this.openFamily && view.getGroupPage(this.openFamily);

        // A sheet left open on a page the reader navigated away from is closed when they return
        view.items.forEach(item => {item.sheetOpen = false});
        view.layout.activeIndex = page ? view.indexOf(page) : 0
    }
}

export default Neo.setupClass(MainContainerController);
