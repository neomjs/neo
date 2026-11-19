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
 * @summary The card the stage shows: the overview, or a group page.
 * @param {Portal.view.examples.MainContainer} view
 * @returns {String} 'overview', or the open page's group
 */
const openCard = view => {
    const stage = view.getStage();

    return stage.items[stage.layout.activeIndex].family || 'overview'
};

/**
 * @summary The ids a group page lists.
 * @param {Portal.view.examples.MainContainer} view
 * @param {String} family
 * @returns {String[]}
 */
const pageIds = (view, family) => view.getGroupPage(family).getList().store.items.map(record => record.id);

/**
 * @summary The ids of the tiles a group page shows, in their order on the page (by name).
 * @param {Portal.view.examples.MainContainer} view
 * @param {String} family
 * @returns {String[]}
 */
const tileIds = (view, family) => view.getGroupPage(family).getTileList().store.items.map(record => record.id);

/**
 * @summary The catalog with every More components record hidden in Dev mode, so that a build switch withdraws a
 * whole page: the real catalog has no group a build switch empties since its tiles publish in every build.
 * @returns {Object[]}
 */
const devmodeEmptiesComponents = () => structuredClone(catalog).map(record =>
    record.family === 'components' ? {...record, hiddenIn: ['devmode']} : record
);

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

        // Timeline was retired and its example moved to Grid & Table + Scheduler; Trees publishes via alsoIn; every other group has a card or a tile
        expect(groupStore.items.map(group => group.route)).toEqual(publishedRoutes);
        expect(view.getGroupPages().map(page => page.family)).toEqual(groupStore.items.map(group => group.family));
        expect(view.getCatalogStore().getCount()).toBe(recordCount);

        // every example counts once, in its home group: the counts add up to the records that publish, tiles included
        expect(groupStore.items.reduce((sum, group) => sum + group.count, 0)).toBe(published.length);
        expect(published).toHaveLength(publishedCount);
        expect(Object.fromEntries(groupStore.items.map(group => [group.family, [group.count, group.crossCount]]))).toEqual(groupCounts);

        expect(groupStore.get('apps').band).toBeNull();
        expect(groupStore.get('forms').tileHeading).toBe('Field types');

        expect(pageIds(view, 'grid-table')).toEqual(coveredGridTableIds);
        expect(pageIds(view, 'tree')).toEqual(['grid-tree-big-data', 'grid-tree']);
        // Forms & Fields shows the form app as its card, then tiles: its own and the form layout lent by Containers &
        // Layouts, in the order of their names
        expect(pageIds(view, 'forms')).toEqual(['form-app']);
        expect(tileIds(view, 'forms')).toEqual(formTileIds);
        expect(pageIds(view, 'multi-window')).toEqual(multiWindowPageIds);
        expect(pageIds(view, 'calendar')).toEqual(['calendar']);
        expect(pageIds(view, 'scheduler')).toEqual(['scheduler-basic', 'scheduler-big-data']);
        expect(pageIds(view, 'gantt')).toEqual(['gantt-basic', 'gantt-big-data']);
        expect(pageIds(view, 'board')).toEqual(['board-basic', 'board-swimlanes']);
        // a group lists its home records and the records whose alsoIn names it, in catalog order
        expect(pageIds(view, 'functional')).toEqual(['email']);
        expect(tileIds(view, 'functional')).toEqual(['functional-define-component', 'functional-host-component', 'functional-nested-template']);
        expect(tileIds(view, 'buttons')).toEqual(['button-base', 'menu-list']);
        expect(pageIds(view, 'drag-drop')).toEqual(['multi-window-drag-drop', 'dialog-drag-drop', 'dock-tear-out']);
        expect(pageIds(view, 'apps')).toEqual([
            'workstation', 'devindex', 'shared-covid', 'webdesktop', 'multi-window-drag-drop', 'colors-dashboard',
            'covid-dashboard', 'portal', 'form-app', 'finance', 'email'
        ]);

        // every card and tile of every page has its image; the catalog keeps the records that wait for one
        view.getGroupPages().forEach(page => page.getLists().forEach(list => list.store.forEach(record => expect(record.image, record.id).toBeTruthy())));
        expect(view.getCatalogStore().items.filter(record => !record.image)).toHaveLength(uncoveredCount);
        expect(view.getCatalogStore().items.filter(record => record.image && !Example.publishes(record, 'dist_prod')).map(record => record.id))
            .toEqual([]);
        expect(view.getGroupPage('grid-table').getList().store.getSource()).toBe(view.getCatalogStore());
        expect(view.getGroupPage('grid-table').getList().store.model).toBe(view.getCatalogStore().model)
    });

    test('a component record is a tile: it counts as a live example, and its page\'s tileCount follows the build', () => {
        // the clock's tile cannot open in the ESM build, liquid-glass's card cannot open in Dev mode, and here
        // neither can the markdown card, so Dev mode shows tiles alone
        const hiddenIn = {clock: ['dist_esm'], markdown: ['devmode']},
              records  = structuredClone(catalog).map(record => hiddenIn[record.id] ? {...record, hiddenIn: hiddenIn[record.id]} : record),
              view     = createView(records),
              group    = () => view.getGroupStore().get('components'),
              page     = view.getGroupPage('components'),
              heading  = reference => page.down({reference}),
              // two cards, markdown and liquid-glass, and the rest tiles
              count    = groupCounts.components[0];

        expect(view.getCatalogStore().get('liquid-glass').kind).toBe('demonstration');
        expect(view.getCatalogStore().get('clock').kind).toBe('component');
        expect([group().count, group().tileCount]).toEqual([count, count - 2]);

        // the card shows under "Demonstrations", the tiles by name under the default tile heading
        expect(pageIds(view, 'components')).toEqual(['markdown', 'liquid-glass']);
        expect(tileIds(view, 'components')).toEqual(['chip', 'circle', 'clock', 'magic-move-text', 'monaco-editor', 'process', 'progress', 'splitter', 'status-badge', 'timer']);
        expect([heading('cards-heading').hidden, heading('tiles-heading').hidden, heading('tiles-heading').text]).toEqual([false, false, 'Components']);

        // the same rule publishes a tile and a card: a build that cannot open the tile drops it from both counts
        view.getController().onSelectBuild({id: 'dist_esm'});
        expect([group().count, group().tileCount]).toEqual([count - 1, count - 3]);
        expect(tileIds(view, 'components')).not.toContain('clock');

        // a page that shows one kind heads neither
        view.getController().onSelectBuild({id: 'devmode'});
        expect([group().count, group().tileCount]).toEqual([count - 2, count - 2]);
        expect(pageIds(view, 'components')).toEqual([]);
        expect([heading('cards-heading').hidden, heading('tiles-heading').hidden]).toEqual([true, true])
    });

    test('the overview counts the published examples into its headline and renders the featured Start here list', () => {
        const view     = createView(),
              overview = view.getOverview(),
              intro    = overview.down({reference: 'overview-intro'}),
              list     = overview.getList();

        expect(intro.vdom.cn[1].text).toBe(`${publishedCount} live examples in ${groupCount} groups`);
        expect(overview.down({reference: 'overview-index-heading'}).vdom.cn[0].text).toBe(`All ${groupCount} groups`);
        expect(list.leadCard).toBe(true);
        expect(list.showGroup).toBe(true);
        expect(list.store.items.map(record => record.id)).toEqual(startHereIds);

        // the action opens its record in the selected build
        expect(overview.down({reference: 'overview-action-grid-big-data'}).url).toBe('https://neomjs.com/dist/production/examples/grid/bigData/index.html');
        view.getController().onSelectBuild({id: 'dist_esm'});
        expect(overview.down({reference: 'overview-action-grid-big-data'}).url).toBe('https://neomjs.com/dist/esm/examples/grid/bigData/index.html')
    });

    test('the hoisted group index links unbanded Apps plus every band with its count, and marks the open destination', async () => {
        const view  = createView(),
              index = view.getGroupIndex(),
              mobIx = view.getOverview().down({reference: 'overview-group-index'}),
              sheet = view.getSheet(),
              links = component => component.vdom.cn.flatMap(node =>
                  (node.tag === 'section' ? node.cn[1].cn : node.tag === 'ul' ? node.cn : []).map(item => item.cn[0])
              );

        expect(mobIx.presentation).toBe('overview');
        expect(mobIx.vdom.cn.filter(node => node.tag === 'section').map(band => band.cn[0].text))
            .toEqual(['Data views', 'Planning', 'Layout', 'Components', 'Platform']);
        expect(links(mobIx).map(link => link.href)).toEqual(publishedRoutes.map(route => '#' + route));
        // a group shows its home examples; one that only borrows shows no number, and its label still names what it borrows
        expect(links(mobIx).map(link => link.cn[2].text))
            .toEqual(Object.values(groupCounts).map(([count]) => count ? String(count) : ''));
        expect(links(mobIx).filter(link => !link.cn[2].text).map(link => link.href))
            .toEqual(publishedRoutes.filter((route, index) => Object.values(groupCounts)[index][0] === 0).map(route => '#' + route));
        expect(links(mobIx).filter(link => !link.cn[2].text).every(link => link['aria-label'].endsWith('from other groups'))).toBe(true);
        expect(links(mobIx).every(link => link['aria-current'] === null)).toBe(true);
        expect(mobIx.vdom.cn[0].removeDom).toBe(true);
        // the all-examples link, the unbanded list and one section per band: no note under them
        expect(mobIx.vdom.cn.map(node => node.tag)).toEqual(['a', 'ul', 'section', 'section', 'section', 'section', 'section']);

        expect(index.presentation).toBe('list');
        expect(index.vdom.cn[0].removeDom).toBe(false);
        expect(index.vdom.cn[0]['aria-current']).toBe('page');

        await view.getController().onExamplesRoute({itemId: 'drag-drop'});
        expect(index.vdom.cn[0]['aria-current']).toBeNull();
        expect(links(index).filter(link => link['aria-current'] === 'page').map(link => link.href)).toEqual(['#/examples/drag-drop']);
        expect(sheet.presentation).toBe('sheet');
        expect(sheet.vdom.cn[0].removeDom).toBe(false);
        expect(links(sheet).filter(link => link['aria-current'] === 'page').map(link => link.href)).toEqual(['#/examples/drag-drop']);
        expect(ExampleGroup.countLabel({count: 0, crossCount: 2})).toBe('2 live examples from other groups');
        expect(ExampleGroup.countLabel({count: 1, crossCount: 0})).toBe('1 live example');
        expect(ExampleGroup.countLabel({count: 4, crossCount: 4})).toBe('4 live examples, 4 from other groups')
    });

    test('the hoisted crumb button opens and closes the sheet and syncs with routes', async () => {
        const view   = createView(),
              button = view.getGroupButton(),
              crumb  = view.getCrumb(),
              home   = view.down({reference: 'crumb-home'}),
              sheet  = view.getSheet();

        expect(crumb.hidden).toBe(false);
        expect(home.hidden).toBe(true);
        expect(button.text).toBe(`All ${groupCount} groups`);

        await view.getController().onExamplesRoute({itemId: 'grid'});
        expect(crumb.hidden).toBe(false);
        expect(home.hidden).toBe(false);
        expect(button.text).toBe('Grid & Table');
        expect(sheet.hidden).toBe(true);
        expect(button.getVdomRoot()['aria-expanded']).toBe(false);
        expect(button.getVdomRoot()['aria-controls']).toBe(sheet.id);

        view.sheetOpen = true;
        expect(sheet.hidden).toBe(false);
        expect(button.getVdomRoot()['aria-expanded']).toBe(true);

        view.onSheetKeyDown({key: 'Escape'});
        expect(view.sheetOpen).toBe(false);
        expect(sheet.hidden).toBe(true);

        view.sheetOpen = true;
        view.onSheetClick({path: [{tagName: 'span'}, {tagName: 'a'}]});
        expect(view.sheetOpen).toBe(false)
    });

    test('the desktop control is the upright index beside the stage, with the open group marked', async () => {
        const view  = createView(),
              index = view.getGroupIndex();

        await view.getController().onExamplesRoute({itemId: 'grid'});
        expect(index.presentation).toBe('list');
        expect(index.hidden).toBe(false);
        expect(index.vdom.cn.find(node => node.tag === 'section').cn[1].cn[0].cn[0]['aria-current']).toBe('page');
        expect(view.getGroupButton().badgeText).toBeFalsy()
    });

    test('resolves group routes and all legacy modes', async () => {
        // without its form layout tile, Containers & Layouts is a defined group with no card or tile
        const view       = createView(catalog.filter(record => record.family !== 'layouts')),
              controller = view.getController();

        await controller.onExamplesRoute();
        expect(openCard(view)).toBe('overview');

        for (const mode of view.buildModes) {
            await controller.onExamplesRoute({itemId: mode.id});
            expect(openCard(view)).toBe('overview');
            expect(view.catalogMode).toBe(mode.id);
            expect(view.getGroupPage('grid-table').getList().catalogMode).toBe(mode.id)
        }

        // The loop above ends in Dev mode. Every group path defined on dev before the groups became data still
        // resolves in production.
        await controller.onExamplesRoute({itemId: 'dist_prod'});

        for (const [itemId, family] of [['grid', 'grid-table'], ['forms', 'forms'], ['multi-window', 'multi-window'], ['calendar', 'calendar'], ['components', 'components'], ['state', 'state']]) {
            await controller.onExamplesRoute({itemId});
            expect(openCard(view), itemId).toBe(family)
        }

        // a defined group without a cover has no page yet, and an unknown one none at all: both show the overview
        await controller.onExamplesRoute({itemId: 'layouts'});
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
        // without its form layout tile, Containers & Layouts publishes through the test record alone
        const view = createView([...catalog.filter(record => record.family !== 'layouts'), {
                  ...catalog[0], id: 'test-layouts-example', family: 'layouts', alsoIn: [], featured: false,
                  feature: 'A layout container', lookFor: 'Inspect it.'
              }]);

        expect(view.getGroupStore().items.map(group => group.route)).toEqual(publishedRoutes);
        expect(pageIds(view, 'layouts')).toEqual(['test-layouts-example']);
        expect(view.getGroupStore().get('layouts').iconCls).toBe(view.familyDefinitions.find(item => item.family === 'layouts').iconCls)
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
        // the build lists a group's records in catalog order; its page shows the cards, then the tiles by name
        published.forEach(family => {
            expect(family.records.map(record => record.id).sort(), family.route).toEqual([...pageIds(view, family.family), ...tileIds(view, family.family)].sort())
        })
    });

    for (const [name, images, published] of [
        ['a group whose records have no cover gets no entry and no page', [null], false],
        ['the first covered record publishes its group, and a record without a cover stays off its page', ['devmode/workstation-13-2.jpg', null], true]
    ]) {
        test(name, () => {
            const records = images.map((image, index) => ({
                      ...catalog[0], id: 'test-layouts-' + index, family: 'layouts', alsoIn: [], featured: false,
                      feature: 'A layout container', lookFor: 'Inspect it.', image
                  })),
                  // without its form layout tile, Containers & Layouts holds only the test records
                  view = createView([...catalog.filter(record => record.family !== 'layouts'), ...records]);

            records.forEach(record => {
                expect(view.getCatalogStore().get(record.id).family).toBe('layouts');
                expect(Example.publishes(view.getCatalogStore().get(record.id), 'dist_prod')).toBe(!!record.image)
            });

            expect(view.getGroupStore().items.map(group => group.route)).toEqual(
                published ? publishedRoutes : publishedRoutes.filter(route => route !== '/examples/layouts')
            );
            expect(!!view.getGroupPage('layouts')).toBe(published);
            published && expect(pageIds(view, 'layouts')).toEqual(['test-layouts-0'])
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
        expect(tileIds(view, 'forms')).toHaveLength(formTileIds.length);

        store.remove(store.items.filter(record => record.family === 'grid-table'));
        store.fire('load');
        // Grid & Table held the only covered tree records via alsoIn, so removing grid-table withdraws tree as well
        expect(view.getGroupStore().items.map(group => group.route)).toEqual(
            publishedRoutes.filter(route => route !== '/examples/grid' && route !== '/examples/tree')
        );
        expect(view.getGroupPage('grid-table')).toBeNull();
        expect(view.getGroupPage('tree')).toBeNull()
    });

    test('a record with alsoIn shows once in each of its groups and counts once, in its home group', () => {
        const view = createView();

        expect(pageIds(view, 'dialogs')).toEqual(['dialog-drag-drop', 'toast', 'popover']);
        expect(pageIds(view, 'drag-drop').filter(id => id === 'dialog-drag-drop')).toHaveLength(1);
        expect(pageIds(view, 'platform')).toEqual(['offscreen-canvas', 'shared-offscreen-canvas']);
        // the paging toolbar reaches Buttons through the grid that runs it on the simulated server
        expect(pageIds(view, 'buttons')).toEqual(['context-menu-files', 'breadcrumb', 'grid-server-side']);
        expect(pageIds(view, 'charts')).toEqual(['offscreen-canvas', 'open-street-maps', 'graph-scene', 'am-charts', 'sparklines', 'mermaid']);
        expect(pageIds(view, 'tree')).toEqual(['grid-tree-big-data', 'grid-tree']);
        expect(view.getGroupStore().get('dialogs').count).toBe(3);
        expect(view.getGroupStore().get('drag-drop').count).toBe(0);
        expect(view.getGroupStore().get('tree').count).toBe(0);
        expect(view.getCatalogStore().items.filter(record => record.id === 'dialog-drag-drop')).toHaveLength(1);
        expect(view.getCatalogStore().getCount()).toBe(recordCount)
    });

    for (const mode of ['dist_prod', 'dist_esm', 'dist_dev', 'devmode']) {
        test(`the ${mode} build publishes the groups with a card it can open`, () => {
            const view = createView(catalog, mode);

            // Dev mode hides liquid-glass, but More components keeps its tiles
            expect(view.getGroupStore().items.map(group => group.route)).toEqual(publishedRoutes)
        })
    }

    test('a build selection republishes the groups, and an open group that loses its cards shows the overview until it publishes again', async () => {
        const view       = createView(devmodeEmptiesComponents()),
              controller = view.getController();

        await controller.onExamplesRoute({itemId: 'components'});
        expect(openCard(view)).toBe('components');

        controller.onSelectBuild({id: 'devmode'});
        expect(view.getGroupStore().items.map(group => group.route)).not.toContain('/examples/components');
        expect(view.getGroupPage('components')).toBeNull();
        expect(openCard(view)).toBe('overview');
        // the overview's headline follows the build: Dev mode opens none of the More components records
        expect(view.down({reference: 'overview-intro'}).vdom.cn[1].text)
            .toBe(`${publishedCount - groupCounts.components[0]} live examples in ${groupCount - 1} groups`);

        // the route still names the group: its page returns with its cards
        controller.onSelectBuild({id: 'dist_prod'});
        expect(view.getGroupStore().items.map(group => group.route)).toEqual(publishedRoutes);
        expect(openCard(view)).toBe('components');
        expect(pageIds(view, 'components')).toEqual(['markdown', 'liquid-glass'])
    });

    test('an open page stays open when a build switch removes or adds another page', async () => {
        const view       = createView(devmodeEmptiesComponents()),
              controller = view.getController(),
              stage      = view.getStage();

        await controller.onExamplesRoute({itemId: 'multi-window'});
        expect(openCard(view)).toBe('multi-window');

        // Dev mode removes More components, a page created before Multi-Window
        controller.onSelectBuild({id: 'devmode'});
        expect(openCard(view)).toBe('multi-window');

        // Production adds it again, before the open page
        controller.onSelectBuild({id: 'dist_prod'});
        expect(openCard(view)).toBe('multi-window');
        expect(stage.layout.activeIndex).toBe(stage.indexOf(view.getGroupPage('multi-window')))
    });

    test('findQuery filters published records across titles, captions, group titles and keywords, updates GroupIndex matchCounts, and restores the open page on clear', async () => {
        const view          = createView(),
              controller    = view.getController(),
              stage         = view.getStage(),
              searchResults = view.getSearchResults(),
              matchedIds    = () => searchResults.getGroupsContainer().items.flatMap(group =>
                  group.items.filter(item => item instanceof ExamplesList).flatMap(list => list.store.items.map(r => r.id))
              );

        await controller.onExamplesRoute({itemId: 'multi-window'});
        expect(openCard(view)).toBe('multi-window');

        controller.onFindFieldChange({value: 'drag'});
        expect(stage.items[stage.layout.activeIndex]).toBe(searchResults);
        expect(view.getSidebarFindField().value).toBe('drag');
        expect(view.getMobileFindField().value).toBe('drag');

        const dragIds = matchedIds();
        expect(dragIds).toEqual(expect.arrayContaining([
            'board-basic', 'board-swimlanes', 'multi-window-drag-drop', 'dialog-drag-drop', 'dock-tear-out', 'workstation', 'webdesktop'
        ]));

        const counts = view.getStateProvider().getData('matchCounts');
        expect(counts).toBeInstanceOf(Map);
        expect(counts.get('board')).toEqual({home: 2, cross: 0, total: 2});
        expect(counts.get('drag-drop')).toEqual({home: 0, cross: 3, total: 3});
        expect(counts.get('calendar')).toEqual({home: 0, cross: 0, total: 0});

        const indexVdom = view.getGroupIndex().vdom,
              findEntry = (node, id) => node.id === id ? node : (node.cn || []).map(c => findEntry(c, id)).find(Boolean),
              dragEntry = findEntry(indexVdom, `${view.getGroupIndex().id}__drag-drop`),
              calEntry  = findEntry(indexVdom, `${view.getGroupIndex().id}__calendar`);

        expect(dragEntry['aria-label']).toBe('Drag & Drop, 3 matching examples from other groups');
        expect(calEntry['aria-label']).toBe('Calendar, 0 matching examples');

        controller.onFindFieldChange({value: 'date'});
        const dateIds = matchedIds();
        expect(dateIds).toEqual(expect.arrayContaining([
            'calendar', 'scheduler-basic', 'scheduler-big-data', 'gantt-basic', 'gantt-big-data', 'date-field', 'date-selector'
        ]));
        const formsGroup = searchResults.getGroupsContainer().items.find(group =>
            group.items[0].vdom.cn[0].href === '#/examples/forms'
        );
        expect(formsGroup.items[1].tiles).toBe(true);
        expect(formsGroup.items[1].store.items.map(r => r.id)).toEqual(['date-field', 'date-selector']);

        controller.onFindFieldChange({value: 'liquid'});
        expect(matchedIds()).toEqual(['liquid-glass']);
        controller.onSelectBuild({id: 'devmode'});
        expect(matchedIds()).toEqual([]);
        expect(searchResults.down({reference: 'search-empty'}).hidden).toBe(false);
        controller.onSelectBuild({id: 'dist_prod'});
        expect(matchedIds()).toEqual(['liquid-glass']);

        controller.onClearFind();
        expect(view.findQuery).toBe('');
        expect(view.getStateProvider().getData('matchCounts')).toBeNull();
        expect(searchResults.getGroupsContainer().items).toHaveLength(0);
        expect(openCard(view)).toBe('multi-window');
        expect(stage.layout.activeIndex).toBe(stage.indexOf(view.getGroupPage('multi-window')))
    });

    test('Example.tokenizeSearchText and matchesQuery normalize camelCase, comma numbers, alsoIn titles and keywords', () => {
        expect(Example.tokenizeSearchText('100,000 × 200 TreeGrid')).toEqual(['100000', '200', 'tree', 'grid']);

        const groupTitles = {'board': 'Task Board', 'drag-drop': 'Drag & Drop'},
              record      = {
                  name     : 'Sprint Board',
                  family   : 'board',
                  alsoIn   : ['drag-drop'],
                  component: 'Neo.board.Container',
                  feature  : 'Kanban cards',
                  lookFor  : 'Move a card',
                  keywords : ['swimlane']
              };

        expect(Example.matchesQuery(record, Example.tokenizeSearchText('drag'), groupTitles)).toBe(true);
        expect(Example.matchesQuery(record, Example.tokenizeSearchText('swim'), groupTitles)).toBe(true);
        expect(Example.matchesQuery(record, Example.tokenizeSearchText('board container'), groupTitles)).toBe(true);
        expect(Example.matchesQuery(record, Example.tokenizeSearchText('calendar'), groupTitles)).toBe(false)
    });

    test('MainContainer registers and releases body-level "/" preventDefault as the view activates and deactivates', () => {
        const events       = [],
              originalMain = Neo.main;

        Neo.main = {
            ...originalMain,
            DomEvents: {
                ...originalMain?.DomEvents,
                registerPreventDefaultKeys  : data => events.push({op: 'register',   id: data.id, keys: data.keys}),
                unregisterPreventDefaultKeys: data => events.push({op: 'unregister', id: data.id, keys: data.keys})
            }
        };

        try {
            const view = createView();

            view.mounted = true;
            expect(events).toEqual([{op: 'register', id: 'document.body', keys: ['/']}]);
            expect(view.isActiveView()).toBe(true);

            view.wrapperCls = [...(view.wrapperCls || []), 'neo-inactive-item'];
            expect(view.isActiveView()).toBe(false);
            expect(events).toHaveLength(2);
            expect(events[1]).toEqual({op: 'unregister', id: 'document.body', keys: ['/']});

            view.wrapperCls = [];
            expect(view.isActiveView()).toBe(true);
            expect(events).toHaveLength(3);
            expect(events[2]).toEqual({op: 'register', id: 'document.body', keys: ['/']});

            view.destroy();
            exampleView = null;
            expect(events).toHaveLength(4);
            expect(events[3]).toEqual({op: 'unregister', id: 'document.body', keys: ['/']})
        } finally {
            Neo.main = originalMain
        }
    });
});

const catalog = JSON.parse(fs.readFileSync(path.join(dataRoot, 'examples.json'), 'utf8')),
      modes   = ['devmode', 'dist_dev', 'dist_esm', 'dist_prod'],
      // the 12 Start here demonstrations placed first in featured catalog order
      startHereIds = [
          'workstation', 'grid-big-data', 'grid-tree-big-data', 'devindex', 'shared-covid',
          'grid-issues', 'scheduler-basic', 'gantt-basic', 'board-basic', 'calendar', 'webdesktop', 'dock-choreography'
      ],
      establishedTailIds = [
          'grid-countries', 'helix', 'multi-window-covid-gallery', 'offscreen-canvas', 'shared-offscreen-canvas',
          'multi-window-drag-drop', 'tab-container', 'tab-browser', 'state-provider', 'dialog-drag-drop',
          'colors-dashboard', 'covid-dashboard', 'covid-helix', 'covid-gallery', 'gallery', 'list-reorder', 'list-animate'
      ],
      componentExampleIds = [
          'carousel', 'chip', 'circle', 'clock', 'magic-move-text',
          'markdown', 'process', 'progress', 'splitter', 'status-badge', 'timer',
          'toast', 'popover', 'video', 'monaco-editor', 'open-street-maps', 'graph-scene', 'am-charts',
          'sparklines', 'mermaid', 'video-move', 'context-menu-files', 'breadcrumb'
      ],
      establishedMiddleIds = [
          'table-filtering', 'date-selector', 'date-field', 'combobox-field', 'portal', 'liquid-glass'
      ],
      newExampleIds = [
          'grid-animated-row-sorting', 'grid-cell-editing', 'grid-container', 'grid-content-sized-rows',
          'grid-filtering', 'grid-export', 'grid-server-side', 'grid-header-groups', 'grid-locked-columns',
          'grid-nested-record-fields', 'grid-streaming', 'grid-tree', 'grid-value-banding', 'table-container'
      ],
      formExampleIds = [
          'checkbox-field', 'chip-field', 'color-field', 'email-field', 'fileupload-field',
          'number-field', 'radio-field', 'select-field', 'switch-field',
          'text-field', 'textarea-field', 'time-field', 'url-field',
          'country-field', 'currency-field', 'display-field', 'iban-field', 'password-field',
          'phone-field', 'range-field', 'search-field', 'zipcode-field', 'copy-to-clipboard-trigger',
          'fieldset', 'form-validation', 'field-with-prefix', 'layout-form', 'form-app'
      ],
      // the tile records of groups that had no record before the tiles, appended to the catalog
      newTileIds = [
          'button-base', 'menu-list', 'list-base', 'chip-list', 'color-list', 'list-buffered', 'list-circle',
          'functional-define-component', 'functional-host-component', 'functional-nested-template', 'sitemap'
      ],
      // the Containers & Layouts cards, appended after the tiles
      layoutExampleIds = ['layouts-side-by-side', 'layout-cube'],
      // the Forms & Fields tiles in the order of their names, the form layout lent by Containers & Layouts among them
      formTileIds = [
          'checkbox-field', 'chip-field', 'color-field', 'combobox-field', 'copy-to-clipboard-trigger',
          'country-field', 'currency-field', 'date-field', 'date-selector', 'display-field', 'email-field',
          'fieldset', 'fileupload-field', 'layout-form', 'iban-field', 'number-field', 'password-field',
          'phone-field', 'radio-field', 'range-field', 'search-field', 'select-field', 'switch-field',
          'textarea-field', 'text-field', 'time-field', 'url-field', 'zipcode-field'
      ],
      multiWindowExampleIds = [
          'dock-layouts', 'dock-cross-window', 'dock-tear-out',
          'multi-window-helix', 'multi-window-state-provider'
      ],
      // the records of a group that name a cover: the cards its page shows
      coveredGridTableIds   = ['grid-big-data', 'grid-tree-big-data', 'grid-issues', 'grid-countries', 'table-filtering', ...newExampleIds],
      coveredMultiWindowIds = [
          'workstation', 'shared-covid', 'multi-window-covid-gallery', 'shared-offscreen-canvas',
          'multi-window-drag-drop', 'colors-dashboard'
      ],
      // the Multi-Window page also shows dock-cross-window, dock-tear-out and Email, whose alsoIn names it
      multiWindowPageIds    = [...coveredMultiWindowIds, 'dock-cross-window', 'dock-tear-out', 'email'],
      // every group: each has a card or tile a production build opens on this catalog, in definition order
      publishedRoutes = [
          '/examples/apps', '/examples/grid', '/examples/tree', '/examples/lists', '/examples/charts',
          '/examples/calendar', '/examples/scheduler', '/examples/gantt', '/examples/board',
          '/examples/dashboard', '/examples/tabs', '/examples/layouts', '/examples/dialogs',
          '/examples/forms', '/examples/buttons', '/examples/components',
          '/examples/multi-window', '/examples/platform', '/examples/state', '/examples/functional', '/examples/drag-drop'
      ],
      // The catalog's only count literals: a new covered example changes its group's row, a new record the record count.
      // [home count, count from other groups] per group in a production build, in definition order.
      // One group per line, so examples PRs on different groups never edit the same line.
      groupCounts = {
          apps          : [6, 5],
          'grid-table'  : [19, 0],
          tree          : [0, 2],
          lists         : [12, 0],
          charts        : [5, 1],
          calendar      : [1, 0],
          scheduler     : [2, 0],
          gantt         : [2, 0],
          board         : [2, 0],
          dashboard     : [4, 1],
          tabs          : [2, 0],
          layouts       : [3, 0],
          dialogs       : [3, 0],
          forms         : [28, 1],
          buttons       : [4, 1],
          components    : [12, 0],
          'multi-window': [6, 3],
          platform      : [2, 1],
          state         : [1, 0],
          functional    : [3, 1],
          'drag-drop'   : [0, 3]
      },
      recordCount    = 124,
      publishedCount = Object.values(groupCounts).reduce((sum, [count]) => sum + count, 0),
      groupCount     = Object.keys(groupCounts).length,
      // every record with a cover publishes in a production build, so the rest wait for one
      uncoveredCount = recordCount - publishedCount;

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

    test('loads every logical example with a unique, stable string identity', () => {
        const {store} = createList(),
              ids     = [];

        expect(catalog).toHaveLength(recordCount);
        expect(store.getCount()).toBe(recordCount);

        store.forEach(record => {
            expect(typeof record.id, record.name).toBe('string');
            expect(record.id, record.name).toMatch(/^[a-z][a-z0-9-]*$/);
            ids.push(record.id)
        });

        expect(new Set(ids).size).toBe(recordCount);
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
                  'am-charts'         : 'charts',
                  breadcrumb          : 'buttons',
                  carousel            : 'lists',
                  'context-menu-files': 'buttons',
                  'graph-scene'       : 'charts',
                  mermaid             : 'charts',
                  'open-street-maps'  : 'charts',
                  popover             : 'dialogs',
                  sparklines          : 'charts',
                  toast               : 'dialogs',
                  'video-move'        : 'platform'
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
                  apps        : ['webdesktop', 'devindex', 'covid-dashboard', 'portal'],
                  components  : ['liquid-glass'],
                  dashboard   : ['dock-choreography', 'dock-layouts', 'dock-cross-window', 'dock-tear-out'],
                  dialogs     : ['dialog-drag-drop'],
                  gantt       : ['gantt-basic'],
                  'grid-table': ['timeline-basic'],
                  layouts     : ['layout-form'],
                  lists       : ['helix', 'covid-helix', 'covid-gallery', 'gallery'],
                  platform    : ['offscreen-canvas'],
                  scheduler   : ['scheduler-basic'],
                  state       : ['state-provider'],
                  tabs        : ['tab-container']
              };

        expect(groups).toHaveLength(21);
        expect(new Set(ExamplesMainContainer.config.familyDefinitions.map(definition => definition.band).filter(Boolean)).size).toBe(5);
        expect(ExamplesMainContainer.config.familyDefinitions.find(definition => definition.family === 'apps').band).toBeNull();
        expect(ExamplesMainContainer.config.familyDefinitions.find(definition => definition.family === 'forms').tileHeading).toBe('Field types');

        catalog.forEach(record => {
            expect(groups, record.id).toContain(record.family);
            (record.alsoIn || []).forEach(group => {
                expect(groups, record.id).toContain(group);
                expect(group, record.id).not.toBe(record.family)
            })
        });

        // the 21 records placed across target groups, and every cross-group alsoIn list
        Object.entries(moved).forEach(([group, ids]) => ids.forEach(id => expect(catalog.find(record => record.id === id).family, id).toBe(group)));
        expect(Object.values(moved).flat()).toHaveLength(21);
        expect(Object.fromEntries(catalog.filter(record => record.alsoIn?.length).map(record => [record.id, record.alsoIn]))).toEqual({
            'workstation'            : ['apps'],
            'grid-tree-big-data'     : ['tree'],
            'shared-covid'           : ['apps'],
            'offscreen-canvas'       : ['charts'],
            'shared-offscreen-canvas': ['platform'],
            'multi-window-drag-drop' : ['apps', 'drag-drop'],
            'dialog-drag-drop'       : ['drag-drop'],
            'colors-dashboard'       : ['apps', 'dashboard'],
            'grid-tree'              : ['tree'],
            'grid-server-side'       : ['buttons'],
            'form-app'               : ['apps'],
            'layout-form'            : ['forms'],
            'timeline-basic'         : ['scheduler'],
            'dock-cross-window'      : ['multi-window'],
            'dock-tear-out'          : ['multi-window', 'drag-drop'],
            'email'                  : ['multi-window', 'functional']
        })
    });

    test('places the 12 featured Start here demonstrations first in #21140 catalog order', () => {
        expect(catalog.slice(0, 12).map(record => record.id)).toEqual(startHereIds);
        expect(catalog.filter(record => record.featured).map(record => record.id)).toEqual(startHereIds);
        expect(catalog.find(record => record.id === 'helix').name).toBe('3D Helix')
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

    test('the catalog holds the Grid and Table identities and their page shows the covered ones', () => {
        const view         = createView(),
              catalogStore = view.getCatalogStore(),
              store        = view.getGroupPage('grid-table').getList().store,
              ids          = [], counts = {Grid: 0, Table: 0, Timeline: 0};

        catalogStore.forEach(record => {
            if (record.family === 'grid-table') {
                ids.push(record.id);
                counts[record.component]++;
                expect(record.feature, record.id).toBeTruthy();
                expect(record.lookFor, record.id).toBeTruthy()
            }
        });

        expect(ids).toEqual([...coveredGridTableIds, 'timeline-basic']);
        expect(counts).toEqual({Grid: 17, Table: 2, Timeline: 1});
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
            .map(record => record.id)).toEqual(['dock-cross-window', 'dock-tear-out', 'email']);

        for (const mode of modes) {

            list.catalogMode = mode;
            expect(store.items.filter(record => !list.isHiddenItem(record)).map(record => record.id)).toEqual(
                store.items.map(record => record.id).filter(id => mode !== 'dist_esm' || id !== 'shared-offscreen-canvas')
            )
        }

        expect(catalogStore.get('dock-layouts').sharedWorkers).toBe(false);
        expect(catalogStore.get('dock-tear-out').sharedWorkers).toBe(true)
    });

    test('preserves the #21140 catalog order and inserts the Multi-Window block after timeline-basic', () => {
        const {store}     = createList(),
              completeIds = [
                  ...startHereIds, ...establishedTailIds, ...componentExampleIds, ...establishedMiddleIds,
                  ...newExampleIds, ...formExampleIds, 'board-swimlanes', 'scheduler-big-data', 'gantt-big-data', 'timeline-basic',
                  ...multiWindowExampleIds, 'finance', 'email', ...newTileIds, ...layoutExampleIds
              ],
              excluded = {
                  devmode  : ['portal', 'liquid-glass'],
                  dist_dev : [],
                  dist_esm : ['shared-offscreen-canvas'],
                  dist_prod: []
              },
              cases   = [
                  ['devmode', 'examples/grid/bigData/index.html', 'apps/workstation/index.html', 'examples/dashboard/choreography/index.html'],
                  ['dist_dev', 'dist/development/examples/grid/bigData/index.html', 'dist/development/apps/workstation/index.html', 'dist/development/examples/dashboard/choreography/index.html'],
                  ['dist_esm', 'dist/esm/examples/grid/bigData/index.html', 'dist/esm/apps/workstation/index.html', 'dist/esm/examples/dashboard/choreography/index.html'],
                  ['dist_prod', 'dist/production/examples/grid/bigData/index.html', 'dist/production/apps/workstation/index.html', 'dist/production/examples/dashboard/choreography/index.html']
              ];

        expect(store.items.map(record => record.id)).toEqual(completeIds);

        // the list hides what its store would filter out: a record without a cover publishes no card in any mode
        const uncovered = completeIds.filter(id => !store.get(id).image);

        expect(uncovered).toHaveLength(uncoveredCount);

        cases.forEach(([mode, bigDataUrl, workstationUrl, choreographyUrl]) => {
            list.catalogMode = mode;
            expect(list.environment).toBe(mode === 'devmode' ? 'development' : mode === 'dist_dev' ? 'dist/development' : 'dist/production');

            const visible = store.items.filter(record => !list.isHiddenItem(record));

            expect(visible.map(record => record.id), mode).toEqual(completeIds.filter(id => !excluded[mode].includes(id) && !uncovered.includes(id)));
            expect(visible[0].id).toBe('workstation');
            expect(list.createLink(visible[0]).href).toBe(list.baseUrl + workstationUrl);
            expect(list.createLink(store.get('grid-big-data')).href).toBe(list.baseUrl + bigDataUrl);
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
            expect(list.isHiddenItem(liquidGlass), mode).toBe(mode === 'devmode')
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

            // always on the cover: optional group kicker, title row (link + resting cue), proof line, then expandable part
            expect(details.cn.map(node => node.cls?.[0] ?? node.tag), record.id).toEqual([
                'portal-example-group-badge', 'portal-example-title-row', 'portal-example-feature', 'portal-example-more'
            ]);
            expect(details.cn[0].removeDom, record.id).toBe(true);
            expect(feature.text, record.id).toBe(record.feature);
            expect(feature.removeDom, record.id).toBe(false);
            expect(lookFor.text, record.id).toBe(record.lookFor);
            expect(lookFor.removeDom, record.id).toBe(false);
            const link = list.createLink(record),
                  cue  = details.cn[1].cn[1];

            expect(details.cn[1].cn[0].href, record.id).toBe(link.href);
            expect(cue, record.id).toMatchObject({
                tag          : 'a',
                cls          : ['portal-example-open-cue'],
                href         : link.href,
                'aria-hidden': true,
                tabIndex     : -1,
                text         : 'Open live ↗'
            });
            expect(cue.target, record.id).toBe(link.target);
            expect(byCls(more, 'neo-github-image').href, record.id).toBe(list.createSourceLink(record).href);
            expect(byCls(content, 'portal-example-placeholder'), record.id).toBeUndefined()
        });

        const workstation = list.createItemContent(store.get('workstation'), 0)[0],
              mwBadge     = byCls(workstation, 'neo-multi-window');

        expect(mwBadge.removeDom).toBe(false);
        expect(mwBadge['aria-label']).toBe('Multi-window live example');
        expect(byCls(mwBadge, 'neo-multi-window-label').text).toBe('Multi-window');

        list.set({groupTitles: {'multi-window': 'Multi-Window'}, showGroup: true});
        const badged    = list.createItemContent(store.get('workstation'), 0)[0],
              groupPill = byCls(badged, 'portal-example-group-badge');

        expect(groupPill.removeDom).toBe(false);
        expect(groupPill.text).toBe('Multi-Window');
        list.set({groupTitles: null, showGroup: false});

        ['grid-countries', 'grid-issues'].forEach(id => {
            const record  = store.get(id),
                  content = list.createItemContent(record, 0)[0],
                  scope   = byCls(content, 'portal-example-scope');

            expect(record.scope, id).toBeTruthy();
            expect(scope.text, id).toBe(record.scope);
            expect(scope.removeDom, id).toBe(false)
        });

        const originalConfigEnv = Neo.config.environment;

        ['devmode', 'dist_dev', 'dist_esm', 'dist_prod'].forEach(catalogMode => {
            ['development', 'dist/production'].forEach(configEnv => {
                Neo.config.environment = configEnv;
                list.set({catalogMode});

                ['workstation', 'grid-tree-big-data'].forEach(id => {
                    const record = store.get(id),
                          link   = list.createLink(record),
                          cue    = list.createOpenCue(record);

                    expect(cue.href, `${catalogMode}:${configEnv}:${id}`).toBe(link.href);
                    expect(cue.target, `${catalogMode}:${configEnv}:${id}`).toBe(link.target);
                    expect(Boolean(cue.target), `${catalogMode}:${configEnv}:${id}`).toBe(!record.sharedWorkers || list.environment !== Neo.config.environment)
                })
            })
        });

        Neo.config.environment = originalConfigEnv;
        list.set({catalogMode: 'dist_prod'});

        expect(store.get('grid-issues').scope).toContain('issue snapshot');
        expect(store.get('grid-countries').scope).toContain('CC BY 4.0');
        expect(list.getBackgroundImageStyle(store.get('grid-tree')).backgroundImage).toContain('grid-tree-14.jpg');
        const uncovered = store.items.find(record => !record.image);
        expect(uncovered).toBeDefined();
        expect(list.getBackgroundImageStyle(uncovered).backgroundImage).not.toContain('url(')
    })
});
