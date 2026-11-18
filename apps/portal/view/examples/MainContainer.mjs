import Button                  from '../../../../src/button/Base.mjs';
import Container               from '../../../../src/container/Base.mjs';
import Example                 from '../../model/Example.mjs';
import ExampleGroupStore       from '../../store/ExampleGroups.mjs';
import ExampleStore            from '../../store/Examples.mjs';
import GroupPage               from './GroupPage.mjs';
import MainContainerController from './MainContainerController.mjs';
import StateProvider           from '../../../../src/state/Provider.mjs';

/**
 * @summary The examples section: every published example at `/examples`, and a page per group, all in one shell.
 *
 * A group appears while one of its records publishes a card in the selected build (`Portal.model.Example.publishes()`):
 * it gets its entry in the banded index beside every page (`Portal.view.examples.GroupIndex`), and its page at its
 * route. The section owns the one fetched catalog, the groups store every index renders
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
         * What the page of all examples shows where a group's page shows its record. The controller adds the count
         * of the selected build.
         * @member {Object} allExamples
         */
        allExamples: {
            iconCls : 'fa fa-table-cells-large',
            sentence: 'Grids with 100,000 rows × 200 columns, forms, calendars, a Gantt chart, docking dashboards and multi-window apps, each one running live in your browser',
            title   : 'All examples'
        },
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
         * The selected build mode, bound to the state provider's `catalogMode`. The pages filter by it, and the
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
         * active build mode (`Portal.model.Example.publishes()`). `sentence` says what the group shows. Every value is a
         * literal: `buildScripts/docs/seo/seoJson.mjs` reads this list from the source.
         * @member {Object[]} familyDefinitions
         */
        familyDefinitions: [
            {family: 'grid-table',   band: 'Complex widgets',   title: 'Grid & Table',              route: '/examples/grid',         iconCls: 'fa fa-table',               sentence: 'Up to 100,000 rows × 200 columns, tree grids, locked columns, header groups, cell editing'},
            {family: 'tree',         band: 'Complex widgets',   title: 'Tree',                      route: '/examples/tree',         iconCls: 'fa fa-folder-tree',         sentence: 'Tree lists and accordion trees'},
            {family: 'forms',        band: 'Complex widgets',   title: 'Forms & Fields',            route: '/examples/forms',        iconCls: 'fa fa-keyboard',            sentence: 'Every field type with its configs live, field sets, and a multi-page form app'},
            {family: 'calendar',     band: 'Complex widgets',   title: 'Calendar',                  route: '/examples/calendar',     iconCls: 'fa fa-calendar',            sentence: 'Day, week, month and year views'},
            {family: 'scheduler',    band: 'Complex widgets',   title: 'Scheduler',                 route: '/examples/scheduler',    iconCls: 'fa fa-calendar-week',       sentence: 'Resource bookings on an editable timeline'},
            {family: 'gantt',        band: 'Complex widgets',   title: 'Gantt',                     route: '/examples/gantt',        iconCls: 'fa fa-chart-gantt',         sentence: 'A project plan with linked, editable tasks'},
            {family: 'board',        band: 'Complex widgets',   title: 'Kanban Board',              route: '/examples/board',        iconCls: 'fa fa-table-columns'},
            {family: 'timeline',     band: 'Complex widgets',   title: 'Timeline',                  route: '/examples/timeline',     iconCls: 'fa fa-timeline',            sentence: 'Interval bars in a grid column'},
            {family: 'tabs',         band: 'Complex widgets',   title: 'Tab Container',             route: '/examples/tabs',         iconCls: 'fa fa-folder-open',         sentence: 'Tab bars on every side; text, icon and badge change live'},
            {family: 'layouts',      band: 'Complex widgets',   title: 'Containers & Layouts',      route: '/examples/layouts',      iconCls: 'fa fa-table-cells-large',   sentence: 'Card, cube and form layouts, accordions, panels, a full viewport'},
            {family: 'dashboard',    band: 'Complex widgets',   title: 'Dashboard & Docking',       route: '/examples/dashboard',    iconCls: 'far fa-window-maximize',    sentence: 'Dock, split and group panes, switch named perspectives, tear a pane into its own window'},
            {family: 'drag-drop',    band: 'Complex widgets',   title: 'Drag & Drop',               route: '/examples/drag-drop',    iconCls: 'fa fa-up-down-left-right',  sentence: 'Dragging across the platform: dialogs, dock panes, drops between browser windows'},
            {family: 'buttons',      band: 'Component shelves', title: 'Buttons, Menus & Toolbars', route: '/examples/buttons',      iconCls: 'fa fa-square-caret-down',   sentence: 'Split and effect buttons, context and list menus, a breadcrumb toolbar'},
            {family: 'lists',        band: 'Component shelves', title: 'Lists & Galleries',         route: '/examples/lists',        iconCls: 'fa fa-list',                sentence: 'Animated, buffered and chip lists, galleries, a 3D helix'},
            {family: 'dialogs',      band: 'Component shelves', title: 'Dialogs & Overlays',        route: '/examples/dialogs',      iconCls: 'fa fa-message',             sentence: 'Dialogs, popovers and toasts'},
            {family: 'charts',       band: 'Component shelves', title: 'Charts, Canvas & Maps',     route: '/examples/charts',       iconCls: 'fa fa-chart-line',          sentence: 'A pie chart, canvas and WebGL scenes, a globe and a street map'},
            {family: 'components',   band: 'Component shelves', title: 'More components',           route: '/examples/components',   iconCls: 'fa fa-cubes',               sentence: 'Clock, timer, progress, chips, status badges, a splitter, Markdown, video, a code editor'},
            {family: 'multi-window', band: 'Platform proofs',   title: 'Multi-Window',              route: '/examples/multi-window', iconCls: 'far fa-window-restore',     sentence: 'One app across several browser windows, on shared state'},
            {family: 'state',        band: 'Platform proofs',   title: 'State & Data',              route: '/examples/state',        iconCls: 'fa fa-database',            sentence: 'State providers, nested and two-way bindings, a data pipeline'},
            {family: 'functional',   band: 'Platform proofs',   title: 'Functional Components',     route: '/examples/functional',   iconCls: 'fa fa-code',                sentence: 'Function components and templates beside classes, nested both ways'},
            {family: 'platform',     band: 'Platform proofs',   title: 'Workers & Platform',        route: '/examples/platform',     iconCls: 'fa fa-microchip',           sentence: 'Worker tasks, remote method access, asset preloading, a canvas drawn off the main thread'},
            {family: 'apps',         band: 'Applications',      title: 'Apps',                      route: '/examples/apps',         iconCls: 'fa fa-rocket',              sentence: 'Complete applications: a web desktop, a live-price grid, an email client, this website'}
        ],
        /**
         * Inactive cards stay in the DOM, hidden: a browser keeps the scroll position of a hidden element, and loses it
         * with a removed one, so each page keeps its own.
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
     * @summary Moves every page's `catalogMode` filter to the new build, then republishes the groups for it.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetCatalogMode(value, oldValue) {
        let me = this;

        // During construction no page exists yet: createGroupPage() reads the value it starts with
        if (me.isConstructed) {
            me.items.forEach(page => {page.getList().store.getFilter('catalogMode').value = value});
            me.getController().publishGroups()
        }
    }

    /**
     * @summary The build control every page shows: one button whose menu selects the build, labelled with the build
     * that runs.
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
     * @summary A page of one published group, or of all examples (`allExamples`, no `family`), over the catalog.
     *
     * Its model-backed Store keeps the records that publish a card in the build (`Portal.model.Example.publishes()`):
     * a record without a cover gets no card, so a page never shows a placeholder. A group's page holds its home
     * records and those whose `alsoIn` names it; the page of all examples holds every record once, in catalog order.
     * @param {Portal.model.ExampleGroup|Object} group
     * @returns {Object}
     */
    createGroupPage(group) {
        const me       = this,
              catalog  = me.getCatalogStore(),
              {family} = group;

        return {
            module      : GroupPage,
            buildControl: me.createBuildControl(),
            family      : family || null,
            group,
            reference   : family ? 'examples-' + group.route.slice('/examples/'.length) + '-page' : 'examples-all-page',
            listStore   : {
                module  : ExampleStore,
                model   : catalog.model,
                sourceId: catalog.id,
                filters : [
                    ...(family ? [{property: 'family', fields: ['alsoIn', 'family'], value: family, filterBy: ({item, value}) => !Example.belongsTo(item, value)}] : []),
                    {property: 'catalogMode', fields: ['hidden', 'hiddenIn', 'image', 'urls'], value: me.catalogMode, filterBy: ({item, value}) => !Example.publishes(item, value)}
                ]
            }
        }
    }

    /**
     * @summary Returns the page of all examples, once the catalog has loaded.
     * @returns {Portal.view.examples.GroupPage|null}
     */
    getAllPage() {
        return this.items.find(page => !page.family) || null
    }

    /**
     * @summary Returns the section-owned unfiltered catalog; the pages borrow its records.
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
        return this.items.find(page => page.family === family) || null
    }

    /**
     * @summary Returns the pages of the groups that publish in the selected build.
     * @returns {Portal.view.examples.GroupPage[]}
     */
    getGroupPages() {
        return this.items.filter(page => page.family)
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
