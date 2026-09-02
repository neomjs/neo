import {test, expect} from '@playwright/test';

/**
 * The dock host opens the geometry stream itself: a `Neo.dashboard.dock.Workspace` arms
 * `WindowPosition` movement AND resize observation for its own render target at construction, so
 * `Neo.manager.Window` — the one geometry authority every cross-window claim hit-tests — follows a
 * fixed-origin resize without any pointer travel or position change.
 *
 * The fixture (`apps/dock-popout`) is a tear-out host that never arms observation by hand; on an
 * engine that leaves the arming to the app its manager row stays the connect-time snapshot, which
 * is exactly the red this arm turns green. The boot read is the control: the row exists and
 * carries the boot viewport before anything is resized.
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

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-popout/index.html');
    await page.waitForSelector('#dock-popout-workspace', {state: 'attached'});
    await page.waitForSelector('.neo-tab-header-button', {state: 'visible'})
});

test.describe('dock host geometry observation (#18077)', () => {
    test('a fixed-origin resize of the host window refreshes manager.Window without any pointer or position change', async ({page}) => {
        const boot = page.viewportSize();

        // Control on the publisher: the host armed both observations on the Main realm's addon
        // (the addon instance lives in the page, so the page context reads it directly).
        await expect.poll(() => page.evaluate(() => {
            const addon = Neo.main?.addon?.WindowPosition;

            return addon ? [addon.observeMovement, addon.observeResize] : null
        }), {message: 'the host armed movement AND resize on the WindowPosition addon'}).toEqual([true, true]);

        // Control on the consumer: arming published the current snapshot, so the row exists with
        // the boot viewport before anything moves — a dedicated-worker app has no connect handshake
        // that would register it otherwise.
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
});
