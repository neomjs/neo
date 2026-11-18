import Button                  from '../../../../src/button/Base.mjs';
import Container               from '../../../../src/container/Base.mjs';
import Example                 from '../../model/Example.mjs';
import ExampleGroupStore       from '../../store/ExampleGroups.mjs';
import ExampleStore            from '../../store/Examples.mjs';
import GroupPage               from './GroupPage.mjs';
import MainContainerController from './MainContainerController.mjs';
import Overview                from './Overview.mjs';
import StateProvider           from '../../../../src/state/Provider.mjs';

/**
 * @summary The examples section: an overview of the example groups at `/examples`, and a page per group.
 *
 * A group appears while one of its records publishes a card in the selected build (`Portal.model.Example.publishes()`):
 * it gets its entry in the overview and in the banded index (`Portal.view.examples.GroupIndex`), and its page at its
 * route. The section owns the one fetched catalog, the groups store every view of the groups renders
 * (`Portal.store.ExampleGroups`), and the selected build (`catalogMode`).
 * @class Portal.view.examples.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.examples.MainContainer'
         * @protected
         */
        className: 'Portal.view.examples.MainContainer',
        /**
         * @member {Object} bind
         */
        bind: {catalogMode: data => data.catalogMode},
        /**
         * The builds the section can open its examples in. `text` names a build in the menu, `status` in the control.
         * @member {Object[]} buildModes
         */
        buildModes: [
            {id: 'dist_prod', text: 'Production build',  status: 'Running the production build'},
            {id: 'dist_esm',  text: 'ESM build',         status: 'Running the ESM build'},
            {id: 'dist_dev',  text: 'Development build', status: 'Running the development build'},
            {id: 'devmode',   text: 'Dev mode',          status: 'Running in dev mode'}
        ],
        /**
         * The selected build mode, bound to the state provider's `catalogMode`. The group pages filter by it, and the
         * controller publishes the groups that have a card to show in it.
         * @member {String|null} catalogMode_=null
         * @reactive
         */
        catalogMode_: null,
        /**
         * @member {String[]} cls=['portal-examples-main-container']
         * @reactive
         */
        cls: ['portal-examples-main-container'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: MainContainerController,
        /**
         * The single ordered source of the example groups: id (`family`), band, title, route and icon. A group lists its
         * home records and the records whose `alsoIn` names it, and appears while one of them publishes a card in the
         * active build mode (`Portal.model.Example.publishes()`). `sentence` says what the group shows, and `tile` names
         * the record whose cover stands for it. Every value is a literal: `buildScripts/docs/seo/seoJson.mjs` reads this
         * list from the source.
         * @member {Object[]} familyDefinitions
         */
        familyDefinitions: [
            {family: 'grid-table',   band: 'Complex widgets',   title: 'Grid & Table',              route: '/examples/grid',         iconCls: 'fa fa-table',               sentence: 'Up to 100,000 rows × 200 columns, tree grids, locked columns, header groups, cell editing', tile: 'grid-tree-big-data'},
            {family: 'tree',         band: 'Complex widgets',   title: 'Tree',                      route: '/examples/tree',         iconCls: 'fa fa-folder-tree',         sentence: 'Tree lists and accordion trees'},
            {family: 'forms',        band: 'Complex widgets',   title: 'Forms & Fields',            route: '/examples/forms',        iconCls: 'fa fa-keyboard',            sentence: 'Every field type with its configs live, field sets, and a multi-page form app', tile: 'form-app'},
            {family: 'calendar',     band: 'Complex widgets',   title: 'Calendar',                  route: '/examples/calendar',     iconCls: 'fa fa-calendar',            sentence: 'Day, week, month and year views', tile: 'calendar'},
            {family: 'scheduler',    band: 'Complex widgets',   title: 'Scheduler',                 route: '/examples/scheduler',    iconCls: 'fa fa-calendar-week',       sentence: 'Resource bookings on an editable timeline', tile: 'scheduler-basic'},
            {family: 'gantt',        band: 'Complex widgets',   title: 'Gantt',                     route: '/examples/gantt',        iconCls: 'fa fa-chart-gantt',         sentence: 'A project plan with linked, editable tasks', tile: 'gantt-basic'},
            {family: 'board',        band: 'Complex widgets',   title: 'Kanban Board',              route: '/examples/board',        iconCls: 'fa fa-table-columns'},
            {family: 'timeline',     band: 'Complex widgets',   title: 'Timeline',                  route: '/examples/timeline',     iconCls: 'fa fa-timeline',            sentence: 'Interval bars in a grid column', tile: 'timeline-basic'},
            {family: 'tabs',         band: 'Complex widgets',   title: 'Tab Container',             route: '/examples/tabs',         iconCls: 'fa fa-folder-open',         sentence: 'Tab bars on every side; text, icon and badge change live', tile: 'tab-container'},
            {family: 'layouts',      band: 'Complex widgets',   title: 'Containers & Layouts',      route: '/examples/layouts',      iconCls: 'fa fa-table-cells-large',   sentence: 'Card, cube and form layouts, accordions, panels, a full viewport', tile: 'layout-form'},
            {family: 'dashboard',    band: 'Complex widgets',   title: 'Dashboard & Docking',       route: '/examples/dashboard',    iconCls: 'far fa-window-maximize',    sentence: 'Dock, split and group panes, switch named perspectives, tear a pane into its own window', tile: 'dock-choreography'},
            {family: 'drag-drop',    band: 'Complex widgets',   title: 'Drag & Drop',               route: '/examples/drag-drop',    iconCls: 'fa fa-up-down-left-right',  sentence: 'Dragging across the platform: dialogs, dock panes, drops between browser windows', tile: 'multi-window-drag-drop'},
            {family: 'buttons',      band: 'Component shelves', title: 'Buttons, Menus & Toolbars', route: '/examples/buttons',      iconCls: 'fa fa-square-caret-down',   sentence: 'Split and effect buttons, context and list menus, a breadcrumb toolbar'},
            {family: 'lists',        band: 'Component shelves', title: 'Lists & Galleries',         route: '/examples/lists',        iconCls: 'fa fa-list',                sentence: 'Animated, buffered and chip lists, galleries, a 3D helix', tile: 'helix'},
            {family: 'dialogs',      band: 'Component shelves', title: 'Dialogs & Overlays',        route: '/examples/dialogs',      iconCls: 'fa fa-message',             sentence: 'Dialogs, popovers and toasts', tile: 'dialog-drag-drop'},
            {family: 'charts',       band: 'Component shelves', title: 'Charts, Canvas & Maps',     route: '/examples/charts',       iconCls: 'fa fa-chart-line',          sentence: 'A pie chart, canvas and WebGL scenes, a globe and a street map'},
            {family: 'components',   band: 'Component shelves', title: 'More components',           route: '/examples/components',   iconCls: 'fa fa-cubes',               sentence: 'Clock, timer, progress, chips, status badges, a splitter, Markdown, video, a code editor', tile: 'liquid-glass'},
            {family: 'multi-window', band: 'Platform proofs',   title: 'Multi-Window',              route: '/examples/multi-window', iconCls: 'far fa-window-restore',     sentence: 'One app across several browser windows, on shared state', tile: 'shared-covid'},
            {family: 'state',        band: 'Platform proofs',   title: 'State & Data',              route: '/examples/state',        iconCls: 'fa fa-database',            sentence: 'State providers, nested and two-way bindings, a data pipeline', tile: 'state-provider'},
            {family: 'functional',   band: 'Platform proofs',   title: 'Functional Components',     route: '/examples/functional',   iconCls: 'fa fa-code',                sentence: 'Function components and templates beside classes, nested both ways'},
            {family: 'platform',     band: 'Platform proofs',   title: 'Workers & Platform',        route: '/examples/platform',     iconCls: 'fa fa-microchip',           sentence: 'Worker tasks, remote method access, asset preloading, a canvas drawn off the main thread', tile: 'offscreen-canvas'},
            {family: 'apps',         band: 'Applications',      title: 'Apps',                      route: '/examples/apps',         iconCls: 'fa fa-rocket',              sentence: 'Complete applications: a web desktop, a live-price grid, an email client, this website', tile: 'webdesktop'}
        ],
        /**
         * Inactive cards stay in the DOM, hidden: a browser keeps the scroll position of a hidden element, and loses it
         * with a removed one, so each group page and the overview keep their own.
         * @member {Object} layout={ntype:'card',activeIndex:0,removeInactiveCards:false}
         * @reactive
         */
        layout: {ntype: 'card', activeIndex: 0, removeInactiveCards: false},
        /**
         * Owns the one fetched catalog, the groups that publish in the selected build, and that selection.
         * @member {Object} stateProvider
         * @reactive
         */
        stateProvider: {
            module: StateProvider,
            data  : {catalogMode: 'dist_prod'},
            stores: {
                catalog: {module: ExampleStore, url: '../../apps/portal/resources/data/examples.json'},
                groups : {module: ExampleGroupStore}
            }
        }
    }

    /**
     * @summary Moves every group page's `catalogMode` filter to the new build, then republishes the groups for it.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetCatalogMode(value, oldValue) {
        let me = this;

        // During construction no page exists yet: createGroupPage() reads the value it starts with
        if (me.isConstructed) {
            me.getGroupPages().forEach(page => {page.getList().store.getFilter('catalogMode').value = value});
            me.getController().publishGroups()
        }
    }

    /**
     * @summary The build control the overview and every group page show: one button whose menu selects the build,
     * labelled with the build that runs.
     * @returns {Object}
     */
    createBuildControl() {
        let me = this;

        return {
            module      : Button,
            bind        : {text: data => me.buildModes.find(mode => mode.id === data.catalogMode).status},
            cls         : ['portal-examples-build-control'],
            iconCls     : 'fa fa-chevron-down',
            iconPosition: 'right',
            menu        : {items: me.buildModes.map(mode => ({...mode, handler: 'onSelectBuild'}))},
            showOnFocus : false,
            ui          : 'secondary'
        }
    }

    /**
     * @summary The page of one published group: its records in a model-backed Store over the provider's catalog.
     *
     * The store holds the group's home records and the records whose `alsoIn` names it, and keeps only those that
     * publish a card in the build mode (`Portal.model.Example.publishes()`): a record without a cover stays in the
     * catalog and gets no card, so a page never shows a placeholder.
     * @param {Portal.model.ExampleGroup} group
     * @returns {Object}
     */
    createGroupPage(group) {
        const me      = this,
              catalog = me.getCatalogStore();

        return {
            module      : GroupPage,
            buildControl: me.createBuildControl(),
            family      : group.family,
            group,
            reference   : 'examples-' + group.route.slice('/examples/'.length) + '-page',
            listStore   : {
                module  : ExampleStore,
                model   : catalog.model,
                sourceId: catalog.id,
                filters : [
                    {property: 'family',      fields: ['alsoIn', 'family'],                    value: group.family,   filterBy: ({item, value}) => !Example.belongsTo(item, value)},
                    {property: 'catalogMode', fields: ['hidden', 'hiddenIn', 'image', 'urls'], value: me.catalogMode, filterBy: ({item, value}) => !Example.publishes(item, value)}
                ]
            }
        }
    }

    /**
     * @summary Seeds the overview as the first card; the controller adds a page per published group after it.
     * @protected
     */
    createItems() {
        let me = this;

        me.items = [{
            module      : Overview,
            bands       : [...new Set(me.familyDefinitions.map(definition => definition.band))],
            buildControl: me.createBuildControl(),
            groupStore  : me.getGroupStore(),
            reference   : 'examples-overview'
        }];

        super.createItems()
    }

    /**
     * @summary Returns the section-owned unfiltered catalog; the group pages borrow its records.
     * @returns {Portal.store.Examples}
     */
    getCatalogStore() {
        return this.getStateProvider().getStore('catalog')
    }

    /**
     * @summary Returns the page of a group, if the group publishes in the selected build.
     * @param {String} family
     * @returns {Portal.view.examples.GroupPage|null}
     */
    getGroupPage(family) {
        return this.getGroupPages().find(page => page.family === family) || null
    }

    /**
     * @summary Returns the pages of the groups that publish in the selected build.
     * @returns {Portal.view.examples.GroupPage[]}
     */
    getGroupPages() {
        return this.items.filter(item => item instanceof GroupPage)
    }

    /**
     * @summary Returns the groups that publish a card in the selected build, in definition order.
     * @returns {Portal.store.ExampleGroups}
     */
    getGroupStore() {
        return this.getStateProvider().getStore('groups')
    }
}

export default Neo.setupClass(MainContainer);
