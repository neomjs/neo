import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalExamplesListModelTest'
    }
});

import {test, expect}    from '@playwright/test';
import fs                from 'node:fs';
import path              from 'node:path';
import {fileURLToPath}   from 'node:url';
import Neo               from '../../../../../../../src/Neo.mjs';
import * as core         from '../../../../../../../src/core/_export.mjs';
import ExamplesList      from '../../../../../../../apps/portal/view/examples/List.mjs';
import ExamplesListModel from '../../../../../../../apps/portal/view/examples/ListModel.mjs';
import ExamplesStore     from '../../../../../../../apps/portal/store/Examples.mjs';

const listCssPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../../resources/css/src/apps/portal/examples/List.css');

const sampleRecords = [
    {id: 'workstation',   name: 'Workstation',      family: 'multi-window', image: 'devmode/ws.jpg',     feature: 'Web desktop',  lookFor: 'Drag windows', urls: {devmode: 'apps/workstation/index.html',                 dist_prod: 'dist/production/apps/workstation/index.html'},                 sourceUrl: 'apps/workstation',           sharedWorkers: true,  environments: ['Desktop']},
    {id: 'grid-big-data', name: 'Grid Big Data',    family: 'grid-table',   image: 'devmode/grid.jpg',   feature: '100k × 200',   lookFor: 'Scroll fast',  urls: {devmode: 'examples/grid/bigData/index.html',            dist_prod: 'dist/production/examples/grid/bigData/index.html'},            sourceUrl: 'examples/grid/bigData',      sharedWorkers: false, environments: ['Desktop', 'Mobile']},
    {id: 'sprint-board',  name: 'Sprint Board',     family: 'board',        image: 'devmode/board.jpg',  feature: 'Kanban board', lookFor: 'Move cards',   urls: {devmode: 'examples/board/sprint/index.html',            dist_prod: 'dist/production/examples/board/sprint/index.html'},            sourceUrl: 'examples/board/sprint',      sharedWorkers: false, environments: ['Desktop']},
    {id: 'garden-gantt',  name: 'Community Garden', family: 'gantt',        image: 'devmode/gantt.jpg',  feature: 'Project plan', lookFor: 'Move tasks',   urls: {devmode: 'examples/gantt/garden/index.html',            dist_prod: 'dist/production/examples/gantt/garden/index.html'},            sourceUrl: 'examples/gantt/garden',      sharedWorkers: false, environments: ['Desktop']},
    {id: 'calendar-main', name: 'Calendar',         family: 'calendar',     image: 'devmode/cal.jpg',    feature: 'Four views',   lookFor: 'Switch views', urls: {devmode: 'examples/calendar/basic/index.html',          dist_prod: 'dist/production/examples/calendar/basic/index.html'},          sourceUrl: 'examples/calendar/basic',    sharedWorkers: false, environments: ['Desktop']},
    {id: 'portal-self',   name: 'Portal',           family: 'apps',         image: 'devmode/portal.jpg', feature: 'This website', lookFor: 'Browse',       urls: {devmode: 'apps/portal/index.html',                      dist_prod: 'dist/production/apps/portal/index.html'},                      sourceUrl: 'apps/portal',                sharedWorkers: false, environments: ['Desktop']},
    {id: 'helix-list',    name: 'Helix',            family: 'lists',        image: 'devmode/helix.jpg',  feature: '3D helix',     lookFor: 'Rotate cards', urls: {devmode: 'examples/component/helix/index.html',         dist_prod: 'dist/production/examples/component/helix/index.html'},         sourceUrl: 'examples/component/helix',   sharedWorkers: false, environments: ['Desktop']}
];

let list, store;

async function createMountedList({catalogMode='dist_prod', rectsByRecordId=null}={}) {
    store = Neo.create(ExamplesStore, {
        autoInitRecords: true,
        data           : structuredClone(sampleRecords),
        isLoaded       : true
    });

    list = Neo.create(ExamplesList, {
        appName: 'PortalExamplesListModelTest',
        catalogMode,
        store
    });

    await list.initVnode();
    list.mounted = true;

    const focusedIds = [];
    list.focus = id => focusedIds.push(id);

    if (rectsByRecordId) {
        list.getDomRect = async ids => ids.map(id => {
            const recordId = list.getItemRecordId(id),
                  record   = store.get(recordId);
            return rectsByRecordId[record?.id] || {x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0}
        })
    }

    return {focusedIds, list, model: list.selectionModel, store}
}

test.afterEach(() => {
    list?.destroy();
    store?.destroy();
    list  = null;
    store = null
});

test.describe('Portal.view.examples.ListModel', () => {
    test('a compact tile keeps its direct 4:3 crop while the cover reflection and glint extend to tiles (#22122)', async () => {
        const {list} = await createMountedList();

        // The tile renderer is untouched: one direct .preview-image crop, no wrap, caption and launch icon below
        await list.set({tiles: true});
        const [tile] = list.createItemContent(store.get('grid-big-data'), 0);

        expect(tile.cls).toEqual(['content', 'portal-example-tile']);
        expect(tile.cn[0].cls).toEqual(['preview-image']);
        expect(tile.cn[1].cls).toEqual(['portal-example-title-row']);

        await list.set({tiles: false});

        const css = fs.readFileSync(listCssPath, 'utf8');

        // One shared rule carries the reflection and the glint for the card wrap and the tile crop
        expect(css).toMatch(/\.preview-image-wrap,\s*&\.portal-examples-tiles \.neo-list-item \.preview-image \{/);
        expect(css).toMatch(/\.neo-list-item:hover \.preview-image-wrap::after,\s*&\.portal-examples-tiles \.neo-list-item:hover \.preview-image::after \{/);
        expect(css).toContain('animation: portal-examples-list-glint calc(var(--motion-stage) * 1.5) var(--ease-out-soft) forwards');

        // The tile crop keeps its 4:3 and blends into its own stacking context, never the page behind
        const tileBranch = css.match(/&\.portal-examples-tiles \{[\s\S]*?\n    \}$/m)?.[0] ?? '',
              tileImage  = tileBranch.match(/\.preview-image \{([\s\S]*?)\n            \}/)?.[1] ?? '';

        expect(tileImage).toContain('aspect-ratio       : 4 / 3');
        expect(tileImage).toContain('isolation          : isolate')
    });

    test('configures selectOnFocus: false, clickSelector: ".neo-title", and all four arrow keys via navigator.workerKeys', async () => {
        const {list, model} = await createMountedList();

        expect(model).toBeInstanceOf(ExamplesListModel);
        expect(list.selectOnFocus).toBe(false);
        expect(list.navigator.autoClick).toBe(false);
        expect(list.navigator.clickSelector).toBe('.neo-title');
        expect(list.navigator.workerKeys).toEqual(['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'])
    });

    test('toggles selection on card-body clicks, clears on Escape, and preserves card A selection when clicking card B links', async () => {
        const {list, model, store} = await createMountedList(),
              itemA                = list.getItemId(list.getRecordId(store.get('workstation'))),
              itemB                = list.getItemId(list.getRecordId(store.get('grid-big-data')));

        // Body click selects card A
        model.onListClick({
            currentTarget: itemA,
            path         : [{id: 'preview-a', tagName: 'div', cls: ['preview-image']}, {id: itemA, tagName: 'li', cls: ['neo-list-item']}]
        });
        expect(model.items).toEqual([itemA]);

        // Clicking card B's title link, Open live cue, or nested icon inside GitHub link leaves card A selected
        for (const anchorPath of [
            [{id: 'title-b', tagName: 'a', cls: ['neo-title']}, {id: itemB, tagName: 'li', cls: ['neo-list-item']}],
            [{id: 'cue-b', tagName: 'A', cls: ['portal-example-open-cue']}, {id: itemB, tagName: 'li', cls: ['neo-list-item']}],
            [{id: 'icon-b', tagName: 'span', cls: []}, {id: 'gh-b', tagName: 'a', cls: ['neo-github-image']}, {id: itemB, tagName: 'li', cls: ['neo-list-item']}]
        ]) {
            model.onListClick({currentTarget: itemB, path: anchorPath});
            expect(model.items).toEqual([itemA])
        }

        // Re-clicking card A's body toggles selection off
        model.onListClick({
            currentTarget: itemA,
            path         : [{id: 'footer-a', tagName: 'div', cls: ['portal-example-footer']}, {id: itemA, tagName: 'li', cls: ['neo-list-item']}]
        });
        expect(model.items).toEqual([]);

        // Escape clears active selection
        model.select(itemB);
        expect(model.items).toEqual([itemB]);
        model.onKeyDownEscape();
        expect(model.items).toEqual([])
    });

    test('steps linearly on Left/Right while skipping hidden self-portal records in devmode', async () => {
        const originalEnv = Neo.config.environment;
        Neo.config.environment = 'development';

        try {
            const {focusedIds, list, model, store} = await createMountedList({catalogMode: 'devmode'}),
                  calId                            = list.getItemId(list.getRecordId(store.get('calendar-main'))),
                  helixId                          = list.getItemId(list.getRecordId(store.get('helix-list')));

            model.select(calId);
            model.onKeyDownRight({path: [{id: calId, cls: ['neo-list-item']}]});

            // Skips 'portal-self' (hidden in devmode) and lands directly on 'helix-list'
            expect(model.items).toEqual([helixId]);
            expect(focusedIds.at(-1)).toBe(helixId);

            model.onKeyDownLeft({path: [{id: helixId, cls: ['neo-list-item']}]});
            expect(model.items).toEqual([calId])
        } finally {
            Neo.config.environment = originalEnv
        }
    });

    test('builds root-relative cover URLs on GitHub Pages in every environment, raw-host URLs elsewhere', async () => {
        const {environment, isGitHubPages} = Neo.config,
              record                       = {image: 'devmode/grid.jpg', hasLightCover: true},
              raw                          = 'https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/website/examples';

        try {
            const {list} = await createMountedList();

            Neo.config.isGitHubPages = true;

            for (const env of ['development', 'dist/esm', 'dist/production']) {
                Neo.config.environment = env;
                expect(list.getBackgroundImageStyle(record)).toEqual({
                    '--portal-example-cover'      : "url('/resources_pub/website/examples/devmode/grid.jpg')",
                    '--portal-example-cover-light': "url('/resources_pub/website/examples/devmode/grid-light.jpg')"
                })
            }

            Neo.config.isGitHubPages = false;
            expect(list.getBackgroundImageStyle(record)['--portal-example-cover']).toBe(`url('${raw}/devmode/grid.jpg')`)
        } finally {
            Object.assign(Neo.config, {environment, isGitHubPages})
        }
    });

    test('ArrowLeft on the first card hands the step to the list\'s owner and keeps the selection; enter() returns to it, or else to the first card', async () => {
        const {focusedIds, list, model, store} = await createMountedList(),
              itemId                           = id => list.getItemId(list.getRecordId(store.get(id))),
              firstId                          = itemId('workstation'),
              secondId                         = itemId('grid-big-data'),
              leaves                           = [];

        list.on('leaveStart', data => leaves.push(data.record.id));

        model.select(secondId);
        model.onKeyDownLeft({path: [{id: secondId, cls: ['neo-list-item']}]});
        expect(model.items).toEqual([firstId]);
        expect(leaves).toEqual([]);

        model.onKeyDownLeft({path: [{id: firstId, cls: ['neo-list-item']}]});
        expect(leaves).toEqual(['workstation']);
        expect(model.items).toEqual([firstId]);

        model.select(secondId);
        focusedIds.length = 0;
        model.enter();
        expect(model.items).toEqual([secondId]);
        expect(focusedIds).toEqual([secondId]);

        model.deselectAll();
        model.enter();
        expect(model.items).toEqual([firstId]);
        expect(focusedIds.at(-1)).toBe(firstId)
    });

    test('an earlier row measurement cannot replace a later Escape or card selection', async () => {
        const {focusedIds, list, model, store} = await createMountedList(),
              firstId                          = list.getItemId(list.getRecordId(store.get('workstation'))),
              otherId                          = list.getItemId(list.getRecordId(store.get('sprint-board'))),
              rects                            = [
                  {x: 0, y: 0,   width: 320, height: 200},
                  {x: 0, y: 214, width: 320, height: 200}
              ],
              holdRowMove = () => {
                  let complete;

                  list.getDomRect = () => new Promise(resolve => {complete = resolve});

                  const move = model.onKeyDownDown({path: [{id: firstId, cls: ['neo-list-item']}]});

                  return async () => {
                      complete(rects);
                      await move
                  }
              };

        model.select(firstId);

        const finishBeforeEscape = holdRowMove();
        list.keys.onKeyDown({key: 'Escape'});
        await finishBeforeEscape();

        expect(model.items).toEqual([]);
        expect(focusedIds).toEqual([]);

        model.select(firstId);

        const finishBeforeClick = holdRowMove();
        model.onListClick({
            currentTarget: otherId,
            path         : [{id: otherId, tagName: 'li', cls: ['neo-list-item']}]
        });
        await finishBeforeClick();

        expect(model.items).toEqual([otherId]);
        expect(focusedIds).toEqual([])
    });

    test('traverses visual rows on Up/Down across uniform 3-column, 2×2 leadCard, and 1-column layouts', async () => {
        // 1. Uniform 3-column grid: card 0 (col 1, row 1) -> Down -> card 3 (col 1, row 2); card 1 (col 2, row 1) -> Down -> card 4 (col 2, row 2)
        const box = (col, row, w=350, h=260, gapX=24, gapY=14) => {
            const left = col * (w + gapX),
                  top  = row * (h + gapY);
            return {x: left, y: top, left, top, right: left + w, bottom: top + h, width: w, height: h}
        };

        const threeCol = await createMountedList({
            rectsByRecordId: {
                'workstation'  : box(0, 0),
                'grid-big-data': box(1, 0),
                'sprint-board' : box(2, 0),
                'garden-gantt' : box(0, 1),
                'calendar-main': box(1, 1),
                'portal-self'  : box(2, 1),
                'helix-list'   : box(0, 2)
            }
        });
        const idOf = (ctx, key) => ctx.list.getItemId(ctx.list.getRecordId(ctx.store.get(key)));

        threeCol.model.select(idOf(threeCol, 'grid-big-data'));
        await threeCol.model.onKeyDownDown({path: [{id: idOf(threeCol, 'grid-big-data'), cls: ['neo-list-item']}]});
        expect(threeCol.model.items).toEqual([idOf(threeCol, 'calendar-main')]);
        expect(threeCol.focusedIds.at(-1)).toBe(idOf(threeCol, 'calendar-main'));

        await threeCol.model.onKeyDownUp({path: [{id: idOf(threeCol, 'calendar-main'), cls: ['neo-list-item']}]});
        expect(threeCol.model.items).toEqual([idOf(threeCol, 'grid-big-data')]);

        threeCol.list.destroy();
        threeCol.store.destroy();

        // 2. Featured 2×2 leadCard grid: workstation spans cols 0..1 & rows 0..1; grid-big-data is (col 2, row 0); sprint-board is (col 2, row 1);
        // garden-gantt is (col 0, row 2); calendar-main is (col 1, row 2); portal-self is (col 2, row 2).
        const leadGrid = await createMountedList({
            rectsByRecordId: {
                'workstation'  : {x: 0, y: 0, left: 0, top: 0, right: 724, bottom: 534, width: 724, height: 534},
                'grid-big-data': box(2, 0),
                'sprint-board' : box(2, 1),
                'garden-gantt' : box(0, 2),
                'calendar-main': box(1, 2),
                'portal-self'  : box(2, 2),
                'helix-list'   : box(0, 3)
            }
        });

        // Down from 2×2 workstation lands on row 2 col 0 (garden-gantt)
        leadGrid.model.select(idOf(leadGrid, 'workstation'));
        await leadGrid.model.onKeyDownDown({path: [{id: idOf(leadGrid, 'workstation'), cls: ['neo-list-item']}]});
        expect(leadGrid.model.items).toEqual([idOf(leadGrid, 'garden-gantt')]);

        // Up from calendar-main (col 1, row 2) returns to 2×2 workstation spanning cols 0..1
        leadGrid.model.select(idOf(leadGrid, 'calendar-main'));
        await leadGrid.model.onKeyDownUp({path: [{id: idOf(leadGrid, 'calendar-main'), cls: ['neo-list-item']}]});
        expect(leadGrid.model.items).toEqual([idOf(leadGrid, 'workstation')]);

        // Down from grid-big-data (col 2, row 0) lands on sprint-board (col 2, row 1), NOT portal-self
        leadGrid.model.select(idOf(leadGrid, 'grid-big-data'));
        await leadGrid.model.onKeyDownDown({path: [{id: idOf(leadGrid, 'grid-big-data'), cls: ['neo-list-item']}]});
        expect(leadGrid.model.items).toEqual([idOf(leadGrid, 'sprint-board')]);

        leadGrid.list.destroy();
        leadGrid.store.destroy();

        // 3. Single-column grid (900 px sidebar / 390 px phone): Down steps +1
        const oneCol = await createMountedList({
            rectsByRecordId: {
                'workstation'  : box(0, 0, 560),
                'grid-big-data': box(0, 1, 560),
                'sprint-board' : box(0, 2, 560)
            }
        });
        oneCol.model.select(idOf(oneCol, 'workstation'));
        await oneCol.model.onKeyDownDown({path: [{id: idOf(oneCol, 'workstation'), cls: ['neo-list-item']}]});
        expect(oneCol.model.items).toEqual([idOf(oneCol, 'grid-big-data')])
    });

    test('past the last or first row the card stays and the owner gets leaveRow with its span; enterRow() enters the facing row', async () => {
        const box = (col, row, w=350, h=260) => {
            const left = col * (w + 24),
                  top  = row * (h + 14);
            return {x: left, y: top, left, top, right: left + w, bottom: top + h, width: w, height: h}
        };

        // Two rows: three cards above, two below — the second row ends short, as a section's last row does
        const {focusedIds, list, model, store} = await createMountedList({
                  rectsByRecordId: {
                      'workstation'  : box(0, 0),
                      'grid-big-data': box(1, 0),
                      'sprint-board' : box(2, 0),
                      'garden-gantt' : box(0, 1),
                      'calendar-main': box(1, 1)
                  }
              }),
              idOf   = key => list.getItemId(list.getRecordId(store.get(key))),
              leaves = [];

        // The two records without a box measure zero-sized and take no part, like cards outside the layout
        list.on('leaveRow', data => leaves.push(data));

        // ArrowDown on the bottom row keeps the card and hands the step on, with the card's horizontal span
        model.select(idOf('calendar-main'));
        await model.onKeyDownDown({path: [{id: idOf('calendar-main'), cls: ['neo-list-item']}]});

        expect(model.items).toEqual([idOf('calendar-main')]);
        expect(leaves).toHaveLength(1);
        expect(leaves[0]).toMatchObject({direction: 1, left: 374, right: 724, source: list.id});

        // ArrowUp on the top row does the same in the other direction; a step inside the list hands nothing on
        model.select(idOf('sprint-board'));
        await model.onKeyDownUp({path: [{id: idOf('sprint-board'), cls: ['neo-list-item']}]});
        expect(leaves.at(-1)).toMatchObject({direction: -1, left: 748, right: 1098});

        await model.onKeyDownDown({path: [{id: idOf('sprint-board'), cls: ['neo-list-item']}]});
        expect(leaves).toHaveLength(2);

        // Entering from above takes the top row's card under the leaving span; from below, the bottom row's
        model.deselectAll();
        focusedIds.length = 0;
        await model.enterRow(1, {left: 748, right: 1098});
        expect(model.items).toEqual([idOf('sprint-board')]);
        expect(focusedIds).toEqual([idOf('sprint-board')]);

        // The bottom row has no card under x 748..1098, so the nearest one by center takes it
        await model.enterRow(-1, {left: 748, right: 1098});
        expect(model.items).toEqual([idOf('calendar-main')]);

        await model.enterRow(-1, {left: 0, right: 350});
        expect(model.items).toEqual([idOf('garden-gantt')])
    })
});
