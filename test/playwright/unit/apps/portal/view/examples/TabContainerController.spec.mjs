import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalExamplesTabControllerTest'
    }
});

import {test, expect}                from '@playwright/test';
import fs                            from 'node:fs';
import os                            from 'node:os';
import path                          from 'node:path';
import {fileURLToPath}               from 'node:url';
import {getPublishedExampleFamilies} from '../../../../../../../buildScripts/docs/seo/seoJson.mjs';
import Neo                           from '../../../../../../../src/Neo.mjs';
import * as core                     from '../../../../../../../src/core/_export.mjs';
import Example                       from '../../../../../../../apps/portal/model/Example.mjs';
import ExamplesList                  from '../../../../../../../apps/portal/view/examples/List.mjs';
import ExamplesStore                 from '../../../../../../../apps/portal/store/Examples.mjs';
import ExamplesTabContainer          from '../../../../../../../apps/portal/view/examples/TabContainer.mjs';
import TabContainerController        from '../../../../../../../apps/portal/view/examples/TabContainerController.mjs';

const
    directory = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot  = path.resolve(directory, '../../../../../../../'),
    dataRoot  = path.join(repoRoot, 'apps/portal/resources/data');

let exampleView;

/**
 * @summary The live tab index of a route, so an arm does not depend on how many groups publish before it.
 * @param {Portal.view.examples.TabContainer} view
 * @param {String} route
 * @returns {Number}
 */
const tabIndex = (view, route) => view.getTabButtons().find(button => button.route === route).index;

/**
 * @summary Constructs the real section with an owned in-memory catalog and no network fetch.
 * @param {Object[]} [records=catalog]
 * @param {String} [catalogMode='dist_prod']
 * @returns {Portal.view.examples.TabContainer}
 */
function createView(records=catalog, catalogMode='dist_prod') {
    const defaults = ExamplesTabContainer.config.stateProvider;

    return exampleView = Neo.create(ExamplesTabContainer, {
        appName      : 'PortalExamplesTabControllerTest',
        windowId     : 1,
        stateProvider: {
            ...defaults,
            data  : {catalogMode},
            stores: {catalog: {...defaults.stores.catalog, data: structuredClone(records), isLoaded: true}}
        }
    })
}

test.afterEach(() => {
    exampleView?.destroy();
    exampleView = null
});

test.describe('Portal examples family navigation', () => {
    test('an initial shared ESM selection renders ESM destinations on both lists', () => {
        const view = createView(catalog, 'dist_esm');

        function hrefs(node) {
            return [node.href, ...(node.cn || []).flatMap(hrefs)].filter(Boolean)
        }

        expect(hrefs(view.getCard(0).vdom)).toContain('https://neomjs.com/dist/esm/apps/workstation/index.html');
        expect(hrefs(view.getCard(1).vdom)).toContain('https://neomjs.com/dist/esm/examples/grid/treeBigData/index.html')
    });

    for (const mode of ['dist_prod', 'dist_esm']) {
        test(`an initial ${mode} selection renders family items once`, () => {
            const view  = createView(catalog, mode),
                  list  = view.getCard(1),
                  items = list.getVdomRoot().cn;

            expect(list.store.getCount()).toBe(coveredGridTableIds.length);
            expect(items).toHaveLength(coveredGridTableIds.length);
            expect(new Set(items.map(item => item.id)).size).toBe(coveredGridTableIds.length)
        })
    }

    test('publishes only Featured and groups with a covered member from one definition source', () => {
        const view = createView(),
              ids  = route => view.getCard(tabIndex(view, route)).store.items.map(record => record.id);

        // Tree, Board and others are defined and have records; none has a cover yet, so none has a tab
        expect(view.getTabButtons().map(button => button.text)).toEqual([
            'Featured', 'Grid & Table', 'Forms & Fields', 'Calendar', 'Scheduler', 'Gantt', 'Tab Container', 'Dashboard & Docking', 'Drag & Drop',
            'Lists & Galleries', 'Dialogs & Overlays', 'Charts, Canvas & Maps', 'More components', 'Multi-Window',
            'State & Data', 'Workers & Platform', 'Apps'
        ]);
        expect(view.getTabButtons().map(button => button.route)).toEqual(publishedRoutes);
        expect(view.getCatalogStore().getCount()).toBe(98);
        expect(view.getCard(0).store.getCount()).toBe(28);
        expect(view.getCard(0).store.items.map(record => record.id)).toEqual(featuredExampleIds);
        expect(ids('/examples/grid')).toEqual(coveredGridTableIds);
        expect(ids('/examples/forms')).toEqual(['date-selector', 'date-field', 'combobox-field']);
        expect(ids('/examples/multi-window')).toEqual(coveredMultiWindowIds);
        expect(ids('/examples/calendar')).toEqual(['calendar']);
        expect(ids('/examples/scheduler')).toEqual(['scheduler-basic']);
        expect(ids('/examples/gantt')).toEqual(['gantt-basic']);
        // a group lists its home records and the records whose alsoIn names it, in catalog order
        expect(ids('/examples/drag-drop')).toEqual(['multi-window-drag-drop', 'dialog-drag-drop']);
        expect(ids('/examples/apps')).toEqual([
            'workstation', 'webdesktop', 'devindex', 'shared-covid', 'multi-window-drag-drop', 'colors-dashboard',
            'covid-dashboard', 'portal'
        ]);

        // every card of every tab has a cover; the catalog keeps the records that wait for one
        for (let index = 0; index < view.getCount(); index++) {
            view.getCard(index).store.forEach(record => expect(record.image, record.id).toBeTruthy())
        }
        expect(view.getCatalogStore().items.filter(record => !record.image)).toHaveLength(54);
        expect(view.getCatalogStore().items.filter(record => record.image && !Example.publishes(record, 'dist_prod')).map(record => record.id))
            .toEqual(['realworld', 'realworld-v2']);
        expect(view.getCard(0).store.getSource()).toBe(view.getCatalogStore());
        expect(view.getCard(1).store.getSource()).toBe(view.getCatalogStore());
        expect(view.getCard(0).store.model).toBe(view.getCatalogStore().model);
        expect(view.getCard(1).store.model).toBe(view.getCatalogStore().model);
        expect(view.getTabBar().getActionItems()).toHaveLength(1);
        expect(view.getTabBar().getAction('example-build').showOnFocus).toBe(false)
        expect(view.getTabBar().getAction('example-build').getVdomRoot()['aria-label']).toBeUndefined()
    });

    test('resolves family routes and all legacy modes through the live headers', async () => {
        const view       = createView(),
              controller = view.getController();

        await controller.onExamplesRoute();
        expect(view.activeIndex).toBe(0);
        expect(view.getCard(0).catalogMode).toBe('dist_prod');

        for (const mode of view.buildModes) {
            await controller.onExamplesRoute({itemId: mode.id});
            expect(view.activeIndex).toBe(0);
            expect(view.getCard(0).catalogMode).toBe(mode.id);
            expect(view.getCard(1).catalogMode).toBe(mode.id)
        }

        // The loop above ends in Dev mode, which publishes no More components tab. Every group path defined on dev
        // before the groups became data still resolves in production.
        await controller.onExamplesRoute({itemId: 'dist_prod'});

        for (const itemId of ['grid', 'forms', 'multi-window', 'calendar', 'components', 'state']) {
            await controller.onExamplesRoute({itemId});
            expect(view.activeIndex, itemId).toBe(tabIndex(view, '/examples/' + itemId))
        }

        // a defined group without a cover has no tab yet, and an unknown one none at all: both land on Featured
        await controller.onExamplesRoute({itemId: 'board'});
        expect(view.activeIndex).toBe(0);
        await controller.onExamplesRoute({itemId: 'gantt'});
        expect(view.activeIndex).toBe(tabIndex(view, '/examples/gantt'));
        await controller.onExamplesRoute({itemId: 'drag-drop'});
        expect(view.activeIndex).toBe(tabIndex(view, '/examples/drag-drop'));
        await controller.onExamplesRoute({itemId: 'unknown'});
        expect(view.activeIndex).toBe(0)
    });

    test('uses the framework-maintained indexes after actual header reordering', async () => {
        const view = createView();

        view.getTabBar().moveTo(0, 1);
        await view.getController().onExamplesRoute({itemId: 'grid'});
        expect(view.activeIndex).toBe(0);
        await view.getController().onExamplesRoute();
        expect(view.activeIndex).toBe(1)
    });

    test('concurrent initial routes share one load and only the latest route settles', async () => {
        const view       = createView([]),
              store      = view.getCatalogStore(),
              controller = view.getController();
        let complete, calls = 0;

        store.isLoaded = false;
        store.load = () => {
            calls++;
            return new Promise(resolve => {complete = resolve})
        };

        const first  = controller.onExamplesRoute({itemId: 'grid'}),
              latest = controller.onExamplesRoute({itemId: 'dist_esm'});
        expect(calls).toBe(1);
        store.add(structuredClone(catalog));
        store.isLoaded = true;
        store.fire('load');
        complete();
        await Promise.all([first, latest]);

        expect(view.activeIndex).toBe(0);
        expect(view.getCard(0).catalogMode).toBe('dist_esm');
        expect(view.getCard(1).catalogMode).toBe('dist_esm')
    });

    test('a newly published group needs no additional tab or controller entry', () => {
        const view = createView([...catalog, {
            ...catalog[0], id: 'test-tree-example', family: 'tree', alsoIn: [], featured: false,
            feature: 'A tree', lookFor: 'Inspect it.'
        }]);

        expect(view.getTabButtons().map(button => button.route)).toEqual([...publishedRoutes.slice(0, 2), '/examples/tree', ...publishedRoutes.slice(2)]);
        expect(view.getCard(2).store.getCount()).toBe(1);
        expect(view.getTabButtons()[2].iconCls).toBe(view.familyDefinitions.find(item => item.family === 'tree').iconCls)
    });

    test('the build publishes the search routes of exactly the families the section shows as tabs', async () => {
        const cover = catalog.find(record => record.image).image,
              rows  = [
                  ...catalog,
                  {...catalog[0], id: 'test-state-hidden',     family: 'state',      featured: false, image: cover, hidden: true},
                  {...catalog[0], id: 'test-gantt-hidden',     family: 'gantt',      featured: false, image: cover, hidden: true},
                  {...catalog[0], id: 'test-board-waiting',    family: 'board',      featured: false, image: null},
                  {...catalog[0], id: 'test-components-shown', family: 'components', featured: false, image: cover}
              ],
              folder       = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-example-families-')),
              examplesPath = path.join(folder, 'examples.json');

        fs.writeFileSync(examplesPath, JSON.stringify(rows));

        // The same rows through both readers of `familyDefinitions`: the build parses the section's source file
        const published = await getPublishedExampleFamilies({examplesPath}),
              view      = createView(rows);

        fs.rmSync(folder, {force: true, recursive: true});

        expect(published.map(family => family.route)).toEqual(view.getTabButtons().map(button => button.route).slice(1));
        expect(published.map(family => family.route)).toEqual(publishedRoutes.slice(1));
        published.forEach((family, index) => {
            expect(family.records.map(record => record.id), family.route).toEqual(view.getCard(index + 1).store.items.map(record => record.id))
        })
    });

    for (const [name, images, published] of [
        ['a group whose records have no cover gets no tab', [null], false],
        ['the first covered record publishes its group, and a record without a cover stays off its tab', ['devmode/workstation-13-2.jpg', null], true]
    ]) {
        test(name, () => {
            const records = images.map((image, index) => ({
                      ...catalog[0], id: 'test-tree-' + index, family: 'tree', alsoIn: [], featured: false,
                      feature: 'A tree', lookFor: 'Inspect it.', image
                  })),
                  view    = createView([...catalog, ...records]);

            records.forEach(record => {
                expect(view.getCatalogStore().get(record.id).family).toBe('tree');
                expect(Example.publishes(view.getCatalogStore().get(record.id), 'dist_prod')).toBe(!!record.image)
            });

            expect(view.getTabButtons().map(button => button.route)).toEqual(
                published ? [...publishedRoutes.slice(0, 2), '/examples/tree', ...publishedRoutes.slice(2)] : publishedRoutes
            );
            published && expect(view.getCard(2).store.items.map(item => item.id)).toEqual(['test-tree-0'])
        })
    }

    test('an arriving catalog populates the borrowed family stores and withdraws an empty family', () => {
        const view = createView([]), store = view.getCatalogStore();

        expect(view.getTabButtons().map(button => button.route)).toEqual(['/examples']);
        store.add(structuredClone(catalog));
        store.fire('load');
        expect(view.getCard(0).store.getCount()).toBe(28);
        expect(view.getCard(1).store.getCount()).toBe(coveredGridTableIds.length);
        expect(view.getCard(2).store.getCount()).toBe(3);

        store.remove(store.items.filter(record => record.family === 'grid-table'));
        store.fire('load');
        expect(view.getTabButtons().map(button => button.route)).toEqual(publishedRoutes.filter(route => route !== '/examples/grid'))
    });

    test('a record with alsoIn shows once in each of its groups and counts once in the catalog', () => {
        const view = createView(),
              ids  = route => view.getCard(tabIndex(view, route)).store.items.map(record => record.id);

        expect(ids('/examples/dialogs')).toEqual(['dialog-drag-drop']);
        expect(ids('/examples/drag-drop').filter(id => id === 'dialog-drag-drop')).toHaveLength(1);
        expect(ids('/examples/platform')).toEqual(['offscreen-canvas', 'shared-offscreen-canvas']);
        expect(ids('/examples/charts')).toEqual(['offscreen-canvas']);
        expect(view.getCatalogStore().items.filter(record => record.id === 'dialog-drag-drop')).toHaveLength(1);
        expect(view.getCatalogStore().getCount()).toBe(98)
    });

    for (const mode of ['dist_prod', 'dist_esm', 'dist_dev', 'devmode']) {
        test(`the ${mode} build publishes the groups with a card it can open`, () => {
            const view = createView(catalog, mode);

            // Dev mode hides liquid-glass, the one covered member of More components
            expect(view.getTabButtons().map(button => button.route)).toEqual(
                mode === 'devmode' ? publishedRoutes.filter(route => route !== '/examples/components') : publishedRoutes
            )
        })
    }

    test('a build selection republishes the groups, and an open group that loses its cards yields to Featured', async () => {
        const view       = createView(),
              controller = view.getController();

        await controller.onExamplesRoute({itemId: 'components'});
        expect(view.activeIndex).toBe(tabIndex(view, '/examples/components'));

        controller.onSelectBuild({id: 'devmode'});
        expect(view.getTabButtons().map(button => button.route)).not.toContain('/examples/components');
        expect(view.activeIndex).toBe(0);
        // every list's store follows the build: Featured no longer holds the card Dev mode cannot open
        expect(view.getCard(0).store.items.map(record => record.id)).not.toContain('liquid-glass');

        controller.onSelectBuild({id: 'dist_prod'});
        expect(view.getTabButtons().map(button => button.route)).toEqual(publishedRoutes);
        expect(view.getCard(tabIndex(view, '/examples/components')).store.items.map(record => record.id)).toEqual(['liquid-glass'])
    });

    test('an open group stays selected when a build switch inserts or removes a tab before it', async () => {
        const view       = createView(),
              controller = view.getController(),
              openRoute  = () => view.getTabButtons()[view.activeIndex].route;

        await controller.onExamplesRoute({itemId: 'multi-window'});
        expect(openRoute()).toBe('/examples/multi-window');

        // Dev mode removes More components, which precedes Multi-Window
        controller.onSelectBuild({id: 'devmode'});
        expect(openRoute()).toBe('/examples/multi-window');

        // Production inserts it again before the open tab
        controller.onSelectBuild({id: 'dist_prod'});
        expect(openRoute()).toBe('/examples/multi-window');
        expect(view.activeIndex).toBe(tabIndex(view, '/examples/multi-window'))
    });
});

const catalog            = JSON.parse(fs.readFileSync(path.join(dataRoot, 'examples.json'), 'utf8')),
      modes              = ['devmode', 'dist_dev', 'dist_esm', 'dist_prod'],
      featuredExampleIds = [
          'workstation', 'webdesktop', 'devindex', 'grid-tree-big-data', 'shared-covid', 'grid-big-data', 'grid-issues',
          'calendar', 'helix', 'multi-window-covid-gallery', 'offscreen-canvas', 'shared-offscreen-canvas',
          'multi-window-drag-drop', 'tab-container', 'state-provider', 'dialog-drag-drop',
          'colors-dashboard', 'covid-dashboard', 'covid-helix', 'covid-gallery', 'gallery',
          'table-filtering', 'date-selector', 'date-field', 'combobox-field', 'portal', 'liquid-glass',
          'dock-choreography'
      ],
      newExampleIds = [
          'grid-animated-row-sorting', 'grid-cell-editing', 'grid-container', 'grid-content-sized-rows',
          'grid-countries', 'grid-filtering', 'grid-header-groups', 'grid-locked-columns', 'grid-nested-record-fields',
          'grid-tree', 'grid-value-banding', 'table-container'
      ],
      componentExampleIds = [
          'canvas', 'carousel', 'chip', 'circle', 'clock', 'graph-scene', 'magic-move-text',
          'markdown', 'mwc-button', 'mwc-buttons', 'mwc-text-field', 'mwc-text-fields',
          'process', 'process-real-world', 'progress', 'splitter', 'status-badge', 'timer',
          'toast', 'video', 'cesium-js', 'monaco-editor', 'open-street-maps', 'am-charts',
          'video-move'
      ],
      formExampleIds = [
          'checkbox-field', 'chip-field', 'color-field', 'email-field', 'fileupload-field',
          'number-field', 'picker-field', 'radio-field', 'select-field', 'switch-field',
          'text-field', 'textarea-field', 'time-field', 'url-field', 'copy-to-clipboard-trigger',
          'fieldset', 'field-with-prefix', 'fields-runtime-triggers', 'layout-form',
          'date-selector-container', 'form-app'
      ],
      multiWindowExampleIds = [
          'dock-layouts', 'dock-cross-window', 'dock-tear-out',
          'multi-window-helix', 'multi-window-state-provider'
      ],
      // the records of a group that name a cover: the cards its overview shows
      coveredGridTableIds   = ['grid-tree-big-data', 'grid-big-data', 'grid-issues', 'table-filtering', ...newExampleIds],
      coveredMultiWindowIds = [
          'workstation', 'shared-covid', 'multi-window-covid-gallery', 'shared-offscreen-canvas',
          'multi-window-drag-drop', 'colors-dashboard'
      ],
      // Featured and the 16 groups with a card a production build opens on this catalog, in definition order
      publishedRoutes = [
          '/examples', '/examples/grid', '/examples/forms', '/examples/calendar', '/examples/scheduler', '/examples/gantt',
          '/examples/tabs', '/examples/dashboard',
          '/examples/drag-drop', '/examples/lists', '/examples/dialogs', '/examples/charts', '/examples/components',
          '/examples/multi-window', '/examples/state', '/examples/platform', '/examples/apps'
      ];

/**
 * @summary The canonical catalog survives the keyed Store and renders through the production List.
 */
test.describe('Portal examples canonical catalog', () => {
    let list;

    /**
     * @param {Object} config={}
     * @returns {Portal.view.examples.List}
     */
    function createList(config={}) {
        return list = Neo.create(ExamplesList, {
            appName: 'PortalExamplesTabControllerTest',
            store  : {module: ExamplesStore, autoLoad: false, data: structuredClone(catalog)},
            ...config
        })
    }

    test.afterEach(() => {
        list?.destroy();
        list = null
    });

    for (const {name, initial, targets, config, expected} of [
        {name: 'recovers delayed targets and stops at success', initial: 0, targets: [0, 5], expected: 2},
        {name: 'does not retry an initially successful registration', initial: 5, targets: [], expected: 0},
        {name: 'bounds retries when targets never arrive', initial: 0, targets: [], expected: 10},
        {name: 'honors an instance retry budget', initial: 0, targets: [], config: {intersectionObserverReconnects: 2}, expected: 2},
        {name: 'allows retries to be disabled', initial: 0, targets: [], config: {intersectionObserverReconnects: 0}, expected: 0}
    ]) {
        test(`observer ${name}`, async () => {
            const instance = createList(config),
                  original = Neo.main.addon.IntersectionObserver,
                  calls    = [];

            instance.timeout = async () => {};
            Neo.main.addon.IntersectionObserver = {
                register: async () => ({countTargets: initial}),
                observe : async options => {
                    calls.push(options);
                    return {countTargets: targets[calls.length - 1] || 0}
                }
            };

            try {
                await instance.registerIntersectionObserver();

                expect(calls).toHaveLength(expected);
                calls.forEach(options => expect(options).toEqual({
                    id: instance.id, observe: ['.content'], windowId: instance.windowId
                }))
            } finally {
                if (original === undefined) {
                    delete Neo.main.addon.IntersectionObserver
                } else {
                    Neo.main.addon.IntersectionObserver = original
                }
            }
        })
    }

    test('loads 98 logical examples with unique stable string identities', () => {
        const {store} = createList(),
              ids     = [];

        expect(catalog).toHaveLength(98);
        expect(store.getCount()).toBe(98);

        store.forEach(record => {
            expect(typeof record.id, record.name).toBe('string');
            expect(record.id, record.name).toMatch(/^[a-z][a-z0-9-]*$/);
            ids.push(record.id)
        });

        expect(new Set(ids).size).toBe(98);
        expect(list.catalogMode).toBe('dist_prod')
    });

    test('catalogs the basic and dedicated week-view Calendar examples in order', () => {
        const index = catalog.findIndex(record => record.id === 'calendar'),
              [basic, weekview] = catalog.slice(index, index + 2),
              urls = {
                  devmode : 'examples/calendar',
                  dist_dev: 'dist/development/examples/calendar',
                  dist_esm: 'dist/esm/examples/calendar',
                  dist_prod: 'dist/production/examples/calendar'
              };

        expect([basic?.id, weekview?.id]).toEqual(['calendar', 'calendar-weekview']);
        expect(basic).toMatchObject({
            family   : 'calendar',
            component: 'Calendar',
            feature  : expect.any(String),
            lookFor  : expect.any(String)
        });
        expect(weekview).toMatchObject({
            id       : 'calendar-weekview',
            name     : 'Calendar Week View',
            family   : 'calendar',
            component: 'Calendar',
            feature  : expect.any(String),
            lookFor  : expect.any(String),
            featured : false,
            image    : null,
            sourceUrl: 'examples/calendar/weekview',
            urls     : {
                devmode : `${urls.devmode}/weekview/index.html`,
                dist_dev: `${urls.dist_dev}/weekview/index.html`,
                dist_esm: `${urls.dist_esm}/weekview/index.html`,
                dist_prod: `${urls.dist_prod}/weekview/index.html`
            }
        });
        expect(basic.urls).toEqual({
            devmode : `${urls.devmode}/basic/index.html`,
            dist_dev: `${urls.dist_dev}/basic/index.html`,
            dist_esm: `${urls.dist_esm}/basic/index.html`,
            dist_prod: `${urls.dist_prod}/basic/index.html`
        })
    });

    test('visual component records keep their captions and build destinations in their home groups', () => {
        const store = createView().getCatalogStore(),
              homes = {
                  'am-charts'       : 'charts',
                  canvas            : 'charts',
                  carousel          : 'lists',
                  'cesium-js'       : 'charts',
                  'graph-scene'     : 'charts',
                  'open-street-maps': 'charts',
                  toast             : 'dialogs',
                  'video-move'      : 'platform'
              };

        for (const id of componentExampleIds) {
            const record = store.get(id),
                  page   = record.sourceUrl + '/index.html';

            expect(record.family, id).toBe(homes[id] ?? 'components');
            expect(record.feature?.trim(), id).toBeTruthy();
            expect(record.lookFor?.trim(), id).toBeTruthy();
            expect(record.urls, id).toEqual({
                devmode  : page,
                dist_dev : 'dist/development/' + page,
                dist_esm : 'dist/esm/' + page,
                dist_prod: 'dist/production/' + page
            })
        }
    });

    test('every record has a home group, and alsoIn names only other defined groups', () => {
        const groups = ExamplesTabContainer.config.familyDefinitions.map(definition => definition.family).filter(Boolean),
              moved  = {
                  apps      : ['webdesktop', 'devindex', 'covid-dashboard', 'portal', 'realworld', 'realworld-v2'],
                  components: ['liquid-glass'],
                  dashboard : ['dock-choreography', 'dock-layouts', 'dock-cross-window', 'dock-tear-out'],
                  dialogs   : ['dialog-drag-drop'],
                  gantt     : ['gantt-basic'],
                  layouts   : ['layout-form'],
                  lists     : ['helix', 'covid-helix', 'covid-gallery', 'gallery'],
                  platform  : ['offscreen-canvas'],
                  scheduler : ['scheduler-basic'],
                  state     : ['state-provider'],
                  tabs      : ['tab-container'],
                  timeline  : ['timeline-basic']
              };

        expect(groups).toHaveLength(22);
        catalog.forEach(record => {
            expect(groups, record.id).toContain(record.family);
            (record.alsoIn || []).forEach(group => {
                expect(groups, record.id).toContain(group);
                expect(group, record.id).not.toBe(record.family)
            })
        });

        // the 23 records the data pass moved, and the alsoIn lists it wrote
        Object.entries(moved).forEach(([group, ids]) => ids.forEach(id => expect(catalog.find(record => record.id === id).family, id).toBe(group)));
        expect(Object.values(moved).flat()).toHaveLength(23);
        expect(Object.fromEntries(catalog.filter(record => record.alsoIn?.length).map(record => [record.id, record.alsoIn]))).toEqual({
            'workstation'            : ['apps'],
            'shared-covid'           : ['apps'],
            'offscreen-canvas'       : ['charts'],
            'shared-offscreen-canvas': ['platform'],
            'multi-window-drag-drop' : ['apps', 'drag-drop'],
            'dialog-drag-drop'       : ['drag-drop'],
            'colors-dashboard'       : ['apps'],
            'form-app'               : ['apps'],
            'layout-form'            : ['forms'],
            'dock-cross-window'      : ['multi-window'],
            'dock-tear-out'          : ['multi-window', 'drag-drop']
        })
    });

    test('every record that publishes a card has both a feature and an observation, with rejecting controls', () => {
        function check(records) {
            records.filter(record => modes.some(mode => Example.publishes(record, mode))).forEach(record => {
                expect(record.feature?.trim(), record.id + ' feature').toBeTruthy();
                expect(record.lookFor?.trim(), record.id + ' lookFor').toBeTruthy()
            })
        }

        check(catalog);
        const example = catalog.find(record => Example.publishes(record, 'dist_prod'));
        expect(() => check([{...example, feature: ''}])).toThrow();
        expect(() => check([{...example, lookFor: ''}])).toThrow()
    });

    test('the catalog holds the 15 Grid and Table identities and the overview shows the covered ones', () => {
        const view         = createView(),
              catalogStore = view.getCatalogStore(),
              store        = view.getCard(1).store,
              ids          = [], counts = {Grid: 0, Table: 0};

        catalogStore.forEach(record => {
            if (record.family === 'grid-table') {
                ids.push(record.id);
                counts[record.component]++;
                expect(record.feature, record.id).toBeTruthy();
                expect(record.lookFor, record.id).toBeTruthy()
            }
        });

        expect(ids).toEqual(coveredGridTableIds);
        expect(counts).toEqual({Grid: 14, Table: 2});
        expect(store.items.map(record => record.id)).toEqual(coveredGridTableIds);
        expect(store.getSource()).toBe(catalogStore)
    });

    test('the Multi-Window overview borrows the catalog records and respects each build destination', () => {
        const view         = createView(),
              catalogStore = view.getCatalogStore(),
              list         = view.getCard(tabIndex(view, '/examples/multi-window')),
              {store}      = list;

        expect(store.getSource()).toBe(catalogStore);
        expect(store.items.map(record => record.id)).toEqual(coveredMultiWindowIds);
        // the dock examples moved home to Dashboard & Docking; two of them stay listed here through alsoIn
        expect(catalogStore.items.filter(record => record.family === 'multi-window').map(record => record.id)).toEqual([
            ...coveredMultiWindowIds, 'multi-window-helix', 'multi-window-state-provider'
        ]);
        expect(catalogStore.items.filter(record => Example.belongsTo(record, 'multi-window') && record.family !== 'multi-window')
            .map(record => record.id)).toEqual(['dock-cross-window', 'dock-tear-out']);

        for (const mode of modes) {

            list.catalogMode = mode;
            expect(store.items.filter(record => !list.isHiddenItem(record)).map(record => record.id)).toEqual(
                store.items.map(record => record.id).filter(id => mode !== 'dist_esm' || id !== 'shared-offscreen-canvas')
            )
        }

        expect(catalogStore.get('dock-layouts').sharedWorkers).toBe(false);
        expect(catalogStore.get('dock-tear-out').sharedWorkers).toBe(true)
    });

    test('preserves the established order and inserts the Multi-Window block after choreography', () => {
        const {store} = createList(),
              // The production catalog established this sequence before canonicalization. ESM alone
              // placed OffscreenCanvas before Covid Gallery; the shared sequence follows production.
              establishedIds = featuredExampleIds.slice(0, -1),
              calendarIndex = establishedIds.indexOf('calendar'),
              orderedEstablishedIds = [
                  ...establishedIds.slice(0, calendarIndex + 1), 'calendar-weekview', ...establishedIds.slice(calendarIndex + 1)
              ],
              galleryIndex = orderedEstablishedIds.indexOf('gallery'),
              completeIds  = [
                  ...orderedEstablishedIds.slice(0, galleryIndex + 1), ...componentExampleIds,
                  ...orderedEstablishedIds.slice(galleryIndex + 1), ...newExampleIds, ...formExampleIds,
                  'board-basic', 'gantt-basic', 'scheduler-basic', 'timeline-basic', 'dock-choreography',
                  ...multiWindowExampleIds, 'realworld', 'realworld-v2'
              ],
              excluded = {
                  devmode  : ['portal', 'liquid-glass', 'realworld', 'realworld-v2'],
                  dist_dev : ['realworld', 'realworld-v2'],
                  dist_esm : ['shared-offscreen-canvas', 'realworld', 'realworld-v2'],
                  dist_prod: ['realworld', 'realworld-v2']
              },
              cases   = [
                  ['devmode', 'apps/workstation/index.html', 'examples/dashboard/choreography/index.html'],
                  ['dist_dev', 'dist/development/apps/workstation/index.html', 'dist/development/examples/dashboard/choreography/index.html'],
                  ['dist_esm', 'dist/esm/apps/workstation/index.html', 'dist/esm/examples/dashboard/choreography/index.html'],
                  ['dist_prod', 'dist/production/apps/workstation/index.html', 'dist/production/examples/dashboard/choreography/index.html']
              ];

        expect(store.items.map(record => record.id)).toEqual(completeIds);

        // the list hides what its store would filter out: a record without a cover publishes no card in any mode
        const uncovered = completeIds.filter(id => !store.get(id).image);

        expect(uncovered).toHaveLength(54);

        cases.forEach(([mode, workstationUrl, choreographyUrl]) => {
            list.catalogMode = mode;
            expect(list.environment).toBe(mode === 'devmode' ? 'development' : mode === 'dist_dev' ? 'dist/development' : 'dist/production');

            const visible = store.items.filter(record => !list.isHiddenItem(record));

            expect(visible.map(record => record.id), mode).toEqual(completeIds.filter(id => !excluded[mode].includes(id) && !uncovered.includes(id)));
            expect(list.createLink(visible[0]).href).toBe(list.baseUrl + workstationUrl);
            expect(list.createLink(store.get('dock-choreography')).href).toBe(list.baseUrl + choreographyUrl)
        })
    });

    test('keeps explicit external destinations, source overrides and per-mode visibility', () => {
        const {store}         = createList(),
              devIndex        = store.get('devindex'),
              offscreen       = store.get('offscreen-canvas'),
              sharedOffscreen = store.get('shared-offscreen-canvas'),
              liquidGlass     = store.get('liquid-glass'),
              devIndexUrls    = {
                  devmode  : 'https://neomjs.com/devindex/',
                  dist_dev : 'https://neomjs.com/devindex/dist/development/apps/devindex/',
                  dist_esm : 'https://neomjs.com/devindex/',
                  dist_prod: 'https://neomjs.com/devindex/dist/production/apps/devindex/'
              };

        modes.forEach(mode => {
            list.catalogMode = mode;
            expect(list.createLink(devIndex).href, mode).toBe(devIndexUrls[mode]);
            expect(list.createLink(devIndex).target, mode).toBe('_blank');
            expect(list.createSourceLink(offscreen).href, mode).toBe(mode === 'devmode'
                ? 'https://github.com/neomjs/offscreen-canvas/'
                : 'https://github.com/neomjs/offscreen-canvas/tree/main/apps/myapp');
            expect(list.isHiddenItem(sharedOffscreen), mode).toBe(mode === 'dist_esm');
            expect(list.isHiddenItem(liquidGlass), mode).toBe(mode === 'devmode');
            expect(list.isHiddenItem(store.get('realworld')), mode).toBe(true);
            expect(list.isHiddenItem(store.get('realworld-v2')), mode).toBe(true)
        });

        expect(sharedOffscreen.urls).not.toHaveProperty('dist_esm');
        expect(liquidGlass.hiddenIn).toEqual(['devmode']);
        list.catalogMode = 'dist_esm';
        expect(list.createLink(sharedOffscreen).href).toBeNull()
    });

    test('formerly overlapping numeric ids retain distinct logical apps across build modes', () => {
        const {store}  = createList(),
              tree     = store.get('grid-tree-big-data'),
              shared   = store.get('shared-covid'),
              prefixes = {devmode: '', dist_dev: 'dist/development/', dist_esm: 'dist/esm/', dist_prod: 'dist/production/'};

        // Old devmode id 24 meant Shared Covid; ESM id 24 meant TreeGrid. Neither mode may rename the other app.
        expect(tree).not.toBe(shared);
        expect(tree.sourceUrl).toBe('examples/grid/treeBigData');
        expect(shared.sourceUrl).toBe('apps/sharedcovid');

        modes.forEach(mode => {
            list.catalogMode = mode;
            expect(store.get(tree.id)).toBe(tree);
            expect(store.get(shared.id)).toBe(shared);
            expect(list.createLink(tree).href).toBe(list.baseUrl + prefixes[mode] + 'examples/grid/treeBigData/index.html');
            expect(list.createLink(shared).href).toBe(list.baseUrl + prefixes[mode] + 'apps/sharedcovid/index.html#mainview=table')
        })
    });

    test('lists the issues showcase once with its real cover in every mode', () => {
        const {store} = createList(),
              issues  = store.items.filter(record => record.sourceUrl === 'examples/grid/issues');

        expect(issues).toHaveLength(1);
        expect(issues[0].id).toBe('grid-issues');
        expect(issues[0].image).toBe('devmode/grid-issues-14.jpg');
        const recipes = JSON.parse(fs.readFileSync(path.join(dataRoot, 'example-captures.json'), 'utf8')).recipes;
        expect(recipes.filter(recipe => recipe.id === issues[0].id)).toHaveLength(1);

        modes.forEach(mode => {
            list.catalogMode = mode;
            expect(list.isHiddenItem(issues[0]), mode).toBe(false);
            expect(list.createLink(issues[0]).href, mode).toBe(list.baseUrl + issues[0].urls[mode])
        })
    });

    test('renders title and proof line on the cover, and the action, scope and links behind them', () => {
        const {store} = createList(),
              byCls   = (node, cls) => node.cls?.includes(cls) ? node : (node.cn || []).map(child => byCls(child, cls)).find(Boolean);

        store.items.filter(record => modes.some(mode => Example.publishes(record, mode))).forEach(record => {
            const content = list.createItemContent(record, 0)[0],
                  details = content.cn.find(node => node.cls?.includes('neo-item-bottom-position')),
                  more    = details.cn.find(node => node.cls?.includes('portal-example-more')),
                  feature = details.cn.find(node => node.cls?.includes('portal-example-feature')),
                  lookFor = byCls(more, 'portal-example-look-for');

            // always on the cover: the link and the proof line, in that order, then the part the styles open
            expect(details.cn.map(node => node.cls?.[0] ?? node.tag), record.id).toEqual(['neo-title', 'portal-example-feature', 'portal-example-more']);
            expect(feature.text, record.id).toBe(record.feature);
            expect(feature.removeDom, record.id).toBe(false);
            expect(lookFor.text, record.id).toBe(record.lookFor);
            expect(lookFor.removeDom, record.id).toBe(false);
            expect(details.cn[0].href, record.id).toBe(list.createLink(record).href);
            expect(byCls(more, 'neo-github-image').href, record.id).toBe(list.createSourceLink(record).href);
            expect(byCls(content, 'portal-example-placeholder'), record.id).toBeUndefined()
        });

        ['grid-countries', 'grid-issues'].forEach(id => {
            const record  = store.get(id),
                  content = list.createItemContent(record, 0)[0],
                  scope   = byCls(content, 'portal-example-scope');

            expect(record.scope, id).toBeTruthy();
            expect(scope.text, id).toBe(record.scope);
            expect(scope.removeDom, id).toBe(false)
        });

        expect(store.get('grid-issues').scope).toContain('issue snapshot');
        expect(store.get('grid-countries').scope).toContain('CC BY 4.0');
        expect(list.getBackgroundImageStyle(store.get('grid-tree')).backgroundImage).toContain('grid-tree-14.jpg');
        const uncovered = store.items.find(record => !record.image);
        expect(uncovered).toBeDefined();
        expect(list.getBackgroundImageStyle(uncovered).backgroundImage).not.toContain('url(')
    })
});
