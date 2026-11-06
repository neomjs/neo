import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `Neo.canvas.GraphScene` drawing a real WebGL2 scene on the canvas worker, read through the example's
 * stats: a scene draws on arrival and nothing while idle, a drag orbits, the drawing buffer follows the device
 * pixel ratio, labels follow their nodes, a fly-to centres its node, the wheel brings the near look's names and
 * floor, a lost context comes back with its scene and its labels, and a resize keeps it.
 *
 * Fixture: `examples/component/graphScene`, whose demo scene of 240 nodes has 458 edges, one path, a label on each
 * of the path's 20 nodes, and a name, its index, on every node; its renderer's near look has a 6 px floor.
 */
const
    EXAMPLE = '/examples/component/graphScene/index.html',
    SCENE   = {nodes: 240, edges: 458, paths: 1};

let reads = 0;

/**
 * @summary Clicks "Read stats" and waits for that read's JSON on the stats line.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
async function readStats(page) {
    const read  = ++reads;
    let   stats = null;

    await page.getByRole('button', {name: 'Read stats'}).click();
    await expect.poll(async () => {
        stats = JSON.parse(await page.locator('.graph-scene-stats').getAttribute('data-stats') || 'null');
        return stats?.read
    }, {message: `stats read ${read} lands`}).toBe(read);

    return stats
}

/**
 * @summary Reads the stats until they satisfy a predicate.
 * @param {import('@playwright/test').Page} page
 * @param {Function} predicate
 * @param {String} message
 * @returns {Promise<Object>}
 */
async function statsWhen(page, predicate, message) {
    let stats = null;

    await expect.poll(async () => predicate(stats = await readStats(page)), {message, timeout: 10000}).toBe(true);

    return stats
}

/**
 * @summary Waits for the demo scene drawn into a buffer of the canvas's CSS size at a pixel ratio of 2, with no
 * frame owed. Boot draws the scene before the first resize report lands, and the report resizes the buffer before
 * the frame it owes draws, so until `owed` clears a read pairs the new buffer with the boot frame's drawing.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
async function sizedSceneDrawn(page) {
    const
        box  = await page.locator('canvas').boundingBox(),
        size = [Math.floor(box.width * 2), Math.floor(box.height * 2)];

    return statsWhen(page, stats => stats.frames > 0 && !stats.owed && stats.counts?.nodes === SCENE.nodes &&
        stats.canvas?.[0] === size[0] && stats.canvas?.[1] === size[1], 'the demo scene is drawn at the CSS size times the ratio')
}

test.describe('Neo.canvas.GraphScene — a WebGL2 scene on the canvas worker', () => {
    test.use({deviceScaleFactor: 2, viewport: {width: 1000, height: 700}});

    test.beforeEach(async ({page}) => {
        reads = 0;
        await page.goto(EXAMPLE);
        await expect(page.locator('canvas')).toBeVisible({timeout: 30000})
    });

    test('a scene draws on arrival and nothing while idle; a drag orbits; the buffer is the size times the ratio', async ({page}) => {
        let drawn = await sizedSceneDrawn(page);

        // boot can still reach the renderer after its first sized frame, so a frame with nothing changed can land in
        // the idle second: it is timed from two reads that agree
        await expect.poll(async () => {
            const previous = drawn.frames;

            drawn = await readStats(page);
            return drawn.frames === previous
        }, {message: 'the boot frames settle', timeout: 10000}).toBe(true);

        expect(drawn.counts).toEqual(SCENE);
        expect(drawn.contextLost).toBe(false);

        const box = await page.locator('canvas').boundingBox();

        expect(drawn.canvas, 'the drawing buffer is the CSS size at a pixel ratio of 2').toEqual([Math.floor(box.width * 2), Math.floor(box.height * 2)]);

        // wall-clock-under-test: frames are owed to changes, never to a clock, so a second passes with none
        await page.waitForTimeout(1000);

        const idle = await readStats(page);

        expect(idle.frames, 'an idle second draws nothing').toBe(drawn.frames);

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 30, {steps: 8});
        await page.mouse.up();

        const orbited = await statsWhen(page, stats => stats.frames > idle.frames, 'the drag draws');

        expect(orbited.camera.touched).toBe(true);
        expect(orbited.camera.yaw).not.toBe(idle.camera.yaw)
    });

    test('labels draw at their nodes and follow an orbit; a fly-to lands its node at the centre', async ({page}) => {
        const drawn = await sizedSceneDrawn(page);

        expect(drawn.labels.count, 'every twelfth node is labelled').toBe(20);
        expect(drawn.uploaded.labels, 'their texts are uploaded once, as one atlas').toBe(20);
        expect(drawn.labels.drawn.length, 'the frame places some of them').toBeGreaterThan(0);
        expect(drawn.labels.drawn.length, 'never more than a frame draws').toBeLessThanOrEqual(30);

        const box = await page.locator('canvas').boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 30, {steps: 8});
        await page.mouse.up();

        const
            orbited = await statsWhen(page, stats => stats.frames > drawn.frames && stats.camera.touched, 'the drag draws'),
            before  = new Map(drawn.labels.drawn.map(label => [label.index, label])),
            moved   = orbited.labels.drawn.filter(({index, x, y}) => before.has(index) && Math.hypot(x - before.get(index).x, y - before.get(index).y) > 1);

        expect(moved.length, 'the labels move with their nodes').toBeGreaterThan(0);

        await page.getByRole('button', {name: 'Fly to #120'}).click();

        const
            landed = await statsWhen(page, stats => !stats.flying && stats.labels.drawn.some(label => label.index === 120), 'the flight lands with #120 drawn'),
            label  = landed.labels.drawn.find(({index}) => index === 120);

        expect(label.text).toBe('#120');
        expect(label.x, 'the node flown to sits at the centre').toBeCloseTo(box.width / 2, 0);
        expect(label.y).toBeCloseTo(box.height / 2, 0)
    });

    test('the wheel brings the near look: the nodes nearest the target are named once each, beside the labels, over the floor', async ({page}) => {
        const drawn = await sizedSceneDrawn(page);

        expect(drawn.near, 'the fitted overview shows none of it').toEqual({floor: 0, share: 0});
        expect(drawn.names, 'and has drawn no name').toBeNull();

        const box = await page.locator('canvas').boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        // to the nearest the zoom allows, half the fitted distance, which is closer than near: Chromium delivers about
        // half of a turn's delta, so three turns arrive with room to spare
        for (let turn = 0; turn < 3; turn++) {
            await page.mouse.wheel(0, -600)
        }

        const
            near  = await statsWhen(page, stats => stats.near.share === 1 && stats.names?.resident > 0, 'the wheel brings the near look'),
            names = near.labels.drawn.filter(({index}) => index % 12 !== 0);

        expect(near.near.floor, 'the 6 px floor at a pixel ratio of 2').toBe(12);
        expect(names.length, 'the frame names nodes the scene does not label').toBeGreaterThan(0);
        expect(names.every(({index, text}) => text === `#${index}`), 'each by its own name').toBe(true);
        expect(new Set(near.labels.drawn.map(({index}) => index)).size, 'no node is named twice').toBe(near.labels.drawn.length);
        expect(near.labels.drawn.length, 'within what a frame draws').toBeLessThanOrEqual(30);
        expect(near.names.resident, 'every name drawn is in the atlas, which holds no more than its cells').toBeLessThanOrEqual(near.names.cells)
    });

    test('a lost context comes back with its scene, and a resize keeps it', async ({page}) => {
        const drawn = await sizedSceneDrawn(page);

        await page.getByRole('button', {name: 'Lose context'}).click();

        const lost = await statsWhen(page, stats => stats.contextLost, 'the context is lost');

        expect(lost.counts, 'the scene waits for the restore').toEqual(SCENE);
        expect(lost.uploaded, 'its GPU objects died with the context').toBeNull();

        await page.getByRole('button', {name: 'Restore context'}).click();

        const restored = await statsWhen(page, stats => !stats.contextLost && stats.restores === 1 && stats.frames > lost.frames, 'the restored context draws');

        expect(restored.counts).toEqual(SCENE);
        expect(restored.uploaded, 'the kept scene is uploaded to the new context').toMatchObject(SCENE);
        expect(restored.canvas, 'the restore sizes the new buffer as before').toEqual(drawn.canvas);
        expect(restored.uploaded.labels, 'the label atlas is drawn again for the new context').toBe(20);
        expect(restored.labels.drawn.length, 'and the labels draw').toBeGreaterThan(0);

        await page.setViewportSize({width: 700, height: 500});

        const resized = await statsWhen(page, stats => stats.canvas[0] < drawn.canvas[0] && stats.frames > restored.frames, 'the resize draws a smaller buffer');

        expect(resized.canvas[1], 'and a shorter one').toBeLessThan(drawn.canvas[1]);
        expect(resized.counts, 'a resize keeps the scene').toEqual(SCENE)
    })
});
