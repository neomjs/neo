import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalExamplesMainControllerTest'
    }
});

import {test, expect}                                   from '@playwright/test';
import fs                                               from 'node:fs';
import os                                               from 'node:os';
import path                                             from 'node:path';
import {fileURLToPath}                                  from 'node:url';
import {getPublishedExampleFamilies}                    from '../../../../../../../buildScripts/docs/seo/seoJson.mjs';
import {EXAMPLES_DIR, orderCatalog, readExampleCatalog} from '../../../../../../../buildScripts/util/exampleCatalog.mjs';
import Neo                                              from '../../../../../../../src/Neo.mjs';
import * as core                                        from '../../../../../../../src/core/_export.mjs';
import Sorter                                           from '../../../../../../../src/collection/Sorter.mjs';
import Example                                          from '../../../../../../../apps/portal/model/Example.mjs';
import ExampleCatalog                                   from '../../../../../../../apps/portal/connection/ExampleCatalog.mjs';
import ExampleGroup                                     from '../../../../../../../apps/portal/model/ExampleGroup.mjs';
import ExamplesList                                     from '../../../../../../../apps/portal/view/examples/List.mjs';
import ExamplesStore                                    from '../../../../../../../apps/portal/store/Examples.mjs';
import ExamplesMainContainer                            from '../../../../../../../apps/portal/view/examples/MainContainer.mjs';

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
 * @summary What a group's page shows in a build, worked out from the raw records by the view's rule: the records whose
 * home `family` or `alsoIn` names the group and that publish there, the cards in catalog order and the tiles by name.
 * The tests hold the view to it instead of to lists of ids, so an examples PR edits no line of this spec.
 * @param {String} family
 * @param {String} [mode='dist_prod']
 * @param {Object[]} [records=catalog]
 * @returns {{cards: String[], tiles: String[]}}
 */
function expectedPage(family, mode='dist_prod', records=catalog) {
    return splitKinds(records.filter(record => Example.belongsTo(record, family) && Example.publishes(record, mode)))
}

/**
 * @summary Splits records the way a page lists them: the cards in the order given, the tiles (`kind: 'component'`) by
 * name, as the tile list's sorter orders them.
 * @param {Object[]} records
 * @returns {{cards: String[], tiles: String[]}}
 */
function splitKinds(records) {
    const isTile = record => record.kind === 'component';

    return {
        cards: records.filter(record => !isTile(record)).map(record => record.id),
        tiles: records.filter(isTile).sort((a, b) => Sorter.compareValues(a.name.toLowerCase(), b.name.toLowerCase(), 1)).map(record => record.id)
    }
}

/**
 * @summary The published records a find query matches, by the view's rule.
 * @param {String} query
 * @param {String} [mode='dist_prod']
 * @returns {Object[]}
 */
function expectedMatches(query, mode='dist_prod') {
    const terms       = Example.tokenizeSearchText(query),
          groupTitles = Object.fromEntries(ExamplesMainContainer.config.familyDefinitions.map(definition => [definition.family, definition.title]));

    return catalog.filter(record => Example.publishes(record, mode) && Example.matchesQuery(record, terms, groupTitles))
}

/**
 * @summary The find counts of a query: per published group, its matching records at home and those lent to it.
 * @param {String} query
 * @returns {Map<String, {home: Number, cross: Number, total: Number}>}
 */
function expectedMatchCounts(query) {
    const matched = expectedMatches(query);

    return new Map(Object.keys(groupCounts).map(family => {
        const home  = matched.filter(record => record.family === family).length,
              cross = matched.filter(record => record.alsoIn?.includes(family)).length;

        return [family, {home, cross, total: home + cross}]
    }))
}

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
    for (const value of ['date', '']) {
        test(`a delayed shared catalog keeps a newer ${value ? 'Find edit' : 'Clear'}`, async () => {
            const view       = createView(),
                  controller = view.getController(),
                  store      = view.getCatalogStore(),
                  load       = Promise.withResolvers();

            store.isLoaded = false;
            store.load     = () => load.promise;

            const route = controller.onExamplesRoute({itemId: 'grid'}, {search: 'find=drag&catalogMode=dist_esm'});

            expect(view.findQuery).toBe('drag');
            expect(view.catalogMode).toBe('dist_esm');

            value ? controller.onFindFieldChange({value}) : controller.clearFind();
            store.isLoaded = true;
            load.resolve();
            await route;

            expect(view.findQuery).toBe(value);
            expect(controller.getOpenRoute()).toBe('/examples/grid')
        })
    }

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
                  items = list.getVdomRoot().cn,
                  count = expectedPage('grid-table', mode).cards.length;

            expect(list.store.getCount()).toBe(count);
            expect(items).toHaveLength(count);
            expect(new Set(items.map(item => item.id)).size).toBe(count)
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

        // a group lists its home records and the records whose alsoIn names it: the cards in catalog order, the tiles by name
        groupStore.items.forEach(({family}) => {
            const {cards, tiles} = expectedPage(family);

            expect(pageIds(view, family), family).toEqual(cards);
            expect(tileIds(view, family), family).toEqual(tiles)
        });
        // the curated places: Apps leads with the workstation Multi-Window lends it, Forms & Fields with the form app, and
        // the form layout lent by Containers & Layouts sits among the field tiles
        expect(pageIds(view, 'apps')[0]).toBe('workstation');
        expect(pageIds(view, 'forms')[0]).toBe('form-app');
        expect(tileIds(view, 'forms')).toContain('layout-form');

        // every card and tile of every page has its image; the catalog keeps the records that wait for one
        view.getGroupPages().forEach(page => page.getLists().forEach(list => list.store.forEach(record => expect(record.image, record.id).toBeTruthy())));
        expect(view.getCatalogStore().items.filter(record => !record.image)).toHaveLength(uncoveredCount);
        expect(view.getCatalogStore().items.filter(record => record.image && !Example.publishes(record, 'dist_prod')).map(record => record.id))
            .toEqual([]);
        expect(view.getGroupPage('grid-table').getList().store.getSource()).toBe(view.getCatalogStore());
        expect(view.getGroupPage('grid-table').getList().store.model).toBe(view.getCatalogStore().model)
    });

    test('a component record is a tile: it counts as a live example, and its page\'s tileCount follows the build', () => {
        // the clock's tile cannot open in the ESM build, and here no card of the group can open in Dev mode, so Dev mode
        // shows tiles alone
        const records = structuredClone(catalog).map(record =>
                  record.id === 'clock' ? {...record, hiddenIn: ['dist_esm']} :
                  record.family === 'components' && record.kind !== 'component' ? {...record, hiddenIn: ['devmode']} : record
              ),
              view    = createView(records),
              group   = () => view.getGroupStore().get('components'),
              page    = view.getGroupPage('components'),
              heading = reference => page.down({reference}),
              count   = mode => records.filter(record => record.family === 'components' && Example.publishes(record, mode)).length,
              shown   = mode => expectedPage('components', mode, records);

        expect(view.getCatalogStore().get('liquid-glass').kind).toBe('demonstration');
        expect(view.getCatalogStore().get('clock').kind).toBe('component');
        expect([group().count, group().tileCount]).toEqual([count('dist_prod'), shown('dist_prod').tiles.length]);

        // the cards show under "Demonstrations", the tiles by name under the default tile heading
        expect(pageIds(view, 'components')).toEqual(shown('dist_prod').cards);
        expect(tileIds(view, 'components')).toEqual(shown('dist_prod').tiles);
        expect([heading('cards-heading').hidden, heading('tiles-heading').hidden, heading('tiles-heading').text]).toEqual([false, false, 'Components']);

        // the same rule publishes a tile and a card: a build that cannot open the tile drops it from both counts
        view.getController().onSelectBuild({id: 'dist_esm'});
        expect(count('dist_esm')).toBe(count('dist_prod') - 1);
        expect([group().count, group().tileCount]).toEqual([count('dist_esm'), shown('dist_esm').tiles.length]);
        expect(tileIds(view, 'components')).not.toContain('clock');

        // a page that shows one kind heads neither
        view.getController().onSelectBuild({id: 'devmode'});
        expect([group().count, group().tileCount]).toEqual([count('devmode'), shown('devmode').tiles.length]);
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
        // a group's number is what its page shows: its own examples and the ones other groups lend it
        expect(links(mobIx).map(link => link.cn[2].text))
            .toEqual(Object.values(groupCounts).map(([count, crossCount]) => String(count + crossCount)));
        expect(links(mobIx).find(link => link.href === '#/examples/drag-drop')['aria-label'])
            .toBe(`Drag & Drop, ${ExampleGroup.countLabel({count: groupCounts['drag-drop'][0], crossCount: groupCounts['drag-drop'][1]})}`);
        expect(links(mobIx).some(link => link['aria-label'].includes('from other groups'))).toBe(false);
        expect(links(mobIx).every(link => link['aria-current'] === null)).toBe(true);
        expect(mobIx.vdom.cn[0].removeDom).toBe(true);
        // the all-examples link, the unbanded list, one section per band, and the line that says why the numbers add up
        // to more than the published total
        expect(mobIx.vdom.cn.map(node => node.tag)).toEqual(['a', 'ul', 'section', 'section', 'section', 'section', 'section', 'p']);
        expect(mobIx.vdom.cn.at(-1).removeDom).toBe(false);
        expect(mobIx.vdom.cn.at(-1).text).toBe(`${publishedCount} examples in all. Some appear in more than one group.`);

        expect(index.presentation).toBe('list');
        expect(index.vdom.cn[0].removeDom).toBe(false);
        expect(index.vdom.cn[0]['aria-current']).toBe('page');

        await view.getController().onExamplesRoute({itemId: 'drag-drop'});
        expect(index.vdom.cn[0]['aria-current']).toBeNull();
        expect(links(index).filter(link => link['aria-current'] === 'page').map(link => link.href)).toEqual(['#/examples/drag-drop']);
        expect(sheet.presentation).toBe('sheet');
        expect(sheet.vdom.cn[0].removeDom).toBe(false);
        expect(links(sheet).filter(link => link['aria-current'] === 'page').map(link => link.href)).toEqual(['#/examples/drag-drop']);
        expect(ExampleGroup.countLabel({count: 0, crossCount: 2})).toBe('2 live examples');
        expect(ExampleGroup.countLabel({count: 1, crossCount: 0})).toBe('1 live example');
        expect(ExampleGroup.countLabel({count: 4, crossCount: 4})).toBe('8 live examples');
        expect(ExampleGroup.countText({count: 0, crossCount: 2})).toBe('2')
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

    test('the side nav is one Tab stop, its walk asks for the route, and ArrowRight asks for the open page\'s cards', async () => {
        const view                   = createView(),
              controller             = view.getController(),
              index                  = view.getGroupIndex(),
              sheet                  = view.getSheet(),
              [first, second, third] = index.store.items.slice(-3),
              linkId                 = family => `${index.id}__${family}`,
              tabStops               = component => component.vdom.cn.flatMap(node => node.tag === 'a' ? [node] :
                  (node.tag === 'section' ? node.cn[1].cn : node.tag === 'ul' ? node.cn : []).map(item => item.cn[0])
              ).filter(link => link.tabIndex !== -1).map(link => link.href),
              originalMain           = Neo.Main,
              cards                  = [],
              routes                 = [];

        // A walk step: the key goes down on one link and comes up on the link focus rests on
        const step = (from, to, key='ArrowDown') => {
            index.onKeyDown({key, target: {id: linkId(from)}});
            index.onKeyUp(  {key, target: {id: linkId(to)}})
        };

        Neo.Main = {...originalMain, setRoute: data => routes.push(data)};
        controller.focusCards = () => cards.push(controller.getOpenRoute());

        try {
            expect(tabStops(index)).toEqual(['#/examples']);
            await controller.onExamplesRoute({itemId: first.route.slice('/examples/'.length)});
            expect(tabStops(index)).toEqual(['#' + first.route]);
            expect(tabStops(sheet)).toHaveLength(sheet.store.getCount() + 1);

            step(first.family, first.family, 'ArrowUp');
            expect(routes, 'a key that moved nothing takes no step').toEqual([]);

            step(first.family, second.family);
            step(second.family, third.family, 'End');
            expect(routes).toEqual([
                {replace: false, value: second.route, windowId: 1},
                {replace: true,  value: third.route,  windowId: 1}
            ]);

            index.onFocusLeave({});
            step(first.family, second.family);
            expect(routes.at(-1).replace, 'focus leaving the index ends the walk').toBe(false);

            index.onKeyDown({key: 'ArrowRight', target: {id: linkId(first.family)}});
            expect(cards).toEqual([first.route]);

            index.onKeyDown({key: 'ArrowRight', target: {id: linkId(third.family)}});
            expect(routes.at(-1)).toEqual({replace: true, value: third.route, windowId: 1});
            expect(cards, 'a page the route has not opened yet takes no focus').toEqual([first.route]);

            await controller.onExamplesRoute({itemId: third.route.slice('/examples/'.length)});
            expect(cards).toEqual([first.route, third.route])
        } finally {
            Neo.Main = originalMain
        }
    });

    test('history Back moves focus to the open destination link when focus rests in the side nav, and leaves outside focus untouched (#22120)', async () => {
        const view              = createView(),
              controller        = view.getController(),
              index             = view.getGroupIndex(),
              [first, second]   = index.store.items.slice(-2),
              linkId            = family => `${index.id}__${family}`,
              originalMain      = Neo.Main,
              originalNavigator = Neo.main?.addon?.Navigator,
              navigated         = [],
              routes            = [];

        Neo.ns('Neo.main.addon', true);
        Neo.Main                 = {...originalMain, setRoute: data => routes.push(data)};
        Neo.main.addon.Navigator = {
            navigateTo : data => navigated.push(data),
            subscribe  : () => {},
            unsubscribe: () => {}
        };

        try {
            index.mounted = true;
            await controller.onExamplesRoute({itemId: first.route.slice('/examples/'.length)});
            navigated.length = 0;

            index.containsFocus = true;
            index.onKeyDown({key: 'ArrowDown', target: {id: linkId(first.family)}});
            index.onKeyUp(  {key: 'ArrowDown', target: {id: linkId(second.family)}});
            expect(index.walking).toBe(true);
            expect(routes).toEqual([{replace: false, value: second.route, windowId: 1}]);

            await controller.onExamplesRoute({itemId: second.route.slice('/examples/'.length)});
            expect(navigated, 'a route the walk itself asked for does not overwrite live walk focus').toEqual([]);
            expect(index.walking).toBe(true);

            // History Back returns to `first` without `walk`: focus realigns to `first`'s link and ends the prior walk
            await controller.onExamplesRoute({itemId: first.route.slice('/examples/'.length)});
            expect(index.walking).toBe(false);
            expect(navigated).toEqual([{
                data      : index.navigator,
                fromTarget: index.id,
                target    : linkId(first.family),
                windowId  : 1
            }]);

            // History Back / Forward while focus sits outside the side nav leaves focus untouched
            index.containsFocus = false;
            await controller.onExamplesRoute({itemId: second.route.slice('/examples/'.length)});
            expect(navigated).toHaveLength(1)
        } finally {
            Neo.Main = originalMain;
            if (originalNavigator) {
                Neo.main.addon.Navigator = originalNavigator
            } else {
                delete Neo.main.addon.Navigator
            }
        }
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
              folder = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-example-families-'));

        // a catalog folder whose one group file holds every row
        fs.writeFileSync(path.join(folder, 'index.json'), JSON.stringify(['rows']));
        fs.writeFileSync(path.join(folder, 'rows.json'), JSON.stringify(rows));

        // The same rows through both readers of `familyDefinitions`: the build parses the section's source file
        const published = await getPublishedExampleFamilies({examplesDir: folder}),
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
        expect(pageIds(view, 'grid-table')).toEqual(expectedPage('grid-table').cards);
        expect(tileIds(view, 'forms')).toEqual(expectedPage('forms').tiles);

        store.remove(store.items.filter(record => record.family === 'grid-table'));
        store.fire('load');
        // Trees lends the tree grids from Grid & Table through alsoIn and keeps its own file explorer when they go
        expect(view.getGroupStore().items.map(group => group.route)).toEqual(
            publishedRoutes.filter(route => route !== '/examples/grid')
        );
        expect(view.getGroupPage('grid-table')).toBeNull();
        expect(pageIds(view, 'tree')).toEqual(['file-explorer'])
    });

    test('a record with alsoIn shows once in each of its groups and counts once, in its home group', () => {
        const view = createView(),
              lent = catalog.filter(record => record.alsoIn?.length && Example.publishes(record, 'dist_prod'));

        expect(lent.length).toBeGreaterThan(0);
        lent.forEach(record => [record.family, ...record.alsoIn].forEach(family => {
            expect([...pageIds(view, family), ...tileIds(view, family)].filter(id => id === record.id), `${record.id} on ${family}`).toHaveLength(1)
        }));
        // it counts once, in its home group: the home counts add up to the records that publish
        expect(view.getGroupStore().items.reduce((sum, group) => sum + group.count, 0)).toBe(publishedCount);
        // the paging toolbar reaches Buttons through the grid that runs it on the simulated server
        expect(pageIds(view, 'buttons')).toContain('grid-server-side');
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
        expect(pageIds(view, 'components')).toEqual(expectedPage('components').cards)
    });

    test('an open page stays open when a build switch removes or adds another page', async () => {
        const view       = createView(devmodeEmptiesComponents()),
              controller = view.getController(),
              stage      = view.getStage();

        await controller.onExamplesRoute({itemId: 'multi-window'});
        expect(openCard(view)).toBe('multi-window');
        expect(view.getSidebarFindField().placeholderText).toBe(`Search ${publishedCount} examples…  /`);
        expect(view.getMobileFindField().placeholderText).toBe(`Search ${publishedCount} examples…  /`);
        expect(view.getGroupIndex().vdom.cn[0]['aria-label']).toBe(`Start here, ${startHereIds.length} live examples`);
        expect(view.getGroupIndex().vdom.cn[0].cn[1].text).toBe('Start here');
        expect(view.getGroupIndex().vdom.cn[0].cn[2].text).toBe(String(startHereIds.length));

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
        expect(view.getSidebarFindField().placeholderText).toBe(`Search ${publishedCount} examples…  /`);
        expect(view.getMobileFindField().placeholderText).toBe(`Search ${publishedCount} examples…  /`);
        expect(view.getGroupIndex().vdom.cn[0]['aria-label']).toBe(`Start here, ${startHereIds.length} live examples`);
        expect(view.getGroupIndex().vdom.cn[0].cn[1].text).toBe('Start here');
        expect(view.getGroupIndex().vdom.cn[0].cn[2].text).toBe(String(startHereIds.length));

        controller.onFindFieldChange({value: 'drag'});
        expect(stage.items[stage.layout.activeIndex]).toBe(searchResults);
        expect(view.getSidebarFindField().value).toBe('drag');
        expect(view.getMobileFindField().value).toBe('drag');

        const dragIds = matchedIds();
        expect(dragIds).toEqual(expect.arrayContaining([
            'board-basic', 'board-swimlanes', 'board-big-data', 'board-multi-select', 'board-columns',
            'dialog-drag-drop', 'workstation', 'webdesktop'
        ]));
        expect(dragIds).not.toContain('multi-window-drag-drop');
        // a pane popped out by its action is not a drag, so it no longer answers "drag" through the group's title
        expect(dragIds).not.toContain('dock-tear-out');

        // every group counts its matching records at home and those lent to it, a group without a match at zero
        const counts = view.getStateProvider().getData('matchCounts'),
              drag   = expectedMatchCounts('drag'),
              label  = (title, family) => {
                  const {total} = drag.get(family);
                  return `${title}, ${total === 1 ? '1 matching example' : `${total} matching examples`}`
              };
        expect(counts).toBeInstanceOf(Map);
        expect(counts).toEqual(drag);

        const indexVdom = view.getGroupIndex().vdom,
              findEntry = (node, id) => node.id === id ? node : (node.cn || []).map(c => findEntry(c, id)).find(Boolean),
              startRow  = indexVdom.cn[0],
              dragStart = expectedMatches('drag').filter(record => record.featured).length,
              dragEntry = findEntry(indexVdom, `${view.getGroupIndex().id}__drag-drop`),
              calEntry  = findEntry(indexVdom, `${view.getGroupIndex().id}__calendar`);

        expect(startRow['aria-label']).toBe(`Start here, ${dragStart === 1 ? '1 matching example' : `${dragStart} matching examples`}`);
        expect(startRow.cn[2].text).toBe(String(dragStart));
        expect(dragEntry['aria-label']).toBe(label('Drag & Drop', 'drag-drop'));
        expect(dragEntry.cn[2].text).toBe(String(drag.get('drag-drop').total));
        expect(calEntry['aria-label']).toBe(label('Calendar', 'calendar'));
        // the line under the list explains the catalog's sums; a filter shows matches, so it stays out
        expect(indexVdom.cn.at(-1).removeDom).toBe(true);

        controller.onFindFieldChange({value: 'date'});
        const dateIds = matchedIds();
        expect(dateIds).toEqual(expect.arrayContaining([
            'calendar', 'scheduler-basic', 'scheduler-big-data', 'gantt-basic', 'gantt-big-data', 'date-field', 'date-selector', 'field-with-prefix'
        ]));
        const formsGroup = searchResults.getGroupsContainer().items.find(group =>
            group.items[0].vdom.cn[0].href === '#/examples/forms'
        );
        // A group lists its matching cards before its matching tiles: the input masks card names a date mask
        const formsDate = splitKinds(expectedMatches('date').filter(record => record.family === 'forms'));
        expect(formsDate.cards).toContain('field-with-prefix');
        expect(formsGroup.items[1].tiles).toBe(false);
        expect(formsGroup.items[1].store.items.map(r => r.id)).toEqual(formsDate.cards);
        expect(formsGroup.items[2].tiles).toBe(true);
        expect(formsGroup.items[2].store.items.map(r => r.id)).toEqual(formsDate.tiles);

        controller.onFindFieldChange({value: 'liquid'});
        expect(matchedIds()).toEqual(['liquid-glass']);
        expect(view.getGroupIndex().vdom.cn[0].cn[2].text).toBe('0');
        expect(view.getGroupIndex().vdom.cn[0].cls).toContain('portal-examples-group-index-zero');
        controller.onSelectBuild({id: 'devmode'});
        expect(view.getSidebarFindField().placeholderText).toBe(`Search ${publishedCount - 1} examples…  /`);
        expect(matchedIds()).toEqual([]);
        const emptyState = searchResults.down({reference: 'search-empty'});
        expect(emptyState.className).toBe('Neo.component.EmptyState');
        expect(emptyState.hidden).toBe(false);
        expect(searchResults.down({reference: 'search-clear-button'}).hidden).toBe(true);
        expect(emptyState.text).toBe('No published examples match your query in the selected build.');
        expect(emptyState.description).toBe('Try a capability term such as drag, date, grid or dashboard, or press Escape to return.');
        expect(emptyState.actionText).toBe('Clear (Esc)');
        expect(emptyState.actionHandler).toBe('onClearFind');
        controller.onSelectBuild({id: 'dist_prod'});
        expect(searchResults.down({reference: 'search-clear-button'}).hidden).toBe(false);
        expect(view.getSidebarFindField().placeholderText).toBe(`Search ${publishedCount} examples…  /`);
        expect(matchedIds()).toEqual(['liquid-glass']);

        controller.onClearFind();
        expect(view.findQuery).toBe('');
        expect(view.getStateProvider().getData('matchCounts')).toBeNull();
        expect(view.getStateProvider().getData('featuredMatches')).toBeNull();
        expect(view.getGroupIndex().vdom.cn[0].cn[2].text).toBe(String(startHereIds.length));
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

    test('a row step past a list\'s edge enters the page\'s next list, and one selection holds across a page\'s lists', async () => {
        const view           = createView(),
              controller     = view.getController(),
              page           = view.getGroupPage('forms'),
              [cards, tiles] = page.getLists(),
              selected       = list => list.selectionModel.items,
              itemOf         = (list, record) => list.getItemId(list.getRecordId(record)),
              firstOf        = list => itemOf(list, list.store.items[0]),
              lastOf         = list => itemOf(list, list.store.items.at(-1));

        // the step needs both kinds on the page
        expect(cards.store.getCount()).toBeGreaterThan(0);
        expect(tiles.store.getCount()).toBeGreaterThan(0);
        expect(controller.getPageLists(tiles.id)).toEqual([cards, tiles]);

        // no layout to measure here, so an entered list takes its first or last card in reading order
        [cards, tiles].forEach(list => {list.focus = () => {}});
        cards.selectionModel.select(lastOf(cards));

        // ArrowDown past the last demonstration row enters the tiles, and the card gives up its selection
        await controller.onListLeaveRow({direction: 1, left: 0, right: 320, source: cards.id});
        expect(selected(tiles)).toEqual([firstOf(tiles)]);
        expect(selected(cards)).toEqual([]);

        // ArrowUp past the first tile row returns to the demonstrations' last row
        await controller.onListLeaveRow({direction: -1, left: 0, right: 320, source: tiles.id});
        expect(selected(cards)).toEqual([lastOf(cards)]);
        expect(selected(tiles)).toEqual([]);

        // at the page's outer edges nothing moves
        await controller.onListLeaveRow({direction: -1, left: 0, right: 320, source: cards.id});
        expect(selected(cards)).toEqual([lastOf(cards)]);
        await controller.onListLeaveRow({direction: 1, left: 0, right: 320, source: tiles.id});
        expect(selected(tiles)).toEqual([]);

        // a pointer selection in the other list clears this one too
        tiles.selectionModel.select(lastOf(tiles));
        expect(selected(cards)).toEqual([]);
        expect(selected(tiles)).toEqual([lastOf(tiles)])
    });
});

const {records: catalog} = await readExampleCatalog(path.join(repoRoot, EXAMPLES_DIR)),
      modes              = ['devmode', 'dist_dev', 'dist_esm', 'dist_prod'],
      // the 12 Start here demonstrations placed first in featured catalog order
      startHereIds = [
          'workstation', 'grid-big-data', 'grid-tree-big-data', 'devindex', 'shared-covid',
          'grid-issues', 'scheduler-basic', 'gantt-basic', 'board-basic', 'calendar', 'webdesktop', 'dock-choreography'
      ],
      componentExampleIds = [
          'carousel', 'chip', 'circle', 'clock', 'magic-move-text',
          'markdown', 'live-preview', 'process', 'progress', 'splitter', 'status-badge', 'timer',
          'toast', 'popover', 'video', 'monaco-editor', 'open-street-maps', 'graph-scene', 'am-charts',
          'sparklines', 'mermaid', 'video-move', 'context-menu-files', 'breadcrumb'
      ],
      // every group: each has a card or tile a production build opens on this catalog, in definition order
      publishedRoutes = [
          '/examples/apps', '/examples/grid', '/examples/tree', '/examples/lists', '/examples/charts',
          '/examples/calendar', '/examples/scheduler', '/examples/gantt', '/examples/board',
          '/examples/dashboard', '/examples/tabs', '/examples/layouts', '/examples/dialogs',
          '/examples/forms', '/examples/buttons', '/examples/components',
          '/examples/multi-window', '/examples/platform', '/examples/state', '/examples/functional', '/examples/drag-drop'
      ],
      // [home count, count from other groups] per published group in a production build, in definition order, from the
      // records by the view's rule. A group's records live in its own file, whose diff says which group gained what, so
      // the counts derive and an examples PR edits no line here.
      groupCounts = Object.fromEntries(ExamplesMainContainer.config.familyDefinitions
          .map(({family}) => [family, [
              catalog.filter(record => record.family === family && Example.publishes(record, 'dist_prod')).length,
              catalog.filter(record => record.alsoIn?.includes(family) && Example.publishes(record, 'dist_prod')).length
          ]])
          .filter(([, [count, crossCount]]) => count + crossCount > 0)),
      recordCount    = catalog.length,
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

        expect(store.getCount()).toBe(recordCount);

        store.forEach(record => {
            expect(typeof record.id, record.name).toBe('string');
            expect(record.id, record.name).toMatch(/^[a-z][a-z0-9-]*$/);
            ids.push(record.id)
        });

        expect(new Set(ids).size).toBe(recordCount);
        expect(list.catalogMode).toBe('dist_prod')
    });

    test('the full calendar and team year link to their own examples in every build', () => {
        const calendars = catalog.filter(record => record.family === 'calendar');

        for (const [id, folder] of [['calendar', 'basic'], ['calendar-year', 'year']]) {
            const record = calendars.find(item => item.id === id),
                  route  = `examples/calendar/${folder}/index.html`;
            expect(record).toMatchObject({
                component: 'Calendar',
                feature  : expect.any(String),
                lookFor  : expect.any(String)
            });
            expect(record.urls).toEqual({
                devmode  : route,
                dist_dev : `dist/development/${route}`,
                dist_esm : `dist/esm/${route}`,
                dist_prod: `dist/production/${route}`
            })
        }
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

        // the 21 records placed across target groups
        Object.entries(moved).forEach(([group, ids]) => ids.forEach(id => expect(catalog.find(record => record.id === id).family, id).toBe(group)));
        expect(Object.values(moved).flat()).toHaveLength(21)
    });

    test('each group file holds its group\'s records, and the index names the files in definition order', () => {
        const dir         = path.join(repoRoot, EXAMPLES_DIR),
              index       = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')),
              definitions = ExamplesMainContainer.config.familyDefinitions.map(definition => definition.family);

        // a group without a record of its own has no file; every file is in the index
        expect(index).toEqual(definitions.filter(family => catalog.some(record => record.family === family)));
        expect(fs.readdirSync(dir).filter(name => name !== 'index.json').sort()).toEqual(index.map(family => `${family}.json`).sort());

        index.forEach(family => {
            const records = JSON.parse(fs.readFileSync(path.join(dir, `${family}.json`), 'utf8'));

            records.forEach(record => expect(record.family, record.id).toBe(family));
            // a file lists its records in their catalog order, a record without `order` at its end
            expect(records.map(record => record.id), family).toEqual(orderCatalog(records).map(record => record.id))
        })
    });

    test('the Portal and the build order records by one rule: `order` ascending, a record without one last, ties kept', () => {
        const rows = [{id: 'a'}, {id: 'b', order: 20}, {id: 'c', order: 10}, {id: 'd'}, {id: 'e', order: 20}];

        expect(ExampleCatalog.order(rows).map(row => row.id)).toEqual(['c', 'b', 'e', 'a', 'd']);
        expect(orderCatalog(rows).map(row => row.id)).toEqual(['c', 'b', 'e', 'a', 'd']);
        expect(rows.map(row => row.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    });

    /**
     * @summary The section's catalog Store, its folder reads held: each request waits until the test answers it.
     * @returns {{store: Portal.store.Examples, url: String, index: String[], requests: Map<String, Function>}}
     */
    function createHeldCatalog() {
        const {pipeline} = ExamplesMainContainer.config.stateProvider.stores.catalog,
              dir        = path.join(repoRoot, EXAMPLES_DIR),
              requests   = new Map(),
              store      = Neo.create(ExamplesStore, {pipeline: {...pipeline, connection: {...pipeline.connection}}});

        store.pipeline.connection.promiseJson = ({url}) => new Promise(resolve => {
            requests.set(url, () => resolve({json: JSON.parse(fs.readFileSync(path.join(dir, path.basename(url)), 'utf8'))}))
        });

        return {store, url: pipeline.connection.url, index: JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')), requests}
    }

    test('the catalog store reads the index, then every group file beside it, inside the Store\'s own load', async () => {
        const {store, url, index, requests} = createHeldCatalog(),
              groupUrls                     = index.map(group => url.replace('index.json', `${group}.json`)),
              events                        = [];

        store.on('load', data => events.push(data));

        try {
            const loading = store.load();

            // pending and loading while the index is out; the group files follow it, all at once
            expect([store.isLoadPending, store.isLoading]).toEqual([true, true]);
            await expect.poll(() => [...requests.keys()]).toEqual([url]);
            requests.get(url)();
            await expect.poll(() => requests.size).toBe(index.length + 1);
            expect([...requests.keys()].slice(1)).toEqual(groupUrls);
            expect([store.isLoadPending, store.isLoading]).toEqual([true, true]);

            groupUrls.forEach(groupUrl => requests.get(groupUrl)());
            const items = await loading;

            expect(items.map(record => record.id)).toEqual(catalog.map(record => record.id));
            expect([store.isLoadPending, store.isLoading, store.isLoaded]).toEqual([false, false, true]);
            expect(store.totalCount).toBe(catalog.length);
            expect(events.at(-1)).toMatchObject({isLoading: false, total: catalog.length})
        } finally {
            store.destroy()
        }
    });

    test('a catalog store destroyed while a group file is out rejects its load as destroyed', async () => {
        const {store, url, index, requests} = createHeldCatalog(),
              loading                       = store.load();

        await expect.poll(() => requests.size).toBe(1);
        requests.get(url)();
        await expect.poll(() => requests.size).toBe(index.length + 1);

        store.destroy();
        [...requests.values()].slice(1).forEach(answer => answer());

        await expect(loading).rejects.toBe(Neo.isDestroyed)
    });

    test('places the 12 featured Start here demonstrations first in #21140 catalog order', () => {
        expect(catalog.slice(0, 12).map(record => record.id)).toEqual(startHereIds);
        expect(catalog.filter(record => record.featured).map(record => record.id)).toEqual(startHereIds);
        expect(catalog.find(record => record.id === 'helix').name).toBe('3D Helix')
    });

    // The counts and pages above derive through this rule, so it gets an oracle of its own
    test('a record publishes in a build when it names a cover, is not hidden there, and names a URL for it', () => {
        const record = {image: 'devmode/example.jpg', urls: Object.fromEntries(modes.map(mode => [mode, `${mode}/example/index.html`]))};

        for (const mode of modes) {
            expect(Example.publishes(record, mode), mode).toBe(true);
            expect(Example.publishes({...record, image: null}, mode), `${mode}: no cover`).toBe(false);
            expect(Example.publishes({...record, hidden: true}, mode), `${mode}: hidden`).toBe(false);
            expect(Example.publishes({...record, hiddenIn: [mode]}, mode), `${mode}: hidden in this build`).toBe(false);
            expect(Example.publishes({...record, hiddenIn: modes.filter(other => other !== mode)}, mode), `${mode}: hidden in the others`).toBe(true);
            expect(Example.publishes({...record, urls: {...record.urls, [mode]: undefined}}, mode), `${mode}: no URL`).toBe(false)
        }
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
              store        = view.getGroupPage('grid-table').getList().store;

        catalogStore.forEach(record => {
            if (record.family === 'grid-table') {
                expect(['Grid', 'Table', 'Timeline'], record.id).toContain(record.component);
                expect(record.feature, record.id).toBeTruthy();
                expect(record.lookFor, record.id).toBeTruthy()
            }
        });

        expect(store.items.map(record => record.id)).toEqual(expectedPage('grid-table').cards);
        expect(store.getSource()).toBe(catalogStore)
    });

    test('the Multi-Window page borrows the catalog records and respects each build destination', () => {
        const view         = createView(),
              catalogStore = view.getCatalogStore(),
              list         = view.getGroupPage('multi-window').getList(),
              {store}      = list;

        expect(store.getSource()).toBe(catalogStore);
        expect(store.items.map(record => record.id)).toEqual(expectedPage('multi-window').cards);
        // the dock examples moved home to Dashboard & Docking; two of them stay listed here through alsoIn, as do Web Desktop,
        // Email and On Air at Eight
        expect(catalogStore.items.filter(record => Example.belongsTo(record, 'multi-window') && record.family !== 'multi-window')
            .map(record => record.id)).toEqual(expect.arrayContaining(['webdesktop', 'dock-cross-window', 'dock-tear-out', 'email', 'on-air-at-eight']));

        for (const mode of modes) {

            list.catalogMode = mode;
            expect(store.items.filter(record => !list.isHiddenItem(record)).map(record => record.id)).toEqual(
                store.items.map(record => record.id).filter(id => mode !== 'dist_esm' || id !== 'shared-offscreen-canvas')
            )
        }

        expect(catalogStore.get('dock-layouts').sharedWorkers).toBe(false);
        expect(catalogStore.get('dock-tear-out').sharedWorkers).toBe(true);
        expect(catalogStore.get('webdesktop').sharedWorkers).toBe(true);
        expect(catalogStore.get('multi-window-helix')).toBeNull();
        expect(catalogStore.get('multi-window-state-provider')).toBeNull();
        expect(fs.existsSync(path.join(repoRoot, 'examples/component/multiWindowHelix/index.html'))).toBe(true);
        expect(fs.existsSync(path.join(repoRoot, 'examples/stateProvider/multiWindow/index.html'))).toBe(true);
        expect(catalogStore.get('video')).toMatchObject({
            family       : 'components',
            hasLightCover: true,
            image        : 'devmode/tiles/component-video-14.jpg',
            kind         : 'component',
            name         : 'Video'
        });
        expect(tileIds(view, 'components')).toContain('video')
    });

    test('keeps the catalog order, and each build shows the records it can open', () => {
        const {store} = createList(),
              ids     = catalog.map(record => record.id),
              cases   = [
                  ['devmode', 'examples/grid/bigData/index.html', 'apps/workstation/index.html', 'examples/dashboard/choreography/index.html'],
                  ['dist_dev', 'dist/development/examples/grid/bigData/index.html', 'dist/development/apps/workstation/index.html', 'dist/development/examples/dashboard/choreography/index.html'],
                  ['dist_esm', 'dist/esm/examples/grid/bigData/index.html', 'dist/esm/apps/workstation/index.html', 'dist/esm/examples/dashboard/choreography/index.html'],
                  ['dist_prod', 'dist/production/examples/grid/bigData/index.html', 'dist/production/apps/workstation/index.html', 'dist/production/examples/dashboard/choreography/index.html']
              ];

        // the store keeps the order the group files' `order` values give the catalog
        expect(store.items.map(record => record.id)).toEqual(ids);

        // the list hides what its store would filter out: a record without a cover publishes no card in any mode
        const uncovered = ids.filter(id => !store.get(id).image);

        expect(uncovered).toHaveLength(uncoveredCount);

        cases.forEach(([mode, bigDataUrl, workstationUrl, choreographyUrl]) => {
            list.catalogMode = mode;
            expect(list.environment).toBe(mode === 'devmode' ? 'development' : mode === 'dist_dev' ? 'dist/development' : 'dist/production');

            // a build opens a covered record it does not hide and names a URL for, except the Portal's own record in the
            // build the Portal runs in, which would link to the page itself
            const visible = store.items.filter(record => !list.isHiddenItem(record)),
                  opens   = catalog.filter(record => record.image && !record.hidden && !record.hiddenIn?.includes(mode) && record.urls?.[mode] &&
                      !(record.sourceUrl === 'apps/portal' && list.environment === Neo.config.environment));

            expect(visible.map(record => record.id), mode).toEqual(opens.map(record => record.id));
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
            // The canvas example lives in this repository now, so its source link is the repository's in every mode
            expect(list.createSourceLink(offscreen).href, mode).toBe(list.sourceBaseUrl + 'examples/worker/canvas');
            // No catalog record carries a per-mode source any more; the override itself still wins over the common link
            expect(list.createSourceLink({sourceUrl: 'examples/a', sourceUrls: {dist_prod: 'https://example.com/b'}}).href, mode)
                .toBe(mode === 'dist_prod' ? 'https://example.com/b' : list.sourceBaseUrl + 'examples/a');
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

    test('publishes the Issues Grid and COVID dashboard with paired opening covers in every mode', () => {
        const {store} = createList(),
              recipes = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../../../../../../buildScripts/docs/captureExamples.json', import.meta.url)), 'utf8')).recipes;

        for (const [id, sourceUrl] of [['grid-issues', 'examples/grid/issues'], ['covid-dashboard', 'apps/covid']]) {
            const matches  = store.items.filter(record => record.sourceUrl === sourceUrl),
                  [record] = matches;

            expect(matches, id).toHaveLength(1);
            expect(record).toMatchObject({id, image: `devmode/${id}-14.jpg`, hasLightCover: true});
            expect(recipes.some(recipe => recipe.id === id), id).toBe(false);
            modes.forEach(mode => {
                list.catalogMode = mode;
                expect(list.isHiddenItem(record), mode).toBe(false);
                expect(list.createLink(record).href, mode).toBe(list.baseUrl + record.urls[mode])
            })
        }
    });

    test('renders two-zone cover + stationary footer, prunes browsers, and isolates Mobile vs Multi-window metadata', () => {
        const {store} = createList(),
              byCls   = (node, cls) => node.cls?.includes(cls) ? node : (node.cn || []).map(child => byCls(child, cls)).find(Boolean);

        store.items.filter(record => modes.some(mode => Example.publishes(record, mode))).forEach(record => {
            const content = list.createItemContent(record, 0)[0],
                  wrap    = content.cn.find(node => node.cls?.includes('preview-image-wrap')),
                  footer  = content.cn.find(node => node.cls?.includes('portal-example-footer')),
                  more    = content.cn.find(node => node.cls?.includes('portal-example-more')),
                  feature = footer.cn.find(node => node.cls?.includes('portal-example-feature')),
                  lookFor = byCls(more, 'portal-example-look-for'),
                  mobile  = byCls(more, 'portal-example-meta');

            expect(content.cn.map(node => node.cls?.[0]), record.id).toEqual([
                'preview-image-wrap', 'portal-example-footer', 'portal-example-more'
            ]);
            expect(wrap.cn.map(node => node.cls?.[0]), record.id).toEqual(['neo-multi-window', 'preview-image']);
            expect(footer.cn.map(node => node.cls?.[0] ?? node.tag), record.id).toEqual([
                'portal-example-group-badge', 'portal-example-title-row', 'portal-example-feature'
            ]);
            expect(footer.cn[0].removeDom, record.id).toBe(true);
            expect(feature.text, record.id).toBe(record.feature);
            expect(feature.removeDom, record.id).toBe(false);
            expect(lookFor.text, record.id).toBe(record.lookFor);
            expect(lookFor.removeDom, record.id).toBe(false);
            expect(mobile.removeDom, record.id).toBe(!record.environments?.includes('Mobile'));

            const link    = list.createLink(record),
                  actions = footer.cn[1].cn[1],
                  source  = actions.cn[0],
                  cue     = actions.cn[1];

            expect(footer.cn[1].cn[0].href, record.id).toBe(link.href);
            expect(source.href, record.id).toBe(list.createSourceLink(record).href);
            expect(cue, record.id).toMatchObject({
                tag          : 'a',
                cls          : ['portal-example-open-cue'],
                href         : link.href,
                'aria-hidden': true,
                tabIndex     : -1,
                cn           : [{tag: 'span', text: 'Open live'}, {tag: 'i', cls: ['fa', 'fa-arrow-up-right-from-square']}]
            });
            expect(cue.target, record.id).toBe(link.target);
            expect(byCls(more, 'neo-github-image'), record.id).toBeUndefined();
            expect(JSON.stringify(content), record.id).not.toContain('Chrome, Edge, Firefox, Safari');
            expect(byCls(content, 'portal-example-placeholder'), record.id).toBeUndefined()
        });

        const workstation = list.createItemContent(store.get('workstation'), 0)[0],
              mwBadge     = byCls(workstation, 'neo-multi-window'),
              wsMobile    = byCls(workstation, 'portal-example-meta'),
              bigData     = list.createItemContent(store.get('grid-big-data'), 0)[0],
              bdMultiWin  = byCls(bigData, 'neo-multi-window'),
              bdMobile    = byCls(bigData, 'portal-example-meta');

        expect(mwBadge.removeDom).toBe(false);
        expect(mwBadge['aria-label']).toBe('Multi-window live example');
        expect(byCls(mwBadge, 'neo-multi-window-label').text).toBe('Multi-window');
        expect(wsMobile.removeDom).toBe(true);
        expect(bdMultiWin.removeDom).toBe(true);
        expect(bdMobile.removeDom).toBe(false);
        expect(byCls(bdMobile, 'portal-example-mobile').text).toBe('Desktop · Mobile');

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
        expect(list.getBackgroundImageStyle(store.get('grid-tree'))['--portal-example-cover']).toBe(`url('${list.imageBasePath}/devmode/grid-tree-14.jpg')`);
        expect(list.getBackgroundImageStyle(store.get('on-air-at-eight'))['--portal-example-cover']).toBe(`url('${list.imageBasePath}/devmode/on-air-at-eight-14.jpg')`);
        expect(list.getBackgroundImageStyle({image: null})).toEqual({});

        for (const extension of ['jpg', 'png']) {
            const image = `devmode/example.${extension}`;
            expect(list.getBackgroundImageStyle({image, hasLightCover:true})).toEqual({
                '--portal-example-cover'      : `url('${list.imageBasePath}/${image}')`,
                '--portal-example-cover-light': `url('${list.imageBasePath}/devmode/example-light.${extension}')`
            });
            expect(list.getBackgroundImageStyle({image})).toEqual({
                '--portal-example-cover': `url('${list.imageBasePath}/${image}')`
            })
        }
    });

    test('Overview switches its intro lead between phoneLead (size: x-small) and desktop lead, and mobile-find flexes on one crumb row', () => {
        const view     = createView(),
              overview = view.getOverview(),
              intro    = overview.down({reference: 'overview-intro'}),
              crumb    = view.getCrumb(),
              find     = view.getMobileFindField();

        expect(crumb.layout.ntype).toBe('layout-hbox');
        expect(crumb.layout.wrap).toBe('wrap');
        expect(find.flex).toBe('1 1 180px');
        expect(intro.vdom.cn[2].text).toBe(overview.lead);

        view.getStateProvider().setData({size: 'x-small'});
        expect(overview.compactLead).toBe(true);
        expect(intro.vdom.cn[2].text).toBe('Grids, Gantt charts, forms and apps, each one running live in your browser.');

        view.getStateProvider().setData({size: 'large'});
        expect(overview.compactLead).toBe(false);
        expect(intro.vdom.cn[2].text).toBe(overview.lead)
    });

    test('pairs the Button, hosted-button and Web Desktop tiles and gives published records visitor-facing names', () => {
        const {store}     = createList(),
              dottedNames = store.items
                  .filter(record => modes.some(mode => Example.publishes(record, mode)) && /^[a-z][a-zA-Z0-9]*\.[A-Z]/.test(record.name || ''))
                  .map(record => record.id);

        expect(store.get('button-base').hasLightCover).toBe(true);
        expect(store.get('functional-host-component').hasLightCover).toBe(true);
        expect(store.get('webdesktop')).toMatchObject({hasLightCover: true, image: 'devmode/webdesktop-14-0.jpg'});
        expect(store.get('toast').name).toBe('Toast Notifications');
        expect(store.get('popover').name).toBe('Popover');
        expect(dottedNames).toEqual([])
    })
});
