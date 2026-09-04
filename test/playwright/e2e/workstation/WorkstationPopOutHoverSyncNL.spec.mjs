import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness: a scroll inside a popped-out grid suspends and resumes hover sync
 * in the popup's window, and the opener's addon is never told.
 *
 * A remote method call to a main-thread addon is routed on the payload's `windowId`; without one the
 * App Worker falls back to the first connected port, which after a pop-out is the opener. The grid's
 * scroll manager resolved the hover-sync addon for its own window but called it without the key, so
 * a scroll in the popup reached the opener's addon — which holds no registration for that grid —
 * while the popup's addon, which does, heard nothing. In one window the misroute is invisible
 * beyond a deprecation warning; two windows make it observable, which is what this arm does. The
 * warning is App Worker console output, which the Neural Link session forwards, so the arm also reads
 * its count for the addon before and after the judged scroll.
 *
 * The addon keeps no "suspended" flag to ask about, so the arm counts the two calls where they land:
 * the main-thread addon instance in each window has its `suspendHover` / `resumeHover` wrapped with a
 * counter before the popup grid is scrolled. Nothing else is patched, and the wrappers call through.
 *
 * Runs in Playwright's default headless mode of the local Chrome channel the e2e config selects; no
 * `--headed` is passed. The popup is a real second window either way.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> NEO_E2E_PORT=8153 \
 *      npx playwright test workstation/WorkstationPopOutHoverSyncNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 *
 * The runtime root is not optional: `playwright.config.e2e.mjs` ignores every neuralLink-fixture
 * spec without it, so the command selects ZERO tests and reports success.
 */
const
    ACTION     = '.neo-toolbar-action',
    ADDON      = 'GridRowHoverSync',
    FEED_TITLE = 'Live Event Stream', // the Feed pane's tab title in the Workstation's boot document
    HEADER     = '.neo-tab-header-toolbar',
    POP_OUT    = 'window-restore',
    TAB        = '.neo-tab-header-button',
    VIEW       = '.neo-grid-view',
    WARNING    = 'destination "main" is deprecated'; // worker/Base#sendMessage, on a call it routes to the first port

/**
 * Wraps the window's hover-sync addon so every suspend and resume it receives is counted; the
 * wrappers call through, so the addon's behaviour is unchanged. Returns whether the addon existed.
 */
const countAddonCalls = (page, addonName) => page.evaluate(name => {
    const addon = Neo.main?.addon?.[name];

    if (!addon) {
        return false
    }

    addon.__hoverSyncCalls = [];

    ['resumeHover', 'suspendHover'].forEach(method => {
        const original = addon[method].bind(addon);

        addon[method] = payload => {
            addon.__hoverSyncCalls.push(method);
            return original(payload)
        }
    });

    return true
}, addonName);

const readAddonCalls = (page, addonName) => page.evaluate(name => Neo.main?.addon?.[name]?.__hoverSyncCalls ?? null, addonName);

/**
 * Counts the worker's deprecated-destination warnings that name the addon: the warning's second
 * argument is the routed payload, stringified, so the addon's class name is in the message.
 */
const countHoverSyncWarnings = async (app, addonName) => {
    const logs = await app.getConsoleLogs('warn', addonName);

    return logs.filter(log => log.message.includes(WARNING)).length
};

/** Clicks a pane's tab by its title and returns the tab header toolbar that carries it. */
const focusPane = async (page, title) => {
    const header = page.locator(HEADER).filter({has: page.locator(TAB, {hasText: title})}).first();

    await expect(header, `${title} must have a projected tab header`).toBeVisible({timeout: 30000});
    await header.locator(TAB, {hasText: title}).first().click();

    return header
};

test.describe('Workstation pop-out — hover sync follows the grid into the popup (Neural Link)', () => {
    test.setTimeout(120000);
    test.use({viewport: {width: 1600, height: 900}});

    test('a scroll in the popped-out Feed grid suspends and resumes hover sync in the popup, and the opener hears nothing', async ({page, context, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host',            {timeout: 60000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});

        const app = await neuralLink.connectToApp('Workstation');

        const header = await focusPane(page, FEED_TITLE),
              popOut = header.locator(`${ACTION}:has(span[class*="${POP_OUT}"])`).first();

        await expect(popOut, 'the Feed pane offers the pop-out action').toBeVisible({timeout: 10000});

        // A main-thread addon is imported into a window the first time the App Worker resolves it
        // for that window (`worker.App#getAddon` → `Main.importAddon`); a grid without locked
        // columns never resolves hover sync at mount, so the opener's addon exists only once a
        // scroll asks for it. One warm-up scroll in the opener loads it, so the opener side of the
        // witness can be counted rather than merely absent.
        const openerView = page.locator(HEADER).filter({has: page.locator(TAB, {hasText: FEED_TITLE})}).locator('xpath=ancestor::*[contains(@class,"neo-dashboard-dock-tabs")][1]').locator(VIEW).first(),
              openerBox  = await openerView.boundingBox();

        expect(openerBox, 'the opener renders the Feed grid view').toBeTruthy();

        await page.mouse.move(openerBox.x + openerBox.width / 2, openerBox.y + openerBox.height / 2);
        await page.mouse.wheel(0, 120);

        await expect.poll(() => page.evaluate(name => !!Neo.main?.addon?.[name], ADDON),
            {message: 'the warm-up scroll imports the hover-sync addon into the opener window', timeout: 15000}).toBe(true);

        // Subscribed before the click: the vessel can open faster than the next await.
        const vesselPromise = context.waitForEvent('page', {timeout: 45000});

        await popOut.click();

        const vessel = await vesselPromise;

        await vessel.waitForLoadState('domcontentloaded');
        await vessel.waitForSelector(VIEW, {timeout: 45000});

        const view = vessel.locator(VIEW).first(),
              box  = await view.boundingBox();

        expect(box, 'the popup renders the grid view').toBeTruthy();

        // A main-thread addon is imported into a window the first time the App Worker resolves it
        // for that window (`worker.App#getAddon` → `Main.importAddon`), so the popup's hover-sync
        // addon does not exist until a scroll asks for it. One warm-up scroll loads it; the counters
        // go on afterwards, and only the second scroll is judged.
        await vessel.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await vessel.mouse.wheel(0, 120);

        await expect.poll(() => vessel.evaluate(name => !!Neo.main?.addon?.[name], ADDON),
            {message: 'the first scroll imports the hover-sync addon into the popup window', timeout: 15000}).toBe(true);

        expect(await countAddonCalls(page,   ADDON), 'the opener addon is counted').toBe(true);
        expect(await countAddonCalls(vessel, ADDON), 'the popup addon is counted').toBe(true);

        // Both warm-up scrolls carried the routing key, so no hover-sync warning has been logged yet.
        const warningsBefore = await countHoverSyncWarnings(app, ADDON);

        expect(warningsBefore, 'the warm-up scrolls log no deprecated-destination warning for the hover-sync addon').toBe(0);

        // The judged scroll: one real wheel scroll over the popup's grid view.
        await vessel.mouse.wheel(0, 240);

        // The witness: the popup's addon is suspended and resumed; the opener's addon receives nothing.
        // Before the fix every call fell back to the first connected port — the opener — so the
        // counts were exactly reversed.
        await expect.poll(() => readAddonCalls(vessel, ADDON), {message: 'the popup addon receives suspend and resume', timeout: 10000})
            .toEqual(expect.arrayContaining(['suspendHover', 'resumeHover']));

        expect(await readAddonCalls(page, ADDON), 'the opener addon hears nothing about the popup\'s scroll').toEqual([]);

        // A worker round-trip on the session's connection orders this read after the scroll's console output.
        await app.checkNamespace('Neo.grid.ScrollManager');

        expect(await countHoverSyncWarnings(app, ADDON), 'the judged scroll logs no deprecated-destination warning for the hover-sync addon').toBe(warningsBefore);

        await vessel.close({runBeforeUnload: true})
    })
});
