import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `Neo.canvas.GraphScene` drawing a real WebGL2 scene on the canvas worker, read through the example's
 * stats: a scene draws on arrival and nothing while idle, a drag orbits, the drawing buffer follows the device
 * pixel ratio, a lost context comes back with its scene, and a resize keeps it.
 *
 * Fixture: `examples/component/graphScene`, whose demo scene of 240 nodes has 458 edges and one path.
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
    const read = ++reads;
    let stats  = null;

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

test.describe('Neo.canvas.GraphScene — a WebGL2 scene on the canvas worker', () => {
    test.use({deviceScaleFactor: 2, viewport: {width: 1000, height: 700}});

    test.beforeEach(async ({page}) => {
        reads = 0;
        await page.goto(EXAMPLE);
        await expect(page.locator('canvas')).toBeVisible({timeout: 30000})
    });

    test('a scene draws on arrival and nothing while idle; a drag orbits; the buffer is the size times the ratio', async ({page}) => {
        let drawn = await statsWhen(page, stats => stats.frames > 0 && stats.counts?.nodes === SCENE.nodes, 'the demo scene is drawn');

        // boot may still owe a frame (the first resize report lands after the scene): the idle second is
        // timed from two reads that agree
        await expect.poll(async () => {
            const previous = drawn.frames;

            drawn = await readStats(page);
            return drawn.frames === previous
        }, {message: 'the boot frames settle', timeout: 10000}).toBe(true);

        expect(drawn.counts).toEqual(SCENE);
        expect(drawn.contextLost).toBe(false);

        const box = await page.locator('canvas').boundingBox();

        expect(drawn.canvas, 'the drawing buffer is the CSS size at a pixel ratio of 2').toEqual([Math.floor(box.width * 2), Math.floor(box.height * 2)]);

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

    test('a lost context comes back with its scene, and a resize keeps it', async ({page}) => {
        const drawn = await statsWhen(page, stats => stats.frames > 0 && stats.counts?.nodes === SCENE.nodes, 'the demo scene is drawn');

        await page.getByRole('button', {name: 'Lose context'}).click();

        const lost = await statsWhen(page, stats => stats.contextLost, 'the context is lost');

        expect(lost.counts, 'the scene waits for the restore').toEqual(SCENE);
        expect(lost.uploaded, 'its GPU objects died with the context').toBeNull();

        await page.getByRole('button', {name: 'Restore context'}).click();

        const restored = await statsWhen(page, stats => !stats.contextLost && stats.restores === 1 && stats.frames > lost.frames, 'the restored context draws');

        expect(restored.counts).toEqual(SCENE);
        expect(restored.uploaded, 'the kept scene is uploaded to the new context').toMatchObject(SCENE);
        expect(restored.canvas, 'the restore sizes the new buffer as before').toEqual(drawn.canvas);

        await page.setViewportSize({width: 700, height: 500});

        const resized = await statsWhen(page, stats => stats.canvas[0] < drawn.canvas[0] && stats.frames > restored.frames, 'the resize draws a smaller buffer');

        expect(resized.canvas[1], 'and a shorter one').toBeLessThan(drawn.canvas[1]);
        expect(resized.counts, 'a resize keeps the scene').toEqual(SCENE)
    })
});
