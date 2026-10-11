import {test, expect} from '@playwright/test';

/**
 * The dock host opens the geometry stream itself: in an app whose App Worker is a SharedWorker, a
 * `Neo.dashboard.dock.Workspace` loads `WindowPosition` into its own render target and arms movement
 * AND resize observation at construction, so `Neo.manager.Window` — the one geometry authority every
 * cross-window claim hit-tests — follows a fixed-origin resize without any pointer travel or
 * position change. The app need not list the addon in `mainThreadAddons`.
 *
 * Both fixtures run the same tear-out host, which never arms observation by hand. `apps/dock-popout-shared`
 * is a SharedWorker app that does not list the addon: the positive arm. `apps/dock-popout` is a
 * dedicated-worker app that lists it: a dock there spans no windows, so it arms nothing and starts
 * no poll.
 *
 * Emulated viewports render no window chrome, so inner and outer extents coincide here; the
 * frame-vs-viewport split is `e2e/workstation/WindowGeometryRealChromeNL`'s concern.
 */

const WORKSPACE_ID = 'dock-popout-workspace';

let tick = 0;

const readWorkspace = async (page, keys) => {
    // The main-realm remote answers with the worker-message envelope; the values ride `.data`.
    const reply = await page.evaluate(data => Neo.worker.App.getConfigs(data), {id: WORKSPACE_ID, keys});

    return reply?.data ?? reply
};

const setWorkspace = (page, configs) => page.evaluate(
    data => Neo.worker.App.setConfigs(data),
    {id: WORKSPACE_ID, ...configs}
);

/** Ticks the fixture's probe trigger, then reads the manager row it mirrored. */
const readGeometry = async page => {
    await setWorkspace(page, {readWindowGeometry: ++tick});

    const [json] = await readWorkspace(page, ['windowGeometryJson']);

    return json ? JSON.parse(json) : null
};

/** Opens one fixture and waits for its workspace to project. */
const openFixture = async (page, fixture) => {
    await page.goto(`test/playwright/component/apps/${fixture}/index.html`);
    await page.waitForSelector('#dock-popout-workspace', {state: 'attached'});
    await page.waitForSelector('.neo-tab-header-button', {state: 'visible'})
};

/** The Main realm's addon state: the addon instance lives in the page, so the page reads it directly. */
const readAddon = page => page.evaluate(() => {
    const addon = Neo.main?.addon?.WindowPosition;

    return {
        listed : Neo.config.mainThreadAddons.includes('WindowPosition'),
        loaded : !!addon,
        armed  : addon ? [addon.observeMovement, addon.observeResize] : null,
        polling: !!addon?.intervalId
    }
});

test.describe('dock host geometry observation (#18077)', () => {
    test('a fixed-origin resize of the host window refreshes manager.Window without any pointer or position change', async ({page}) => {
        await openFixture(page, 'dock-popout-shared');

        const boot = page.viewportSize();

        // Control on the publisher: the app lists no WindowPosition, and the host loaded it into its
        // own window and armed both observations there.
        await expect.poll(async () => {
            const {listed, loaded, armed} = await readAddon(page);

            return {listed, loaded, armed}
        }, {message: 'the host loaded the unlisted addon and armed movement AND resize'}).toEqual({
            listed: false,
            loaded: true,
            armed : [true, true]
        });

        // Control on the consumer: the row exists with the boot viewport before anything moves.
        await expect.poll(async () => (await readGeometry(page))?.outerRect?.width, {
            message: 'the host row is registered at boot with the boot viewport'
        }).toBe(boot.width);

        await page.setViewportSize({width: boot.width - 320, height: boot.height - 160});

        // The falsifier: only a published `resize` reaches the manager; the poll never sees a
        // fixed-origin resize and the connect-time snapshot would keep the boot width forever.
        await expect.poll(async () => (await readGeometry(page))?.outerRect?.width, {
            message: 'the row follows the resize through the host-armed stream',
            timeout: 5000
        }).toBe(boot.width - 320);

        const geometry = await readGeometry(page);

        expect(geometry.outerRect.height, 'the outer height follows too').toBe(boot.height - 160);
        expect(geometry.innerRect.width, 'no chrome on an emulated viewport: inner equals outer').toBe(boot.width - 320);
        expect(geometry.innerRect.height).toBe(boot.height - 160)
    });

    test('a dock in a dedicated-worker app spans no windows, so it arms nothing and starts no poll', async ({page}) => {
        await openFixture(page, 'dock-popout');

        // The same host projected (openFixture waited on its tab header) beside a listed, loaded
        // addon: had the host armed it, both flags would read true by now, as in the shared app.
        expect(await readAddon(page)).toEqual({
            listed : true,
            loaded : true,
            armed  : [false, false],
            polling: false
        })
    });
});
