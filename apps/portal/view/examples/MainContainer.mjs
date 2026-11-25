import Button                  from '../../../../src/button/Base.mjs';
import Container               from '../../../../src/container/Base.mjs';
import Example                 from '../../model/Example.mjs';
import ExampleCatalog          from '../../connection/ExampleCatalog.mjs';
import ExampleGroupStore       from '../../store/ExampleGroups.mjs';
import ExampleStore            from '../../store/Examples.mjs';
import GroupIndex              from './GroupIndex.mjs';
import GroupPage               from './GroupPage.mjs';
import MainContainerController from './MainContainerController.mjs';
import Overview                from './Overview.mjs';
import SearchField             from '../../../../src/form/field/Search.mjs';
import SearchResults           from './SearchResults.mjs';
import StateProvider           from '../../../../src/state/Provider.mjs';

/**
 * @summary The examples shell: a persistent group index beside a card stage holding `"Start here"` (`/examples`) and
 * one page per published group (`/examples/{group}`).
 *
 * A group appears while one of its records publishes a card in the selected build (`Portal.model.Example.publishes()`):
 * it gets its entry in the hoisted navigation index (`Portal.view.examples.GroupIndex`, rendered once in the desktop
 * left rail and once in the phone crumb sheet) and its page in `.portal-examples-stage`.
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
        bind: {
            catalogMode: data => data.catalogMode,
            findQuery  : data => data.findQuery
        },
        /**
         * The builds the section can open its examples in. `text` names a build in the menu and, after
         * "Examples open in:", on the control.
         * @member {Object[]} buildModes
         */
        buildModes: [
            {id: 'dist_prod', text: 'Production build'},
            {id: 'dist_esm',  text: 'ESM build'},
            {id: 'dist_dev',  text: 'Development build'},
            {id: 'devmode',   text: 'Dev mode'}
        ],
        /**
         * The selected build mode, bound to the state provider's `catalogMode`. The overview and group pages filter by
         * it, and the controller publishes the groups that have a card to show in it.
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
         * Live cross-group search query, bound to the state provider's `findQuery`. Stays out of URL history.
         * @member {String} findQuery_=''
         * @reactive
         */
        findQuery_: '',
        /**
         * The single ordered source of the 21 example groups: id (`family`), band (`null` above the bands for Apps),
         * title, route, icon, sentence and optional `tileHeading`. Every value is a literal:
         * `buildScripts/docs/seo/seoJson.mjs` reads this list from the source.
         * @member {Object[]} familyDefinitions
         */
        familyDefinitions: [
            {family: 'apps',         band: null,         title: 'Apps',                      route: '/examples/apps',         iconCls: 'fa fa-rocket',             sentence: 'Complete applications: a web desktop, a live-price grid, an email client, this website'},
            {family: 'grid-table',   band: 'Data views', title: 'Grid & Table',              route: '/examples/grid',         iconCls: 'fa fa-table',              sentence: 'Up to 100,000 rows × 200 columns, tree grids, locked columns, header groups, cell editing'},
            {family: 'tree',         band: 'Data views', title: 'Trees',                     route: '/examples/tree',         iconCls: 'fa fa-folder-tree',        sentence: 'Tree grids, tree lists, accordion trees and a file explorer'},
            {family: 'lists',        band: 'Data views', title: 'Lists & Galleries',         route: '/examples/lists',        iconCls: 'fa fa-list',               sentence: 'Animated, buffered and chip lists, galleries, a 3D helix'},
            {family: 'charts',       band: 'Data views', title: 'Charts, Canvas & Maps',     route: '/examples/charts',       iconCls: 'fa fa-chart-line',         sentence: 'A million-point chart and a WebGL graph drawn in workers, live sparklines, a street map, diagrams from text'},
            {family: 'calendar',     band: 'Planning',   title: 'Calendar',                  route: '/examples/calendar',     iconCls: 'fa fa-calendar',           sentence: 'Day, week, month and year views'},
            {family: 'scheduler',    band: 'Planning',   title: 'Scheduler',                 route: '/examples/scheduler',    iconCls: 'fa fa-calendar-week',      sentence: 'Resource bookings on an editable timeline'},
            {family: 'gantt',        band: 'Planning',   title: 'Gantt',                     route: '/examples/gantt',        iconCls: 'fa fa-chart-gantt',        sentence: 'A project plan with linked, editable tasks'},
            {family: 'board',        band: 'Planning',   title: 'Task Board',                route: '/examples/board',        iconCls: 'fa fa-table-columns',      sentence: 'Kanban boards, swimlanes, WIP limits and pipeline stages'},
            {family: 'dashboard',    band: 'Layout',     title: 'Dashboard & Docking',       route: '/examples/dashboard',    iconCls: 'far fa-window-maximize',   sentence: 'Dock, split and group panes, switch named perspectives, tear a pane into its own window'},
            {family: 'tabs',         band: 'Layout',     title: 'Tabs',                      route: '/examples/tabs',         iconCls: 'fa fa-folder-open',        sentence: 'Reorderable tab bars on any side, closable tabs and an overflow menu'},
            {family: 'layouts',      band: 'Layout',     title: 'Containers & Layouts',      route: '/examples/layouts',      iconCls: 'fa fa-table-cells-large',  sentence: 'Seven layouts side by side over the same items, a cube that turns, form layouts'},
            {family: 'dialogs',      band: 'Layout',     title: 'Dialogs & Overlays',        route: '/examples/dialogs',      iconCls: 'fa fa-message',            sentence: 'Dialogs, popovers, tooltips and toasts'},
            {family: 'forms',        band: 'Components', title: 'Forms & Fields',            route: '/examples/forms',        iconCls: 'fa fa-keyboard',           sentence: 'Every field type with every config live, validation, input masks, and a multi-step form app', tileHeading: 'Field types'},
            {family: 'buttons',      band: 'Components', title: 'Buttons, Menus & Toolbars', route: '/examples/buttons',      iconCls: 'fa fa-square-caret-down',  sentence: 'Split and menu buttons, context and list menus, application and breadcrumb toolbars'},
            {family: 'components',   band: 'Components', title: 'More components',           route: '/examples/components',   iconCls: 'fa fa-cubes',              sentence: 'Clock, timer, progress, chips, status badges, a splitter, Markdown, video, a code editor'},
            {family: 'multi-window', band: 'Platform',   title: 'Multi-Window',              route: '/examples/multi-window', iconCls: 'far fa-window-restore',    sentence: 'One app across several browser windows, on shared state'},
            {family: 'platform',     band: 'Platform',   title: 'Workers & Platform',        route: '/examples/platform',     iconCls: 'fa fa-microchip',          sentence: 'Worker tasks, remote method access, asset preloading, a canvas drawn off the main thread'},
            {family: 'state',        band: 'Platform',   title: 'State & Data',              route: '/examples/state',        iconCls: 'fa fa-database',           sentence: 'State providers, nested and two-way bindings, a data pipeline'},
            {family: 'functional',   band: 'Platform',   title: 'Functional Components',     route: '/examples/functional',   iconCls: 'fa fa-code',               sentence: 'Function components and templates beside classes, nested both ways'},
            {family: 'drag-drop',    band: 'Platform',   title: 'Drag & Drop',               route: '/examples/drag-drop',    iconCls: 'fa fa-up-down-left-right', sentence: 'Cards between columns, a day re-planned, tasks linked, lists and tabs reordered, panes docked, dialogs dragged'}
        ],
        /**
         * Shell CSS grid placing the mobile crumb across the top, the desktop group rail on the left, and the
         * card-managed stage on the right.
         * @member {Object} layout={ntype:'grid'}
         * @reactive
         */
        layout: {ntype: 'grid'},
        /**
         * True while the mobile crumb's sheet shows the group index.
         * @member {Boolean} sheetOpen_=false
         * @reactive
         */
        sheetOpen_: false,
        /**
         * Owns the one fetched catalog, the groups that publish in the selected build, and that selection.
         * @member {Object} stateProvider
         * @reactive
         */
        stateProvider: {
            module: StateProvider,
            data  : {
                catalogMode    : 'dist_prod',
                featuredCount  : 0,
                featuredMatches: null,
                findQuery      : '',
                matchCounts    : null,
                publishedCount : 0
            },
            stores: {
                catalog: {module: ExampleStore, pipeline: {connection: {module: ExampleCatalog, url: '../../apps/portal/resources/data/examples/index.json'}}},
                groups : {module: ExampleGroupStore}
            }
        }
    }

    /** @summary Tracks whether `'/'` is registered with `Neo.main.DomEvents#registerPreventDefaultKeys`. */
    preventDefaultKeysRegistered = false
    /**
     * Element id focused immediately before the `'/'` shortcut moved focus to the find input.
     * @member {String|null} returnFocusId=null
     */
    returnFocusId = null

    /**
     * Registers document-level `'/'` shortcut and group-link click handlers so active filtering exits cleanly.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const me = this;

        me.addDomListeners([
            {keydown: me.onDocumentKeyDown, scope: me, vnodeId: 'document.body'},
            {click  : me.onGroupLinkClick, delegate: '.portal-examples-group-index',         scope: me},
            {click  : me.onGroupLinkClick, delegate: '.portal-examples-search-group-heading', scope: me}
        ])
    }

    /**
     * @summary Moves the overview and every group page's `catalogMode` filter to the new build, then republishes the groups.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetCatalogMode(value, oldValue) {
        let me = this;

        // During construction no stage card exists yet: createItems()/createGroupPage() read the initial value
        if (me.isConstructed) {
            me.getOverview().getList().store.getFilter('catalogMode').value = value;
            me.getGroupPages().forEach(page => page.getLists().forEach(list => {list.store.getFilter('catalogMode').value = value}));
            me.getController().publishGroups()
        }
    }

    /**
     * @summary Synchronizes both find inputs and re-filters the examples stage when `findQuery` changes.
     * @param {String} value
     * @param {String|undefined} oldValue
     * @protected
     */
    afterSetFindQuery(value, oldValue) {
        const me    = this,
              query = value || '';

        if (me.isConstructed) {
            me.syncFindFields(query);
            me.getController().applyFindQuery(query)
        }
    }

    /** @summary Re-syncs `'/'` preventDefault registration when component classes change. */
    afterSetCls(value, oldValue) {
        super.afterSetCls(value, oldValue);
        this.syncPreventDefaultKeys()
    }

    /** @summary Synchronizes `'/'` body-level preventDefault registration with mount state. */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        this.syncPreventDefaultKeys()
    }

    /** @summary Releases `'/'` preventDefault on `document.body` when card layout marks this view inactive. */
    afterSetWrapperCls(value, oldValue) {
        super.afterSetWrapperCls(value, oldValue);
        this.syncPreventDefaultKeys()
    }

    /**
     * @summary Shows or hides the mobile crumb sheet and syncs its button's disclosure attribute.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetSheetOpen(value, oldValue) {
        if (oldValue === undefined) return;

        const button = this.getGroupButton();

        button.getVdomRoot()['aria-expanded'] = value;
        button.update();
        this.getSheet().hidden = !value
    }

    /**
     * @summary The build control the overview and every group page show: one button whose menu selects the build,
     * labelled as the setting it is, "Examples open in:" and the selected build. On a phone (`size: 'x-small'`) the
     * label drops "Examples", so the control keeps its place beside the heading instead of taking a row of its own.
     * @returns {Object}
     */
    createBuildControl() {
        let me = this;

        return {
            module      : Button,
            bind        : {text: data => `${data.size === 'x-small' ? 'Open' : 'Examples open'} in: ${me.buildModes.find(mode => mode.id === data.catalogMode).text}`},
            cls         : ['portal-examples-build-control'],
            iconCls     : 'fa fa-chevron-down',
            iconPosition: 'right',
            menu        : {items: me.buildModes.map(mode => ({...mode, handler: 'onSelectBuild'}))},
            showOnFocus : false,
            ui          : 'secondary'
        }
    }

    /**
     * @summary Creates one synchronized find input shared between desktop sidebar and phone crumb surfaces.
     * @param {String} reference
     * @param {Number|String} [flex='none']
     * @returns {Object}
     */
    createFindField(reference, flex='none') {
        return {
            module         : SearchField,
            bind           : {placeholderText: data => data.publishedCount > 0 ? `Search ${data.publishedCount} examples…  /` : 'Search examples…  /'},
            clearable      : true,
            cls            : ['portal-examples-find-field'],
            domListeners   : {keydown: this.onFindFieldKeyDown, scope: this},
            emptyValue     : '',
            flex,
            hideLabel      : true,
            listeners      : {change: 'onFindFieldChange'},
            placeholderText: 'Search examples…  /',
            reference,
            value          : this.findQuery || ''
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
     * @summary Builds the hoisted mobile crumb + sheet, the persistent desktop sidebar group index, and the card stage
     * starting on `Overview`; the controller adds a page per published group into the stage after catalog load.
     * @protected
     */
    createItems() {
        const me          = this,
              groupTitles = Object.fromEntries(me.familyDefinitions.map(definition => [definition.family, definition.title]));

        me.items = [{
            module   : Container,
            cls      : ['portal-examples-group-crumb'],
            layout   : {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            reference: 'examples-crumb',
            items    : [{
                module: Container,
                cls   : ['portal-examples-group-crumb-bar'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'center'},
                items : [{
                    module   : Button,
                    cls      : ['portal-examples-group-crumb-home'],
                    hidden   : true,
                    reference: 'crumb-home',
                    route    : '/examples',
                    text     : 'Examples',
                    ui       : 'tertiary'
                }, {
                    ntype    : 'component',
                    cls      : ['portal-examples-group-crumb-separator'],
                    hidden   : true,
                    reference: 'crumb-separator',
                    vdom     : {tag: 'span', 'aria-hidden': true, cn: [{tag: 'span', text: '›'}]}
                }, {
                    module   : Button,
                    cls      : ['portal-examples-group-button'],
                    handler  : me.onGroupButtonClick.bind(me),
                    iconCls  : 'fa fa-table-cells-large',
                    reference: 'group-button',
                    text     : 'Start here',
                    ui       : 'secondary'
                }]
            }, me.createFindField('mobile-find', '1 1 180px'), {
                module      : GroupIndex,
                hidden      : true,
                id          : me.id + '__sheet',
                presentation: 'sheet',
                reference   : 'group-sheet',
                domListeners: {
                    click  : me.onSheetClick,
                    keydown: me.onSheetKeyDown,
                    scope  : me
                }
            }]
        }, {
            module   : Container,
            cls      : ['portal-examples-sidebar'],
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'examples-sidebar',
            items    : [me.createFindField('sidebar-find'), {
                module      : GroupIndex,
                flex        : 1,
                listeners   : {enterCards: 'onIndexEnterCards', walk: 'onIndexWalk'},
                presentation: 'list',
                reference   : 'group-index'
            }]
        }, {
            module   : Container,
            cls      : ['portal-examples-stage'],
            layout   : {ntype: 'card', activeIndex: 0, removeInactiveCards: false},
            reference: 'examples-stage',
            items    : [{
                module      : Overview,
                buildControl: me.createBuildControl(),
                catalogMode : me.catalogMode,
                catalogStore: me.getCatalogStore(),
                groupStore  : me.getGroupStore(),
                groupTitles,
                reference   : 'examples-overview'
            }, {
                module      : SearchResults,
                buildControl: me.createBuildControl(),
                catalogStore: me.getCatalogStore(),
                reference   : 'examples-search-results'
            }]
        }];

        super.createItems();

        // The engine's button has no disclosure state: MainContainer owns which sheet it controls and whether it is open
        Object.assign(me.getGroupButton().getVdomRoot(), {'aria-controls': me.id + '__sheet', 'aria-expanded': false});
        [me.getSidebarFindField(), me.getMobileFindField()].forEach(field => {
            Object.assign(field.getInputEl(), {'aria-label': 'Find examples'})
        })
    }

    /**
     * @returns {Neo.container.Base}
     */
    getActivePage() {
        const stage = this.getStage();

        return stage.items[stage.layout.activeIndex]
    }

    /**
     * @summary Returns the section-owned unfiltered catalog; the overview and group pages borrow its records.
     * @returns {Portal.store.Examples}
     */
    getCatalogStore() {
        return this.getStateProvider().getStore('catalog')
    }

    /**
     * @returns {Neo.container.Base}
     */
    getCrumb() {
        return this.down({reference: 'examples-crumb'})
    }

    /**
     * @returns {Neo.button.Base}
     */
    getGroupButton() {
        return this.down({reference: 'group-button'})
    }

    /**
     * @returns {Portal.view.examples.GroupIndex}
     */
    getGroupIndex() {
        return this.down({reference: 'group-index'})
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
        return this.getStage().items.filter(item => item instanceof GroupPage)
    }

    /**
     * @summary Returns the groups that publish a card in the selected build, in definition order.
     * @returns {Portal.store.ExampleGroups}
     */
    getGroupStore() {
        return this.getStateProvider().getStore('groups')
    }

    /**
     * @returns {Neo.form.field.Search}
     */
    getMobileFindField() {
        return this.down({reference: 'mobile-find'})
    }

    /**
     * @returns {Portal.view.examples.Overview}
     */
    getOverview() {
        return this.down({reference: 'examples-overview'})
    }

    /**
     * @returns {Portal.view.examples.SearchResults}
     */
    getSearchResults() {
        return this.down({reference: 'examples-search-results'})
    }

    /**
     * @returns {Neo.form.field.Search}
     */
    getSidebarFindField() {
        return this.down({reference: 'sidebar-find'})
    }

    /** @summary Releases any active `'/'` preventDefault registration before destroying child items. */
    destroy(...args) {
        this.syncPreventDefaultKeys(false);
        super.destroy(...args)
    }

    /**
     * @summary Moves focus to whichever find input (`sidebar-find` on desktop, `mobile-find` on phone) is currently visible.
     */
    focusFindField() {
        const me           = this,
              mobileField  = me.getMobileFindField(),
              sidebarField = me.getSidebarFindField();

        if (me.sheetOpen) {
            mobileField?.focus();
            return
        }

        if (sidebarField?.mounted && Neo.main?.DomAccess?.getBoundingClientRect) {
            Neo.main.DomAccess.getBoundingClientRect({
                id      : sidebarField.id,
                windowId: me.windowId
            }).then(rect => {
                (rect?.width ? sidebarField : mobileField)?.focus()
            });
            return
        }

        sidebarField?.focus()
    }

    /**
     * @summary True while the examples section is the active Portal view (never steals `'/'` while browsing other tabs).
     * @returns {Boolean}
     */
    isActiveView() {
        return !this.isDestroyed && !this.wrapperCls?.includes('neo-inactive-item') && !this.cls?.includes('neo-inactive-item')
    }

    /**
     * @summary Focuses the visible find input on `'/'` outside editable controls.
     * @param {Object} data
     */
    onDocumentKeyDown(data) {
        const me = this;

        if (!me.isActiveView() || data.key !== '/' || data.ctrlKey || data.metaKey || data.altKey) {
            return
        }

        if (data.path?.some(node => ['input', 'textarea', 'select'].includes(node.tagName) || node.isContentEditable)) {
            return
        }

        me.returnFocusId = data.target?.id && data.target.id !== 'document.body' ? data.target.id : null;
        me.focusFindField()
    }

    /**
     * @summary Pressing `Escape` inside a find input clears the active query and returns focus cleanly.
     * @param {Object} data
     */
    onFindFieldKeyDown(data) {
        if (data.key === 'Escape') {
            this.getController().clearFind({
                restoreFocus : true,
                sourceFieldId: data.component?.id || null
            })
        }
    }

    /**
     * @summary Exits search immediately when the visitor follows a group link (including the already-open group).
     * @param {Object} data
     */
    onGroupLinkClick(data) {
        if (this.findQuery && data.path?.some(node => node.tagName === 'a')) {
            this.getController().clearFind()
        }
    }

    /**
     * @returns {Portal.view.examples.GroupIndex}
     */
    getSheet() {
        return this.down({reference: 'group-sheet'})
    }

    /**
     * @returns {Neo.container.Base}
     */
    getStage() {
        return this.down({reference: 'examples-stage'})
    }

    /**
     * @summary The group button toggles the sheet. An opened sheet takes focus.
     */
    async onGroupButtonClick() {
        const me    = this,
              sheet = me.getSheet();

        me.sheetOpen = !me.sheetOpen;

        if (me.sheetOpen) {
            await sheet.waitFor(() => sheet.mounted);
            sheet.mounted && sheet.focus(sheet.id, true)
        }
    }

    /**
     * @summary A followed link closes the sheet; the route opens its page.
     * @param {Object} data
     */
    onSheetClick(data) {
        if (data.path.some(node => node.tagName === 'a')) {
            this.sheetOpen = false
        }
    }

    /**
     * @summary Escape closes the sheet and returns focus to its button.
     * @param {Object} data
     */
    onSheetKeyDown(data) {
        if (data.key === 'Escape') {
            this.sheetOpen = false;
            this.getGroupButton().focus()
        }
    }

    /**
     * @summary Returns focus from the find input to the prior element or the active navigation landmark.
     * @param {String|null} [sourceFieldId=null]
     */
    restoreFocusAfterFind(sourceFieldId=null) {
        const me          = this,
              returnId    = me.returnFocusId,
              mobileField = me.getMobileFindField(),
              index       = me.getGroupIndex(),
              openFamily  = me.getController().openFamily,
              button      = me.getGroupButton();

        me.returnFocusId = null;

        if (returnId) {
            me.focus(returnId);
            return
        }

        if (sourceFieldId && mobileField && sourceFieldId === mobileField.id) {
            button.focus();
            return
        }

        const fallbackLinkId = index ? `${index.id}__${openFamily || 'all'}` : null;

        if (fallbackLinkId && index?.mounted && Neo.main?.DomAccess?.getBoundingClientRect) {
            Neo.main.DomAccess.getBoundingClientRect({
                id      : index.id,
                windowId: me.windowId
            }).then(rect => {
                rect?.width ? index.focus(fallbackLinkId) : button?.focus()
            });
            return
        }

        if (fallbackLinkId && index?.mounted) {
            index.focus(fallbackLinkId)
        } else {
            button?.focus()
        }
    }

    /**
     * @summary Synchronizes both find field values with `query` without re-rendering an already matching input.
     * @param {String} query
     * @protected
     */
    syncFindFields(query) {
        [this.getSidebarFindField(), this.getMobileFindField()].forEach(field => {
            if (field && (field.value || '') !== query) {
                field.value = query
            }
        })
    }

    /**
     * @summary Synchronizes desktop sidebar active state, mobile crumb controls and mobile group picker button.
     * @param {Portal.model.ExampleGroup|null} group
     */
    syncNavigation(group) {
        const me     = this,
              family = group?.family || null,
              total  = me.getGroupStore().getCount();

        me.getGroupIndex().activeFamily                = family;
        me.getSheet().activeFamily                     = family;
        me.down({reference: 'crumb-home'}).hidden      = !group;
        me.down({reference: 'crumb-separator'}).hidden = !group;
        me.getGroupButton().set(group
            ? {iconCls: group.iconCls, text: group.title}
            : {iconCls: 'fa fa-table-cells-large', text: total ? `All ${total} groups` : 'Start here'}
        )
    }
    /** @summary Registers `'/'` preventDefault on `document.body` only while mounted and active. */
    syncPreventDefaultKeys(active=Boolean(this.mounted && this.isActiveView())) {
        if (this.preventDefaultKeysRegistered !== active) {
            this.preventDefaultKeysRegistered = active;
            Neo.main?.DomEvents?.[active ? 'registerPreventDefaultKeys' : 'unregisterPreventDefaultKeys']?.({
                id      : 'document.body',
                keys    : ['/'],
                windowId: this.windowId
            })
        }
    }
}

export default Neo.setupClass(MainContainer);
