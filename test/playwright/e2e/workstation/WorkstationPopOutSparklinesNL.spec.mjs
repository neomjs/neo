import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness: the sparkline cells of a popped-out grid follow the grid into the
 * popup window and draw there.
 *
 * Measured against the running Workstation before the fix: the Feed pane — a `grid.Container` with a
 * `sparkline` column — moved into a real popup as the same instance, every descendant in the items
 * tree took the popup's `windowId`, and every sparkline canvas that travelled with the grid went
 * blank. A grid row is a component, not a container, so the `windowId` cascade never reached the
 * cell components a row pools; the travelled canvases kept the opener's id, re-transferred their
 * nodes to the opener's main thread on remount, and never registered again. The cells the grid
 * created after the hop were stamped with the popup's id at creation and drew at once — which is why
 * this arm reads the cells that existed BEFORE the gesture, not only the ones present after it.
 *
 * Read through the Neural Link, not the DOM: a blank canvas and a drawn one are the same element to
 * a locator. `offscreenRegistered` is the App Worker's own record that the canvas worker owns the
 * node in the window the component believes it is in.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> NEO_E2E_PORT=8152 \
 *      npx playwright test workstation/WorkstationPopOutSparklinesNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 *
 * The runtime root is not optional: `playwright.config.e2e.mjs` ignores every neuralLink-fixture
 * spec without it, so the command selects ZERO tests and reports success.
 */
const
    ACTION     = '.neo-toolbar-action',
    FEED_TITLE = 'Live Event Stream', // the Feed pane's tab title in the Workstation's boot document
    HEADER     = '.neo-tab-header-toolbar',
    POP_OUT    = 'window-restore',
    SPARKLINE  = 'Neo.component.Sparkline',
    TAB        = '.neo-tab-header-button';

/** One record per live sparkline, in the shape the fixture returns for either wrapper. */
const readSparklines = async app => {
    const records = await app.findInstances({className: SPARKLINE}, ['id', 'windowId', 'offscreenRegistered', 'mounted']);

    return (Array.isArray(records) ? records : [records]).filter(Boolean).map(record => record.properties ?? record)
};

/**
 * Clicks a pane's tab by its title, which is how a user gives that pane focus, and returns the tab
 * header toolbar that carries it — the surface the focus-gated action set renders into.
 */
const focusPane = async (page, title) => {
    const header = page.locator(HEADER).filter({has: page.locator(TAB, {hasText: title})}).first();

    await expect(header, `${title} must have a projected tab header`).toBeVisible({timeout: 30000});
    await header.locator(TAB, {hasText: title}).first().click();

    return header
};

test.describe('Workstation pop-out — sparkline cells follow the grid into the popup (Neural Link)', () => {
    test.setTimeout(120000);
    test.use({viewport: {width: 1600, height: 900}});

    test('every sparkline that travelled with the Feed pane registers under the popup windowId and draws', async ({page, context, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host',            {timeout: 60000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});

        // A window's id lives on the main thread's worker manager, the same place `Main.mjs` reads
        // it from when it hands a popup its native route.
        const app      = await neuralLink.connectToApp('Workstation'),
              openerId = await page.evaluate(() => Neo.worker.Manager.windowId);

        expect(openerId, 'the opener knows its own window id').toBeTruthy();

        // The cells that exist BEFORE the gesture are the ones the defect blanked; record them.
        const header = await focusPane(page, FEED_TITLE);

        await expect.poll(async () => (await readSparklines(app)).filter(cell => cell.windowId === openerId && cell.offscreenRegistered).length,
            {message: 'the Feed pane draws its sparklines in the opener before the gesture', timeout: 15000}).toBeGreaterThan(0);

        const travelling = (await readSparklines(app)).filter(cell => cell.windowId === openerId).map(cell => cell.id),
              popOut     = header.locator(`${ACTION}:has(span[class*="${POP_OUT}"])`).first();

        await expect(popOut, 'the Feed pane offers the pop-out action').toBeVisible({timeout: 10000});

        // Subscribed before the click: the vessel can open faster than the next await.
        const vesselPromise = context.waitForEvent('page', {timeout: 45000});

        await popOut.click();

        const vessel = await vesselPromise;

        await vessel.waitForLoadState('domcontentloaded');
        await vessel.waitForSelector('canvas', {timeout: 45000});

        const popupId   = await vessel.evaluate(() => Neo.worker.Manager.windowId),
              inVessel  = new Set(await vessel.evaluate(() => [...document.querySelectorAll('canvas')].map(canvas => canvas.id))),
              travelled = travelling.filter(id => inVessel.has(id));

        expect(popupId, 'the vessel is its own window').not.toBe(openerId);
        expect(travelled.length, 'at least one pre-existing sparkline cell travelled into the vessel').toBeGreaterThan(0);

        // The witness: a canvas that travelled belongs to the popup's window in the App Worker's
        // own record and has re-registered there. Before the fix every travelled cell kept the
        // opener's id and `offscreenRegistered` stayed false for good.
        await expect.poll(async () => {
            const cells = (await readSparklines(app)).filter(cell => travelled.includes(cell.id));

            return cells.length === travelled.length && cells.every(cell => cell.windowId === popupId && cell.offscreenRegistered === true && cell.mounted === true)
        }, {message: 'every travelled sparkline carries the popup windowId, is mounted and registered', timeout: 10000}).toBe(true);

        // And every canvas the vessel shows, travelled or created after the hop, belongs to it.
        const strangers = (await readSparklines(app)).filter(cell => inVessel.has(cell.id) && cell.windowId !== popupId);

        expect(strangers, 'no canvas in the vessel still believes it is in the opener').toEqual([]);

        await vessel.close({runBeforeUnload: true})
    })
});
