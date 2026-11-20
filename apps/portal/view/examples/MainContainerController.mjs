import Component from '../../../../src/controller/Component.mjs';
import Example   from '../../model/Example.mjs';

/**
 * @summary Routes the overview and the group pages, publishes the groups of the selected build, and shares one build
 * selection. The route is the one writer of the open group: no view writes the hash.
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
     * The group the route names, or null for the overview. A group that does not publish in the selected build shows
     * the overview, and its page while it publishes again.
     * @member {String|null} openFamily=null
     */
    openFamily = null
    /**
     * Serializes route settlement after the catalog load.
     * @member {Number} routeGeneration=0
     */
    routeGeneration = 0

    /**
     * @summary Filters published catalog entries across titles, captions, component, group titles and `keywords`,
     * updates `GroupIndex` per-group match counts, and renders grouped matches in `SearchResults` without changing URL history.
     * @param {String} query
     */
    applyFindQuery(query) {
        const me            = this,
              view          = me.component,
              terms         = Example.tokenizeSearchText(query),
              searchResults = view.getSearchResults(),
              stage         = view.getStage();

        if (terms.length === 0) {
            searchResults.clearResults();
            me.getStateProvider().setData({matchCounts: null});
            me.showOpenGroup();
            return
        }

        const {catalogMode, familyDefinitions} = view,
              groupTitles                      = Object.fromEntries(familyDefinitions.map(definition => [definition.family, definition.title])),
              published                        = view.getCatalogStore().items.filter(record => Example.publishes(record, catalogMode)),
              matched                          = published.filter(record => Example.matchesQuery(record, terms, groupTitles)),
              matchCounts                      = new Map(),
              resultGroups                     = [];

        view.getGroupStore().forEach(group => {
            const home  = matched.filter(record => record.family === group.family).length,
                  cross = matched.filter(record => record.alsoIn?.includes(group.family)).length;

            matchCounts.set(group.family, {
                home,
                cross,
                total: home + cross
            })
        });

        familyDefinitions.forEach(definition => {
            const records = matched.filter(record => record.family === definition.family);

            if (records.length > 0) {
                resultGroups.push({definition, records})
            }
        });

        me.getStateProvider().setData({matchCounts});
        searchResults.showResults({
            query       : query.trim(),
            groups      : resultGroups,
            totalMatches: matched.length,
            catalogMode
        });

        view.getGroupIndex().activeFamily = null;
        view.getSheet().activeFamily      = null;
        stage.layout.activeIndex          = stage.indexOf(searchResults)
    }

    /**
     * @summary Clears the shared find query and per-group match counts, optionally returning focus out of the find field.
     * @param {Object} [opts={}]
     * @param {Boolean} [opts.restoreFocus=false]
     * @param {String|null} [opts.sourceFieldId=null]
     */
    clearFind({restoreFocus=false, sourceFieldId=null}={}) {
        const me = this;

        me.getStateProvider().setData({
            findQuery  : '',
            matchCounts: null
        });

        restoreFocus && me.component.restoreFocusAfterFind(sourceFieldId)
    }

    /**
     * @summary Clears active filtering when clicking the SearchResults Clear button.
     */
    onClearFind() {
        this.clearFind({restoreFocus: true})
    }

    /**
     * @summary Updates shared `findQuery` state as the visitor types without modifying browser history.
     * @param {Object} data
     */
    onFindFieldChange(data) {
        this.getStateProvider().setData({findQuery: data.value || ''})
    }

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
     * the selected build to the overview.
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

        if (view.findQuery) {
            me.clearFind()
        } else {
            me.showOpenGroup()
        }
    }

    /**
     * @summary Updates every page and the overview through the section's shared build state.
     * @param {Object} record Selected native menu record.
     */
    onSelectBuild(record) {
        if (this.component.buildModes.some(mode => mode.id === record.id)) {
            this.getStateProvider().setData({catalogMode: record.id})
        }
    }

    /**
     * @summary Counts what each group publishes in the selected build, writes the groups that publish to the groups
     * store, and gives each of them a page.
     *
     * `count` holds a group's home records, so every example counts once and the counts add up to the overview's
     * headline. The records other groups lend it through `alsoIn` show on its page and count as `crossCount`; the list
     * and the page show the sum of both. A group with neither gets no entry and no page. Runs on each catalog load and
     * build selection.
     */
    publishGroups() {
        const view                             = this.component,
              {catalogMode, familyDefinitions} = view,
              stage                            = view.getStage(),
              published                        = view.getCatalogStore().items.filter(record => Example.publishes(record, catalogMode)),
              groupStore                       = view.getGroupStore(),
              groups                           = [];

        familyDefinitions.forEach(definition => {
            const {family} = definition,
                  home     = published.filter(record => record.family === family),
                  cross    = published.filter(record => record.alsoIn?.includes(family)),
                  tiles    = [...home, ...cross].filter(record => record.kind === 'component');

            if (home.length + cross.length > 0) {
                groups.push({...definition, count: home.length, crossCount: cross.length, tileCount: tiles.length})
            }
        });

        groupStore.data = groups;

        view.getGroupPages().forEach(page => {
            const group = groupStore.get(page.family);

            group ? page.group = group : stage.remove(page)
        });

        groupStore.forEach(group => {
            view.getGroupPage(group.family) || stage.add(view.createGroupPage(group))
        });

        if (Example.tokenizeSearchText(view.findQuery).length > 0) {
            this.applyFindQuery(view.findQuery)
        } else {
            this.showOpenGroup()
        }
    }

    /**
     * @summary Shows the open group's page in the stage, or `"Start here"` (`Overview`), and syncs hoisted navigation.
     */
    showOpenGroup() {
        const view  = this.component,
              stage = view.getStage(),
              page  = this.openFamily && view.getGroupPage(this.openFamily);

        view.sheetOpen = false;
        view.syncNavigation(page?.group || null);
        stage.layout.activeIndex = page ? stage.indexOf(page) : 0
    }
}

export default Neo.setupClass(MainContainerController);
