import {test, expect} from '@playwright/test';

/**
 * The live conserved-pair preview contract — rendered tier, real pointer.
 *
 * Drives an actual drag against real projected geometry: both panes must track the pointer
 * complementarily DURING the gesture (pair total constant, no proxy), the committed document must
 * equal the final previewed geometry exactly (terminal parity — no jump), Escape must restore the
 * exact pre-drag layout with zero commit, and the `liveResize: false` opt-out must keep panes
 * static mid-gesture while the pointer-delta terminal still commits. The worker-tier math lives in
 * `test/playwright/unit/dashboard/DockSplitterLivePreview.spec.mjs`; heavy-content journeys ride
 * the external whitebox battery.
 */

let containerId;

const DOC = {
    schema: 'neo.dock.zone.v1',
    root  : 'split-1',
    items : {
        alpha: {componentRef: 'alpha', title: 'Alpha'},
        beta : {componentRef: 'beta',  title: 'Beta'}
    },
    nodes: {
        'split-1': {type: 'split', orientation: 'horizontal', children: ['zone-a', 'zone-b'], sizes: [0.5, 0.5]},
        'zone-a' : {type: 'tabs', items: ['alpha'], activeItemId: 'alpha'},
        'zone-b' : {type: 'tabs', items: ['beta'],  activeItemId: 'beta'}
    }
};

const mount = async (page, splitterConfig = {}, containerConfig = {}) => {
    const result = await page.evaluate(async ({doc, cfg, box}) => {
        const container = await Neo.worker.App.createNeoInstance({
            importPath: '../dashboard/dock/projection/LayoutAdapter.mjs',
            ntype     : 'container',
            height    : 300,
            layout    : {ntype: 'hbox', align: 'stretch'},
            parentId  : 'dock-splitter-test-viewport',
            width     : 606,
            ...box,
            items     : [
                {ntype: 'component', id: 'lp-a', flex: 1, style: {background: '#223'}},
                {
                    ntype        : 'dashboard-dock-splitter',
                    id           : 'lp-s',
                    boundaryIndex: 0,
                    // the adapter stamps projected splitters out of the split-children set at
                    // projection time; the fixture mirrors that construct-time reality (a late
                    // stamp would leave the eager zone registration self-countered — the class
                    // guard turns that into no-preview rather than a frozen one)
                    dockNodeType    : 'splitter',
                    dockZoneDocument: doc,
                    orientation     : 'horizontal',
                    splitNodeId     : 'split-1',
                    ...cfg
                },
                {ntype: 'component', id: 'lp-b', flex: 1, style: {background: '#232'}}
            ]
        });

        if (!container.success) throw new Error(`container: ${container.error.message}`);

        return {containerId: container.id}
    }, {doc: DOC, cfg: splitterConfig, box: containerConfig});

    await page.waitForSelector('#lp-s', {state: 'attached'});
    return result
};

// worker getConfigs returns POSITIONAL values for array keys — zip them into a keyed map
const getConfigs = async (page, id, keys) => {
    const values = await page.evaluate(
        ({id, keys}) => Neo.worker.App.getConfigs({id, keys}), {id, keys});
    return Object.fromEntries(keys.map((key, index) => [key, values[index]]))
};

const rects = async page => ({
    a: await page.locator('#lp-a').boundingBox(),
    b: await page.locator('#lp-b').boundingBox()
});

// the Mouse sensor arms a drag only after delay(100ms) AND minDistance(5px) — a drive that moves
// inside that window ends before the gesture officially starts and no drag:move ever fires
const armDrag = async (page, cx, cy) => {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(130)
};

test.describe('Neo.dashboard.dock.interaction.DockSplitter — live pair preview, real pointer', () => {
    test.setTimeout(60000);
    test.use({viewport: {height: 800, width: 1200}});

    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/dock-splitter/index.html');
        await page.waitForSelector('#dock-splitter-test-viewport', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        containerId && await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), containerId);
        containerId = null
    });

    test('both panes track the pointer complementarily; the commit equals the final preview', async ({page}) => {
        ({containerId} = await mount(page));

        const start = await rects(page),
              total = start.a.width + start.b.width,
              box   = await page.locator('#lp-s').boundingBox(),
              cx    = box.x + box.width / 2,
              cy    = box.y + box.height / 2;

        await armDrag(page, cx, cy);
        await page.mouse.move(cx + 40, cy, {steps: 8});

        // mid-gesture: live complementary geometry, conserved total, no proxy element — and the
        // committed document stays byte-identical while pointer frames run (no worker traffic)
        const mid = await rects(page);
        expect(mid.a.width).toBeGreaterThan(start.a.width + 30);
        expect(mid.a.width + mid.b.width).toBeCloseTo(total, 0);
        expect(await page.locator('.neo-dragproxy').count()).toBe(0);
        expect((await getConfigs(page, 'lp-s', ['dockZoneDocument'])).dockZoneDocument.nodes['split-1'].sizes)
            .toEqual([0.5, 0.5]);

        await page.mouse.up();

        // terminal parity: the committed fractions equal the final previewed pair exactly
        await expect.poll(async () =>
            (await getConfigs(page, 'lp-s', ['dockZoneDocument'])).dockZoneDocument.nodes['split-1'].sizes[0]
        ).toBeCloseTo(mid.a.width / (mid.a.width + mid.b.width), 3);

        // retained pixels: release does not jump the panes away from the last preview
        const end = await rects(page);
        expect(Math.abs(end.a.width - mid.a.width)).toBeLessThanOrEqual(1.5);
        expect(end.a.width + end.b.width).toBeCloseTo(total, 0)
    });

    test('the vertical axis mirrors the contract: stacked panes track complementarily and commit exact heights', async ({page}) => {
        ({containerId} = await mount(page, {orientation: 'vertical'}, {
            height: 606,
            layout: {ntype: 'vbox', align: 'stretch'},
            width : 300
        }));

        const start = await rects(page),
              total = start.a.height + start.b.height,
              box   = await page.locator('#lp-s').boundingBox(),
              cx    = box.x + box.width / 2,
              cy    = box.y + box.height / 2;

        await armDrag(page, cx, cy);
        await page.mouse.move(cx, cy + 40, {steps: 8});

        const mid = await rects(page);
        expect(mid.a.height).toBeGreaterThan(start.a.height + 30);
        expect(mid.a.height + mid.b.height).toBeCloseTo(total, 0);

        await page.mouse.up();

        await expect.poll(async () =>
            (await getConfigs(page, 'lp-s', ['dockZoneDocument'])).dockZoneDocument.nodes['split-1'].sizes[0]
        ).toBeCloseTo(mid.a.height / (mid.a.height + mid.b.height), 3)
    });

    test('Escape mid-gesture restores the exact pre-drag layout and commits nothing', async ({page}) => {
        ({containerId} = await mount(page));

        const start = await rects(page),
              box   = await page.locator('#lp-s').boundingBox(),
              cx    = box.x + box.width / 2,
              cy    = box.y + box.height / 2;

        await armDrag(page, cx, cy);
        await page.mouse.move(cx + 50, cy, {steps: 8});

        expect((await rects(page)).a.width).toBeGreaterThan(start.a.width + 40);

        await page.keyboard.press('Escape');

        await expect.poll(async () => (await rects(page)).a.width).toBeCloseTo(start.a.width, 0);

        const after = await rects(page);
        expect(after.b.width).toBeCloseTo(start.b.width, 0);

        const doc = (await getConfigs(page, 'lp-s', ['dockZoneDocument'])).dockZoneDocument;
        expect(doc.nodes['split-1'].sizes).toEqual([0.5, 0.5]);

        await page.mouse.up()
    });

    test('liveResize: false keeps panes static mid-gesture; the pointer-delta terminal still commits', async ({page}) => {
        ({containerId} = await mount(page, {liveResize: false}));

        const start = await rects(page),
              box   = await page.locator('#lp-s').boundingBox(),
              cx    = box.x + box.width / 2,
              cy    = box.y + box.height / 2;

        await armDrag(page, cx, cy);
        await page.mouse.move(cx + 40, cy, {steps: 8});

        // deferred presentation: the committed geometry does not move under the pointer
        const mid = await rects(page);
        expect(mid.a.width).toBeCloseTo(start.a.width, 0);

        await page.mouse.up();

        await expect.poll(async () =>
            (await getConfigs(page, 'lp-s', ['dockZoneDocument'])).dockZoneDocument.nodes['split-1'].sizes[0]
        ).toBeGreaterThan(0.5)
    });
});
