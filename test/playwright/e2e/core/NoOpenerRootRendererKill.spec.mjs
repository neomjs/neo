import {expect, test} from '../../fixtures.mjs';

/**
 * @summary A second root of a canvas-drawing SharedWorker app, opened with no opener, must not terminate
 * the FIRST root's renderer — the variable is the opener, not the second root.
 *
 * A window opened through `window.open` joins its opener's renderer process, while an unrelated
 * same-origin tab gets its own. When every root handed its DOM canvas to one shared canvas worker, a
 * second process's canvas was painted by a worker hosted in the FIRST process. That fails Chromium's
 * frame-sink client check and terminates the host — root A, not the tab that owns the foreign canvas.
 * A root without a live opener now gets its own canvas group, and with it its own canvas worker.
 *
 * The subject is `apps/portal` rather than the workstation app: it declares `useCanvasWorker` and
 * `useSharedWorkers` and draws canvases, which is the affected configuration, and it inherits no
 * animated offscreen work, so unlike the workstation app it runs on a hosted runner.
 *
 * Survival is necessary, not sufficient: `CanvasGroupPainting.spec.mjs` holds that both roots keep
 * painting. The controls boot identically, so a failure here names the second root, not the boot.
 */
const
    APP      = '/apps/portal/index.html',
    SETTLE   = 8000,
    VIEWPORT = '.neo-viewport';

/**
 * Records a renderer termination without letting it throw from whichever call observes it first: the
 * crash must fail an assertion that names it, not a timeout that happens to be in flight.
 * @param {Object} page
 * @returns {Function} Answers whether the renderer has died
 */
const watchCrash = page => {
    let crashed = false;

    page.on('crash', () => {crashed = true});

    return () => crashed
};

/**
 * @param {Object} page
 * @returns {Promise<Object|null>} null once the renderer can no longer answer
 */
const readConfig = page => page.evaluate(() => ({
    canvases  : document.querySelectorAll('canvas').length,
    canvasFlag: globalThis.Neo?.config?.useCanvasWorker === true,
    shared    : globalThis.Neo?.config?.useSharedWorkers === true
})).catch(() => null);

/**
 * Readiness is the canvas count, never a clock: a root with no canvas transferred nothing, so it
 * cannot be the subject of this measurement.
 * @param {Object} page
 * @returns {Promise<Object|null>}
 */
const boot = async page => {
    await page.goto(APP);
    await page.locator(VIEWPORT).first().waitFor({state: 'attached', timeout: 60000});
    await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0, null, {timeout: 60000});
    return readConfig(page)
};

/**
 * @param {Object} page
 * @param {String} arm
 * @returns {Promise<Object>}
 */
const bootRootA = async (page, arm) => {
    const booted = await boot(page);

    expect(booted,            `${arm}: root A must boot`).not.toBeNull();
    expect(booted.shared,     `${arm}: the subject app must run on a SharedWorker`).toBe(true);
    expect(booted.canvasFlag, `${arm}: the subject app must run a canvas worker`).toBe(true);
    expect(booted.canvases,   `${arm}: root A must actually draw canvases`).toBeGreaterThan(0);

    return booted
};

test.describe('A second root of a canvas SharedWorker app never kills the first root', () => {
    test.setTimeout(180000);

    test('control: root A alone survives the window the no-opener arm measures', async ({page}) => {
        const died = watchCrash(page);

        await bootRootA(page, 'control');
        await page.waitForTimeout(SETTLE).catch(() => {}); // wall-clock-under-test: the kill is time-ordered, ~0.4s into a second root's boot

        expect(died(), 'root A must survive with no second root at all').toBe(false);
        expect(await readConfig(page), 'root A must still answer').not.toBeNull()
    });

    test('control: a root that shares root A\'s renderer process does not kill it', async ({page, context}) => {
        const died = watchCrash(page);

        await bootRootA(page, 'opener');

        const opened = context.waitForEvent('page');

        await page.evaluate(app => window.open(app, '_blank'), APP);

        const rootB = await opened;

        await rootB.locator(VIEWPORT).first().waitFor({state: 'attached', timeout: 60000});
        await page.waitForTimeout(SETTLE).catch(() => {}); // wall-clock-under-test: the same window the no-opener arm dies in

        expect(died(), 'root A must survive a root opened from it').toBe(false);
        expect(await readConfig(page), 'root A must still answer').not.toBeNull()
    });

    test('a root with no opener leaves root A alive', async ({page, context}) => {
        const died = watchCrash(page);

        await bootRootA(page, 'no-opener');

        const rootB = await context.newPage();

        await boot(rootB);
        await page.waitForTimeout(SETTLE).catch(() => {}); // wall-clock-under-test: the kill lands ~0.4s in, and root A is gone within 4.7s

        expect(died(), 'root A must survive a second root that owns its own renderer process').toBe(false)
    })
});
