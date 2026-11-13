import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalExamplesTabControllerTest'
    }
});

import {test, expect}         from '@playwright/test';
import fs                     from 'node:fs';
import path                   from 'node:path';
import {fileURLToPath}        from 'node:url';
import Neo                    from '../../../../../../../src/Neo.mjs';
import * as core              from '../../../../../../../src/core/_export.mjs';
import ExamplesList           from '../../../../../../../apps/portal/view/examples/List.mjs';
import ExamplesStore          from '../../../../../../../apps/portal/store/Examples.mjs';
import ExamplesTabContainer   from '../../../../../../../apps/portal/view/examples/TabContainer.mjs';
import TabContainerController from '../../../../../../../apps/portal/view/examples/TabContainerController.mjs';

const
    directory = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot  = path.resolve(directory, '../../../../../../../'),
    dataRoot  = path.join(repoRoot, 'apps/portal/resources/data');

let exampleView;

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
        expect(hrefs(view.getCard(1).vdom)).toContain('https://neomjs.com/dist/esm/examples/grid/cellEditing/index.html')
    });

    for (const mode of ['dist_prod', 'dist_esm']) {
        test(`an initial ${mode} selection renders family items once`, () => {
            const view  = createView(catalog, mode),
                  list  = view.getCard(1),
                  items = list.getVdomRoot().cn;

            expect(list.store.getCount()).toBe(21);
            expect(items).toHaveLength(21);
            expect(new Set(items.map(item => item.id)).size).toBe(21)
        })
    }

    test('publishes only Featured and families with records from one definition source', () => {
        const view = createView();

        expect(view.getTabButtons().map(button => button.text)).toEqual(['Featured', 'Grid & Table', 'Forms']);
        expect(view.getTabButtons().map(button => button.route)).toEqual(['/examples', '/examples/grid', '/examples/forms']);
        expect(view.getCatalogStore().getCount()).toBe(67);
        expect(view.getCard(0).store.getCount()).toBe(27);
        expect(view.getCard(0).store.items.map(record => record.id)).toEqual(featuredExampleIds);
        expect(view.getCard(1).store.getCount()).toBe(21);
        expect(view.getCard(2).store.getCount()).toBe(24);
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

        await controller.onExamplesRoute({itemId: 'grid'});
        expect(view.activeIndex).toBe(1);
        await controller.onExamplesRoute({itemId: 'forms'});
        expect(view.activeIndex).toBe(2);
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

    test('a newly published family needs no additional tab or controller entry', () => {
        const view = createView([...catalog, {
            ...catalog[0], id: 'test-multi-window-example', family: 'multi-window', featured: false,
            feature: 'A window', lookFor: 'Move it.'
        }]);

        expect(view.getTabButtons().map(button => button.route)).toEqual(['/examples', '/examples/grid', '/examples/forms', '/examples/multi-window']);
        expect(view.getCard(3).store.getCount()).toBe(1);
        expect(view.getCard(3).fallbackIconCls).toBe(view.familyDefinitions.find(item => item.family === 'multi-window').iconCls)
    });

    test('an arriving catalog populates the borrowed family stores and withdraws an empty family', () => {
        const view = createView([]), store = view.getCatalogStore();

        expect(view.getTabButtons().map(button => button.route)).toEqual(['/examples']);
        store.add(structuredClone(catalog));
        store.fire('load');
        expect(view.getCard(0).store.getCount()).toBe(27);
        expect(view.getCard(1).store.getCount()).toBe(21);
        expect(view.getCard(2).store.getCount()).toBe(24);

        store.remove(store.items.filter(record => record.family === 'grid-table'));
        store.fire('load');
        expect(view.getTabButtons().map(button => button.route)).toEqual(['/examples', '/examples/forms'])
    });
});

const catalog            = JSON.parse(fs.readFileSync(path.join(dataRoot, 'examples.json'), 'utf8')),
      modes              = ['devmode', 'dist_dev', 'dist_esm', 'dist_prod'],
      featuredExampleIds = [
          'workstation', 'devindex', 'grid-tree-big-data', 'shared-covid', 'grid-big-data', 'grid-issues',
          'calendar', 'helix', 'multi-window-covid-gallery', 'offscreen-canvas', 'shared-offscreen-canvas',
          'multi-window-drag-drop', 'tab-container', 'state-provider', 'dialog-drag-drop',
          'colors-dashboard', 'covid-dashboard', 'covid-helix', 'covid-gallery', 'gallery',
          'table-filtering', 'date-selector', 'date-field', 'combobox-field', 'portal', 'liquid-glass',
          'dock-choreography'
      ],
      newExampleIds = [
          'grid-animated-row-sorting', 'grid-cell-editing', 'grid-container', 'grid-content-sized-rows',
          'grid-covid', 'grid-header-groups', 'grid-locked-columns', 'grid-nested-record-fields',
          'grid-tree', 'grid-value-banding', 'json-grid-container', 'table-cell-editing',
          'table-container', 'table-covid', 'table-nested-record-fields', 'table-store', 'table-performance'
      ],
      formExampleIds = [
          'checkbox-field', 'chip-field', 'color-field', 'email-field', 'fileupload-field',
          'number-field', 'picker-field', 'radio-field', 'select-field', 'switch-field',
          'text-field', 'textarea-field', 'time-field', 'url-field', 'copy-to-clipboard-trigger',
          'fieldset', 'field-with-prefix', 'fields-runtime-triggers', 'layout-form',
          'date-selector-container', 'form-app'
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

    test('loads 67 logical examples with unique stable string identities', () => {
        const {store} = createList(),
              ids     = [];

        expect(catalog).toHaveLength(67);
        expect(store.getCount()).toBe(67);

        store.forEach(record => {
            expect(typeof record.id, record.name).toBe('string');
            expect(record.id, record.name).toMatch(/^[a-z][a-z0-9-]*$/);
            ids.push(record.id)
        });

        expect(new Set(ids).size).toBe(67);
        expect(list.catalogMode).toBe('dist_prod')
    });

    test('every published family record has both a feature and an observation, with rejecting controls', () => {
        function check(records) {
            records.filter(record => record.family).forEach(record => {
                expect(record.feature?.trim(), record.id + ' feature').toBeTruthy();
                expect(record.lookFor?.trim(), record.id + ' lookFor').toBeTruthy()
            })
        }

        check(catalog);
        const example = catalog.find(record => record.family);
        expect(() => check([{...example, feature: ''}])).toThrow();
        expect(() => check([{...example, lookFor: ''}])).toThrow()
    });

    test('the overview selects the 21 Grid and Table identities from the same catalog', () => {
        const view  = createView(),
              store = view.getCard(1).store,
              ids   = [], counts = {Grid: 0, Table: 0};

        store.forEach(record => {
            ids.push(record.id);
            expect(record.family).toBe('grid-table');
            counts[record.component]++;
            expect(record.feature, record.id).toBeTruthy();
            expect(record.lookFor, record.id).toBeTruthy()
        });

        expect(ids).toEqual(['grid-tree-big-data', 'grid-big-data', 'grid-issues', 'table-filtering', ...newExampleIds]);
        expect(counts).toEqual({Grid: 14, Table: 7});
        expect(store.getSource()).toBe(view.getCatalogStore())
    });

    test('preserves the complete established card order and inserts only new examples before choreography', () => {
        const {store} = createList(),
              // The production catalog established this sequence before canonicalization. ESM alone
              // placed OffscreenCanvas before Covid Gallery; the shared sequence follows production.
              establishedIds = featuredExampleIds.slice(0, -1),
              completeIds = [...establishedIds, ...newExampleIds, ...formExampleIds, 'dock-choreography', 'realworld', 'realworld-v2'],
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

        cases.forEach(([mode, workstationUrl, choreographyUrl]) => {
            list.catalogMode = mode;
            expect(list.environment).toBe(mode === 'devmode' ? 'development' : mode === 'dist_dev' ? 'dist/development' : 'dist/production');

            const visible = store.items.filter(record => !list.isHiddenItem(record));

            expect(visible.map(record => record.id), mode).toEqual(completeIds.filter(id => !excluded[mode].includes(id)));
            expect(list.createLink(visible[0]).href).toBe(list.baseUrl + workstationUrl);
            expect(list.createLink(visible.at(-1)).href).toBe(list.baseUrl + choreographyUrl)
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
        expect(issues[0].image).toBe('devmode/grid-issues-13-3.jpg');
        expect(fs.existsSync(path.join(repoRoot, 'apps/portal/resources/images/examples', issues[0].image))).toBe(true);

        modes.forEach(mode => {
            list.catalogMode = mode;
            expect(list.isHiddenItem(issues[0]), mode).toBe(false);
            expect(list.createLink(issues[0]).href, mode).toBe(list.baseUrl + issues[0].urls[mode])
        })
    });

    test('renders catalog captions and honest scope beside the real example links', () => {
        const {store} = createList();

        store.items.filter(record => record.family === 'grid-table').forEach(record => {
            const content     = list.createItemContent(record, 0)[0],
                  details     = content.cn.find(node => node.cls?.includes('neo-item-bottom-position')),
                  feature     = details.cn.find(node => node.cls?.includes('portal-example-feature')),
                  lookFor     = details.cn.find(node => node.cls?.includes('portal-example-look-for')),
                  placeholder = content.cn.find(node => node.cls?.includes('portal-example-placeholder'));

            expect(feature.text, record.id).toBe(record.feature);
            expect(feature.removeDom, record.id).toBe(false);
            expect(lookFor.text, record.id).toBe(record.lookFor);
            expect(lookFor.removeDom, record.id).toBe(false);
            expect(details.cn[0].href, record.id).toBe(list.createLink(record).href);
            expect(placeholder.removeDom, record.id).toBe(!!record.image);
            expect(placeholder.cn[1].text, record.id).toBe(record.component)
        });

        ['grid-covid', 'table-covid', 'json-grid-container'].forEach(id => {
            const record  = store.get(id),
                  content = list.createItemContent(record, 0)[0],
                  scope   = content.cn.find(node => node.cls?.includes('neo-item-bottom-position')).cn
                      .find(node => node.cls?.includes('portal-example-scope'));

            expect(record.scope, id).toBeTruthy();
            expect(scope.text, id).toBe(record.scope);
            expect(scope.removeDom, id).toBe(false)
        });

        expect(store.get('json-grid-container').scope).toContain('static JSON');
        expect(store.get('grid-covid').scope).toContain('external API');
        expect(list.getBackgroundImageStyle(store.get('grid-tree')).backgroundImage).not.toContain('url(')
    })
});
