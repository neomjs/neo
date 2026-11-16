import Button                 from '../../../../src/button/Base.mjs';
import StateProvider          from '../../../../src/state/Provider.mjs';
import Example                from '../../model/Example.mjs';
import ExampleStore           from '../../store/Examples.mjs';
import List                   from './List.mjs';
import TabContainer           from '../shared/TabContainer.mjs';
import TabContainerController from './TabContainerController.mjs';

/**
 * @summary Publishes the example groups that have a card to show in the selected build, and that selection.
 * @class Portal.view.examples.TabContainer
 * @extends Portal.view.shared.TabContainer
 */
class ExamplesTabContainer extends TabContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.examples.TabContainer'
         * @protected
         */
        className: 'Portal.view.examples.TabContainer',
        /**
         * @member {Number|null} activeIndex=null
         * @reactive
         */
        activeIndex: null,
        /**
         * @member {Object} bind
         */
        bind: {catalogMode: data => data.catalogMode},
        /**
         * The selected build mode, bound to the state provider's `catalogMode`. The group stores filter by it, and the
         * controller publishes the groups that have a card to show in it.
         * @member {String|null} catalogMode_=null
         * @reactive
         */
        catalogMode_: null,
        /**
         * @member {Neo.controller.Component} controller=TabContainerController
         * @reactive
         */
        controller: TabContainerController,
        /**
         * @member {Boolean} dragResortable=true
         * @reactive
         */
        dragResortable: true,
        /**
         * The single ordered source of the example groups: id (`family`), band, title, route and tab icon.
         * Featured comes first and is no group: it lists the records marked `featured`. A group lists its home
         * records and the records whose `alsoIn` names it, and gets a tab while one of them publishes a card in the
         * active build mode (`Portal.model.Example.publishes()`). An entry may also carry a `sentence` and the `tile`
         * record whose cover stands for the group. Every value is a literal: `buildScripts/docs/seo/seoJson.mjs`
         * reads this list from the source.
         * @member {Object[]} familyDefinitions
         */
        familyDefinitions: [
            {family: null,           band: null,                title: 'Featured',                  route: '/examples',              iconCls: 'fa fa-star'},
            {family: 'grid-table',   band: 'Complex widgets',   title: 'Grid & Table',              route: '/examples/grid',         iconCls: 'fa fa-table'},
            {family: 'tree',         band: 'Complex widgets',   title: 'Tree',                      route: '/examples/tree',         iconCls: 'fa fa-folder-tree'},
            {family: 'forms',        band: 'Complex widgets',   title: 'Forms & Fields',            route: '/examples/forms',        iconCls: 'fa fa-keyboard'},
            {family: 'calendar',     band: 'Complex widgets',   title: 'Calendar',                  route: '/examples/calendar',     iconCls: 'fa fa-calendar'},
            {family: 'scheduler',    band: 'Complex widgets',   title: 'Scheduler',                 route: '/examples/scheduler',    iconCls: 'fa fa-calendar-week'},
            {family: 'gantt',        band: 'Complex widgets',   title: 'Gantt',                     route: '/examples/gantt',        iconCls: 'fa fa-chart-gantt'},
            {family: 'board',        band: 'Complex widgets',   title: 'Kanban Board',              route: '/examples/board',        iconCls: 'fa fa-table-columns'},
            {family: 'timeline',     band: 'Complex widgets',   title: 'Timeline',                  route: '/examples/timeline',     iconCls: 'fa fa-timeline'},
            {family: 'tabs',         band: 'Complex widgets',   title: 'Tab Container',             route: '/examples/tabs',         iconCls: 'fa fa-folder-open'},
            {family: 'layouts',      band: 'Complex widgets',   title: 'Containers & Layouts',      route: '/examples/layouts',      iconCls: 'fa fa-table-cells-large'},
            {family: 'dashboard',    band: 'Complex widgets',   title: 'Dashboard & Docking',       route: '/examples/dashboard',    iconCls: 'far fa-window-maximize'},
            {family: 'drag-drop',    band: 'Complex widgets',   title: 'Drag & Drop',               route: '/examples/drag-drop',    iconCls: 'fa fa-up-down-left-right'},
            {family: 'buttons',      band: 'Component shelves', title: 'Buttons, Menus & Toolbars', route: '/examples/buttons',      iconCls: 'fa fa-square-caret-down'},
            {family: 'lists',        band: 'Component shelves', title: 'Lists & Galleries',         route: '/examples/lists',        iconCls: 'fa fa-list'},
            {family: 'dialogs',      band: 'Component shelves', title: 'Dialogs & Overlays',        route: '/examples/dialogs',      iconCls: 'fa fa-message'},
            {family: 'charts',       band: 'Component shelves', title: 'Charts, Canvas & Maps',     route: '/examples/charts',       iconCls: 'fa fa-chart-line'},
            {family: 'components',   band: 'Component shelves', title: 'More components',           route: '/examples/components',   iconCls: 'fa fa-cubes'},
            {family: 'multi-window', band: 'Platform proofs',   title: 'Multi-Window',              route: '/examples/multi-window', iconCls: 'far fa-window-restore'},
            {family: 'state',        band: 'Platform proofs',   title: 'State & Data',              route: '/examples/state',        iconCls: 'fa fa-database'},
            {family: 'functional',   band: 'Platform proofs',   title: 'Functional Components',     route: '/examples/functional',   iconCls: 'fa fa-code'},
            {family: 'platform',     band: 'Platform proofs',   title: 'Workers & Platform',        route: '/examples/platform',     iconCls: 'fa fa-microchip'},
            {family: 'apps',         band: 'Applications',      title: 'Apps',                      route: '/examples/apps',         iconCls: 'fa fa-rocket'}
        ],
        /**
         * Build labels and legacy route identities.
         * @member {Object[]} buildModes
         */
        buildModes: [
            {id: 'dist_prod', text: 'Production'},
            {id: 'dist_esm',  text: 'ESM'},
            {id: 'dist_dev',  text: 'Development build'},
            {id: 'devmode',   text: 'Dev mode'}
        ],
        /**
         * Owns the one fetched catalog and the build state consumed by every list and the control.
         * @member {Object} stateProvider
         * @reactive
         */
        stateProvider: {
            module: StateProvider,
            data  : {catalogMode: 'dist_prod'},
            stores: {
                catalog: {module: ExampleStore, url: '../../apps/portal/resources/data/examples.json'}
            }
        }
    }

    /**
     * @summary Moves every list's `catalogMode` filter to the new build, then republishes the groups for it.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetCatalogMode(value, oldValue) {
        let me = this;

        // During construction no list exists yet: createFamilyItem() reads the value it starts with
        if (me.isConstructed) {
            me.getCardContainer().items.forEach(list => {list.store.getFilter('catalogMode').value = value});
            me.getController().publishFamilies()
        }
    }

    /**
     * @summary Seeds Featured and a persistent build menu at the foot of the existing tab bar.
     * @protected
     */
    createItems() {
        let me = this;

        me.items = [me.createFamilyItem(me.familyDefinitions[0])];
        me.headerActions = [{
            module     : Button,
            action     : 'example-build',
            text       : 'Build',
            bind       : {text: data => 'Build: ' + me.buildModes.find(mode => mode.id === data.catalogMode).text},
            cls        : ['neo-tab-header-button', 'portal-examples-build-selector'],
            iconCls    : 'fa fa-layer-group',
            reference  : 'example-build-selector',
            showOnFocus: false,
            menu       : {
                items: me.buildModes.map(mode => ({...mode, handler: 'onSelectBuild'}))
            }
        }];

        super.createItems()
    }

    /**
     * @summary Projects Featured or one group through a model-backed Store over the provider's catalog.
     *
     * A group's store holds its home records and the records whose `alsoIn` names it. Each store keeps only the
     * records that publish a card in the build mode (`Portal.model.Example.publishes()`): a record without a cover
     * stays in the catalog and gets no card, so an overview never shows a placeholder.
     * @param {Object} definition
     * @returns {Object}
     */
    createFamilyItem(definition) {
        const me       = this,
              featured = definition.family === null,
              catalog  = me.getCatalogStore();

        return {
            module   : List,
            bind     : {catalogMode: data => data.catalogMode},
            cls      : [featured ? 'portal-examples-featured' : 'portal-examples-family-overview'],
            reference: 'examples-' + (featured ? 'featured' : definition.route.slice('/examples/'.length)) + '-list',
            store    : {
                module  : ExampleStore,
                model   : catalog.model,
                sourceId: catalog.id,
                filters : [
                    featured
                        ? {property: 'featured', operator: '===', value: true}
                        : {property: 'family', fields: ['alsoIn', 'family'], value: definition.family, filterBy: ({item, value}) => !Example.belongsTo(item, value)},
                    {property: 'catalogMode', fields: ['hidden', 'hiddenIn', 'image', 'urls'], value: me.catalogMode, filterBy: ({item, value}) => !Example.publishes(item, value)}
                ]
            },
            header: {iconCls: definition.iconCls, route: definition.route, text: definition.title}
        }
    }

    /**
     * @summary Returns the section-owned unfiltered catalog; family stores borrow its records.
     * @returns {Portal.store.Examples}
     */
    getCatalogStore() {
        return this.getStateProvider().getStore('catalog')
    }
}

export default Neo.setupClass(ExamplesTabContainer);
