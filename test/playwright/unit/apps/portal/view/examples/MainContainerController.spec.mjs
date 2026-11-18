import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalExamplesMainControllerTest'
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
import ExampleGroup                  from '../../../../../../../apps/portal/model/ExampleGroup.mjs';
import ExamplesList                  from '../../../../../../../apps/portal/view/examples/List.mjs';
import ExamplesStore                 from '../../../../../../../apps/portal/store/Examples.mjs';
import ExamplesMainContainer         from '../../../../../../../apps/portal/view/examples/MainContainer.mjs';

const
    directory = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot  = path.resolve(directory, '../../../../../../../'),
    dataRoot  = path.join(repoRoot, 'apps/portal/resources/data');

let exampleView;

/**
 * @summary The card the section shows: the overview, or a group page.
 * @param {Portal.view.examples.MainContainer} view
 * @returns {String} 'overview', or the open page's group
 */
const openCard = view => view.items[view.layout.activeIndex].family || 'overview';

/**
 * @summary The ids a group page lists.
 * @param {Portal.view.examples.MainContainer} view
 * @param {String} family
 * @returns {String[]}
 */
const pageIds = (view, family) => view.getGroupPage(family).getList().store.items.map(record => record.id);

/**
 * @summary Constructs the real section with an owned in-memory catalog and no network fetch.
 * @param {Object[]} [records=catalog]
 * @param {String} [catalogMode='dist_prod']
 * @returns {Portal.view.examples.MainContainer}
 */
function createView(records=catalog, catalogMode='dist_prod') {
    const defaults = ExamplesMainContainer.config.stateProvider;

    return exampleView = Neo.create(ExamplesMainContainer, {
        appName      : 'PortalExamplesMainControllerTest',
        windowId     : 1,
        stateProvider: {
            ...defaults,
            data  : {catalogMode},
            stores: {...defaults.stores, catalog: {...defaults.stores.catalog, data: structuredClone(records), isLoaded: true}}
        }
    })
}

test.afterEach(() => {
    exampleView?.destroy();
    exampleView = null
});

test.describe('Portal examples overview and group pages', () => {
    test('an initial shared ESM selection renders ESM destinations on the group pages', () => {
        const view = createView(catalog, 'dist_esm');

        function hrefs(node) {
            return [node.href, ...(node.cn || []).flatMap(hrefs)].filter(Boolean)
        }

        expect(hrefs(view.getGroupPage('multi-window').getList().vdom)).toContain('https://neomjs.com/dist/esm/apps/workstation/index.html');
        expect(hrefs(view.getGroupPage('grid-table').getList().vdom)).toContain('https://neomjs.com/dist/esm/examples/grid/treeBigData/index.html')
    });

    for (const mode of ['dist_prod', 'dist_esm']) {
        test(`an initial ${mode} selection renders a group's items once`, () => {
            const view  = createView(catalog, mode),
                  list  = view.getGroupPage('grid-table').getList(),
                  items = list.getVdomRoot().cn;

            expect(list.store.getCount()).toBe(coveredGridTableIds.length);
            expect(items).toHaveLength(coveredGridTableIds.length);
            expect(new Set(items.map(item => item.id)).size).toBe(coveredGridTableIds.length)
        })
    }

    test('publishes the groups with a covered member from one definition source, each counting its home records', () => {
        const view       = createView(),
              groupStore = view.getGroupStore(),
              published  = view.getCatalogStore().items.filter(record => Example.publishes(record, 'dist_prod'));

        // Tree, Board and others are defined and have records; none has a cover yet, so none appears
        expect(groupStore.items.map(group => group.route)).toEqual(publishedRoutes);
        expect(view.getGroupPages().map(page => page.family)).toEqual(groupStore.items.map(group => group.family));
        expect(view.getCatalogStore().getCount()).toBe(96);

        // every example counts once, in its home group: the counts add up to the records that publish
        expect(groupStore.items.reduce((sum, group) => sum + group.count, 0)).toBe(published.length);
        expect(published).toHaveLength(46);
        expect(Object.fromEntries(groupStore.items.map(group => [group.family, [group.count, group.crossCount]]))).toEqual({
            'grid-table'  : [17, 0], forms: [3, 0], calendar: [1, 0], scheduler: [1, 0], gantt: [1, 0], tabs: [1, 0],
            dashboard     : [3, 0], 'drag-drop': [0, 2], lists: [4, 0], dialogs: [1, 0], charts: [1, 1], components: [1, 0],
            'multi-window': [6, 1], state: [1, 0], platform: [1, 1], apps: [4, 4]
        });

        // the tile record's cover stands for its group, else the group's first card's
        expect(groupStore.get('grid-table').image).toBe('devmode/grid-tree-big-data-14.jpg');
        expect(groupStore.get('forms').image).toBe('devmode/dateSelector.png');
        expect(groupStore.get('charts').image).toBe('devmode/open-street-maps-14.jpg');
        expect(groupStore.get('apps').image).toBe('devmode/webdesktop-14-0.jpg');

        expect(pageIds(view, 'grid-table')).toEqual(coveredGridTableIds);
        expect(pageIds(view, 'forms')).toEqual(['date-selector', 'date-field', 'combobox-field']);
        expect(pageIds(view, 'multi-window')).toEqual(multiWindowPageIds);
        expect(pageIds(view, 'calendar')).toEqual(['calendar']);
        expect(pageIds(view, 'scheduler')).toEqual(['scheduler-basic']);
        expect(pageIds(view, 'gantt')).toEqual(['gantt-basic']);
        // a group lists its home records and the records whose alsoIn names it, in catalog order
        expect(pageIds(view, 'drag-drop')).toEqual(['multi-window-drag-drop', 'dialog-drag-drop']);
        expect(pageIds(view, 'apps')).toEqual([
            'workstation', 'webdesktop', 'devindex', 'shared-covid', 'multi-window-drag-drop', 'colors-dashboard',
            'covid-dashboard', 'portal'
        ]);

        // every card of every page has a cover; the catalog keeps the records that wait for one
        view.getGroupPages().forEach(page => page.getList().store.forEach(record => expect(record.image, record.id).toBeTruthy()));
        expect(view.getCatalogStore().items.filter(record => !record.image)).toHaveLength(48);
        expect(view.getCatalogStore().items.filter(record => record.image && !Example.publishes(record, 'dist_prod')).map(record => record.id))
            .toEqual(['realworld', 'realworld-v2']);
        expect(view.getGroupPage('grid-table').getList().store.getSource()).toBe(view.getCatalogStore());
        expect(view.getGroupPage('grid-table').getList().store.model).toBe(view.getCatalogStore().model)
    });

    test('the overview counts the published examples into its headline and shows each band with its groups', () => {
        const view     = createView(),
              overview = view.down({reference: 'examples-overview'}),
              intro    = overview.down({reference: 'overview-intro'}),
              heading  = band => overview.down({reference: 'overview-band-' + band}).items[0].vdom.cn[1].text;

        expect(intro.vdom.cn[1].text).toBe('46 live examples in 16 groups');
        expect(overview.down({reference: 'overview-index-heading'}).vdom.cn[0].text).toBe('All 16 groups');
        expect(overview.down({reference: 'overview-start-cards'}).store.items.map(group => group.family)).toEqual(['grid-table', 'forms', 'multi-window']);
        expect(['complex-widgets', 'component-shelves', 'platform-proofs', 'applications'].map(heading)).toEqual(['8 groups', '4 groups', '3 groups', '1 group']);

        // the action opens its record in the selected build
        expect(overview.down({reference: 'overview-action-grid-big-data'}).url).toBe('https://neomjs.com/dist/production/examples/grid/bigData/index.html');
        view.getController().onSelectBuild({id: 'dist_esm'});
        expect(overview.down({reference: 'overview-action-grid-big-data'}).url).toBe('https://neomjs.com/dist/esm/examples/grid/bigData/index.html')
    });

    test('the banded index links every published group by band with its count, and marks the open one', () => {
        const view  = createView(),
              index = view.down({ntype: 'portal-examples-group-index'}),
              sheet = view.getGroupPage('drag-drop').getSheet(),
              links = component => component.vdom.cn.filter(node => node.tag === 'section').flatMap(band => band.cn[1].cn.map(item => item.cn[0]));

        expect(index.presentation).toBe('overview');
        expect(index.vdom.cn.filter(node => node.tag === 'section').map(band => band.cn[0].text))
            .toEqual(['Complex widgets', 'Component shelves', 'Platform proofs', 'Applications']);
        expect(links(index).map(link => link.href)).toEqual(publishedRoutes.map(route => '#' + route));
        expect(links(index).map(link => link.cn[2].text)).toEqual(['17', '3', '1', '1', '1', '1', '3', '(2)', '4', '1', '1', '1', '6', '1', '1', '4']);
        expect(links(index).every(link => link['aria-current'] === null)).toBe(true);
        // the overview needs no way back to itself; the note explains a count in parentheses while one shows
        expect(index.vdom.cn[0].removeDom).toBe(true);
        expect(index.vdom.cn.at(-1).removeDom).toBe(false);

        expect(sheet.presentation).toBe('sheet');
        expect(sheet.vdom.cn[0].removeDom).toBe(false);
        expect(links(sheet).filter(link => link['aria-current'] === 'page').map(link => link.href)).toEqual(['#/examples/drag-drop']);
        expect(ExampleGroup.countLabel({count: 0, crossCount: 2})).toBe('2 from other groups');
        expect(ExampleGroup.countLabel({count: 1, crossCount: 0})).toBe('1 example');
        expect(ExampleGroup.countLabel({count: 4, crossCount: 4})).toBe('4 examples, 4 from other groups')
    });

    test('the group button opens and closes the sheet and says whether it is open', () => {
        const view   = createView(),
              page   = view.getGroupPage('grid-table'),
              button = page.getGroupButton(),
              sheet  = page.getSheet();

        expect(sheet.hidden).toBe(true);
        expect(button.getVdomRoot()['aria-expanded']).toBe(false);
        expect(button.getVdomRoot()['aria-controls']).toBe(sheet.id);

        page.sheetOpen = true;
        expect(sheet.hidden).toBe(false);
        expect(button.getVdomRoot()['aria-expanded']).toBe(true);

        page.onSheetKeyDown({key: 'Escape'});
        expect(page.sheetOpen).toBe(false);
        expect(sheet.hidden).toBe(true);

        page.sheetOpen = true;
        page.onSheetClick({path: [{tagName: 'span'}, {tagName: 'a'}]});
        expect(page.sheetOpen).toBe(false)
    });

    test('the desktop control is the upright index beside the cards, with the open group marked', () => {
        const view  = createView(),
              page  = view.getGroupPage('grid-table'),
              index = page.down({reference: 'group-index'});

        expect(index.presentation).toBe('list');
        expect(index.hidden).toBe(false);
        expect(index.vdom.cn.find(node => node.tag === 'section').cn[1].cn[0].cn[0]['aria-current']).toBe('page');
        expect(page.getGroupButton().badgeText).toBeFalsy()
    });

    test('resolves group routes and all legacy modes', async () => {
        const view       = createView(),
              controller = view.getController();

        await controller.onExamplesRoute();
        expect(openCard(view)).toBe('overview');

        for (const mode of view.buildModes) {
            await controller.onExamplesRoute({itemId: mode.id});
            expect(openCard(view)).toBe('overview');
            expect(view.catalogMode).toBe(mode.id);
            expect(view.getGroupPage('grid-table').getList().catalogMode).toBe(mode.id)
        }

        // The loop above ends in Dev mode, which publishes no More components page. Every group path defined on dev
        // before the groups became data still resolves in production.
        await controller.onExamplesRoute({itemId: 'dist_prod'});

        for (const [itemId, family] of [['grid', 'grid-table'], ['forms', 'forms'], ['multi-window', 'multi-window'], ['calendar', 'calendar'], ['components', 'components'], ['state', 'state']]) {
            await controller.onExamplesRoute({itemId});
            expect(openCard(view), itemId).toBe(family)
        }

        // a defined group without a cover has no page yet, and an unknown one none at all: both show the overview
        await controller.onExamplesRoute({itemId: 'board'});
        expect(openCard(view)).toBe('overview');
        await controller.onExamplesRoute({itemId: 'gantt'});
        expect(openCard(view)).toBe('gantt');
        await controller.onExamplesRoute({itemId: 'drag-drop'});
        expect(openCard(view)).toBe('drag-drop');
        await controller.onExamplesRoute({itemId: 'unknown'});
        expect(openCard(view)).toBe('overview')
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

        expect(openCard(view)).toBe('overview');
        expect(view.catalogMode).toBe('dist_esm');
        expect(view.getGroupPage('grid-table').getList().catalogMode).toBe('dist_esm')
    });

    test('a newly published group needs no additional page or controller entry', () => {
        const view = createView([...catalog, {
            ...catalog[0], id: 'test-tree-example', family: 'tree', alsoIn: [], featured: false,
            feature: 'A tree', lookFor: 'Inspect it.'
        }]);

        expect(view.getGroupStore().items.map(group => group.route)).toEqual([publishedRoutes[0], '/examples/tree', ...publishedRoutes.slice(1)]);
        expect(pageIds(view, 'tree')).toEqual(['test-tree-example']);
        expect(view.getGroupStore().get('tree').iconCls).toBe(view.familyDefinitions.find(item => item.family === 'tree').iconCls)
    });

    test('the build publishes the search routes of exactly the groups the section shows', async () => {
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

        expect(published.map(family => family.route)).toEqual(view.getGroupStore().items.map(group => group.route));
        expect(published.map(family => family.route)).toEqual(publishedRoutes);
        published.forEach(family => {
            expect(family.records.map(record => record.id), family.route).toEqual(pageIds(view, family.family))
        })
    });

    for (const [name, images, published] of [
        ['a group whose records have no cover gets no entry and no page', [null], false],
        ['the first covered record publishes its group, and a record without a cover stays off its page', ['devmode/workstation-13-2.jpg', null], true]
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

            expect(view.getGroupStore().items.map(group => group.route)).toEqual(
                published ? [publishedRoutes[0], '/examples/tree', ...publishedRoutes.slice(1)] : publishedRoutes
            );
            expect(!!view.getGroupPage('tree')).toBe(published);
            published && expect(pageIds(view, 'tree')).toEqual(['test-tree-0'])
        })
    }

    test('an arriving catalog populates the group pages and withdraws an empty group', () => {
        const view = createView([]), store = view.getCatalogStore();

        expect(view.getGroupStore().getCount()).toBe(0);
        expect(view.getGroupPages()).toHaveLength(0);
        store.add(structuredClone(catalog));
        store.fire('load');
        expect(view.getGroupStore().items.map(group => group.route)).toEqual(publishedRoutes);
        expect(pageIds(view, 'grid-table')).toEqual(coveredGridTableIds);
        expect(pageIds(view, 'forms')).toHaveLength(3);

        store.remove(store.items.filter(record => record.family === 'grid-table'));
        store.fire('load');
        expect(view.getGroupStore().items.map(group => group.route)).toEqual(publishedRoutes.filter(route => route !== '/examples/grid'));
        expect(view.getGroupPage('grid-table')).toBeNull()
    });

    test('a record with alsoIn shows once in each of its groups and counts once, in its home group', () => {
        const view = createView();

        expect(pageIds(view, 'dialogs')).toEqual(['dialog-drag-drop']);
        expect(pageIds(view, 'drag-drop').filter(id => id === 'dialog-drag-drop')).toHaveLength(1);
        expect(pageIds(view, 'platform')).toEqual(['offscreen-canvas', 'shared-offscreen-canvas']);
        expect(pageIds(view, 'charts')).toEqual(['offscreen-canvas', 'open-street-maps']);
        expect(view.getGroupStore().get('dialogs').count).toBe(1);
        expect(view.getGroupStore().get('drag-drop').count).toBe(0);
        expect(view.getCatalogStore().items.filter(record => record.id === 'dialog-drag-drop')).toHaveLength(1);
        expect(view.getCatalogStore().getCount()).toBe(96)
    });

    for (const mode of ['dist_prod', 'dist_esm', 'dist_dev', 'devmode']) {
        test(`the ${mode} build publishes the groups with a card it can open`, () => {
            const view = createView(catalog, mode);

            // Dev mode hides liquid-glass, the one covered member of More components
            expect(view.getGroupStore().items.map(group => group.route)).toEqual(
                mode === 'devmode' ? publishedRoutes.filter(route => route !== '/examples/components') : publishedRoutes
            )
        })
    }

    test('a build selection republishes the groups, and an open group that loses its cards shows the overview until it publishes again', async () => {
        const view       = createView(),
              controller = view.getController();

        await controller.onExamplesRoute({itemId: 'components'});
        expect(openCard(view)).toBe('components');

        controller.onSelectBuild({id: 'devmode'});
        expect(view.getGroupStore().items.map(group => group.route)).not.toContain('/examples/components');
        expect(view.getGroupPage('components')).toBeNull();
        expect(openCard(view)).toBe('overview');
        // the overview's headline follows the build: Dev mode cannot open liquid-glass
        expect(view.down({reference: 'overview-intro'}).vdom.cn[1].text).toBe('45 live examples in 15 groups');

        // the route still names the group: its page returns with its cards
        controller.onSelectBuild({id: 'dist_prod'});
        expect(view.getGroupStore().items.map(group => group.route)).toEqual(publishedRoutes);
        expect(openCard(view)).toBe('components');
        expect(pageIds(view, 'components')).toEqual(['liquid-glass'])
    });

    test('an open page stays open when a build switch removes or adds another page', async () => {
        const view       = createView(),
              controller = view.getController();

        await controller.onExamplesRoute({itemId: 'multi-window'});
        expect(openCard(view)).toBe('multi-window');

        // Dev mode removes More components, a page created before Multi-Window
        controller.onSelectBuild({id: 'devmode'});
        expect(openCard(view)).toBe('multi-window');

        // Production adds it again, after the open page
        controller.onSelectBuild({id: 'dist_prod'});
        expect(openCard(view)).toBe('multi-window');
        expect(view.layout.activeIndex).toBe(view.indexOf(view.getGroupPage('multi-window')))
    });
});

const catalog = JSON.parse(fs.readFileSync(path.join(dataRoot, 'examples.json'), 'utf8')),
      modes   = ['devmode', 'dist_dev', 'dist_esm', 'dist_prod'],
      // the catalog's order before canonicalization, which the production catalog established
      establishedExampleIds = [
          'workstation', 'webdesktop', 'devindex', 'grid-tree-big-data', 'shared-covid', 'grid-big-data', 'grid-issues',
          'calendar', 'helix', 'multi-window-covid-gallery', 'offscreen-canvas', 'shared-offscreen-canvas',
          'multi-window-drag-drop', 'tab-container', 'state-provider', 'dialog-drag-drop',
          'colors-dashboard', 'covid-dashboard', 'covid-helix', 'covid-gallery', 'gallery',
          'table-filtering', 'date-selector', 'date-field', 'combobox-field', 'portal', 'liquid-glass',
          'dock-choreography'
      ],
      newExampleIds = [
          'grid-animated-row-sorting', 'grid-cell-editing', 'grid-container', 'grid-content-sized-rows',
          'grid-countries', 'grid-filtering', 'grid-export', 'grid-header-groups', 'grid-locked-columns',
          'grid-nested-record-fields', 'grid-tree', 'grid-value-banding', 'table-container'
      ],
      componentExampleIds = [
          'carousel', 'chip', 'circle', 'clock', 'graph-scene', 'magic-move-text',
          'markdown', 'mwc-button', 'mwc-buttons', 'mwc-text-field', 'mwc-text-fields',
          'process', 'process-real-world', 'progress', 'splitter', 'status-badge', 'timer',
          'toast', 'video', 'monaco-editor', 'open-street-maps', 'am-charts',
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
      // the records of a group that name a cover: the cards its page shows
      coveredGridTableIds   = ['grid-tree-big-data', 'grid-big-data', 'grid-issues', 'table-filtering', ...newExampleIds],
      coveredMultiWindowIds = [
          'workstation', 'shared-covid', 'multi-window-covid-gallery', 'shared-offscreen-canvas',
          'multi-window-drag-drop', 'colors-dashboard'
      ],
      // the Multi-Window page also shows dock-cross-window, a Dashboard & Docking record whose alsoIn names it
      multiWindowPageIds    = [...coveredMultiWindowIds, 'dock-cross-window'],
      // the 16 groups with a card a production build opens on this catalog, in definition order
      publishedRoutes = [
          '/examples/grid', '/examples/forms', '/examples/calendar', '/examples/scheduler', '/examples/gantt',
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
            appName: 'PortalExamplesMainControllerTest',
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

    test('loads 96 logical examples with unique stable string identities', () => {
        const {store} = createList(),
              ids     = [];

        expect(catalog).toHaveLength(96);
        expect(store.getCount()).toBe(96);

        store.forEach(record => {
            expect(typeof record.id, record.name).toBe('string');
            expect(record.id, record.name).toMatch(/^[a-z][a-z0-9-]*$/);
            ids.push(record.id)
        });

        expect(new Set(ids).size).toBe(96);
        expect(list.catalogMode).toBe('dist_prod')
    });

    test('catalogs one Calendar example, the full calendar', () => {
        const [basic, ...others] = catalog.filter(record => record.family === 'calendar'),
              urls               = {
                  devmode  : 'examples/calendar',
                  dist_dev : 'dist/development/examples/calendar',
                  dist_esm : 'dist/esm/examples/calendar',
                  dist_prod: 'dist/production/examples/calendar'
              };

        expect(others).toEqual([]);
        expect(basic).toMatchObject({
            id       : 'calendar',
            family   : 'calendar',
            component: 'Calendar',
            feature  : expect.any(String),
            lookFor  : expect.any(String)
        });
        expect(basic.urls).toEqual({
            devmode  : `${urls.devmode}/basic/index.html`,
            dist_dev : `${urls.dist_dev}/basic/index.html`,
            dist_esm : `${urls.dist_esm}/basic/index.html`,
            dist_prod: `${urls.dist_prod}/basic/index.html`
        })
    });

    test('visual component records keep their captions and build destinations in their home groups', () => {
        const store = createView().getCatalogStore(),
              homes = {
                  'am-charts'       : 'charts',
                  carousel          : 'lists',
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
        const groups = ExamplesMainContainer.config.familyDefinitions.map(definition => definition.family),
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
        expect(new Set(ExamplesMainContainer.config.familyDefinitions.map(definition => definition.band)).size).toBe(4);
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

    test('a tile names a record of its own group', () => {
        ExamplesMainContainer.config.familyDefinitions.filter(definition => definition.tile).forEach(({family, tile}) => {
            const record = catalog.find(item => item.id === tile);

            // a tile whose record is not in the catalog yet waits for it, and the group falls back to its first card
            record && expect(Example.belongsTo(record, family), tile).toBe(true)
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

    test('the catalog holds the 17 Grid and Table identities and their page shows the covered ones', () => {
        const view         = createView(),
              catalogStore = view.getCatalogStore(),
              store        = view.getGroupPage('grid-table').getList().store,
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
        expect(counts).toEqual({Grid: 15, Table: 2});
        expect(store.items.map(record => record.id)).toEqual(coveredGridTableIds);
        expect(store.getSource()).toBe(catalogStore)
    });

    test('the Multi-Window page borrows the catalog records and respects each build destination', () => {
        const view         = createView(),
              catalogStore = view.getCatalogStore(),
              list         = view.getGroupPage('multi-window').getList(),
              {store}      = list;

        expect(store.getSource()).toBe(catalogStore);
        expect(store.items.map(record => record.id)).toEqual(multiWindowPageIds);
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
              establishedIds = establishedExampleIds.slice(0, -1),
              galleryIndex   = establishedIds.indexOf('gallery'),
              completeIds    = [
                  ...establishedIds.slice(0, galleryIndex + 1), ...componentExampleIds,
                  ...establishedIds.slice(galleryIndex + 1), ...newExampleIds, ...formExampleIds,
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

        expect(uncovered).toHaveLength(48);

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
            expect(Example.href(devIndex, mode), mode).toBe(devIndexUrls[mode]);
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
