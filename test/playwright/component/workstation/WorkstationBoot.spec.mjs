import {test, expect} from '@playwright/test';

/**
 * @summary Workstation's three boot modes, and the reload that rebinds one of them, observed as RENDERED DOM in the real app.
 *
 * This tier is the point and it is not interchangeable with the unit witness. `apps/workstation`'s
 * boot is decided in `view/ViewportController.mjs#decide` from two synchronous sources — the URL the
 * main thread registered for the window and the window's Group binding — and a window that already
 * has an owner is adopted by that owner in `view/WorkspaceController.mjs#onWindowConnect`, on the App
 * worker's `connect` event. The unit tier drives the decision table and the adoption handler directly;
 * it never runs the real Viewport in a real window, and nothing in it fires the worker's `connect`.
 * The failure this file exists to catch was measured against the previous shape of this boot: a
 * refactor took `.workstation-dock-host` from 1 to 0 while the entire workstation unit tier stayed
 * green at 97/97, because an async rejection inside the then-`onConstructed` was an unhandled
 * rejection and nothing hooks `unhandledrejection`.
 *
 * Deliberately Brain-free. The sibling coverage in `e2e/workstation/` drives the Neural Link and
 * therefore requires `NEO_AGENTOS_RUNTIME_ROOT` pointing at a Brain checkout; these arms navigate
 * and read DOM only, so they run in a tracked-only clone and can gate a boot change on any host.
 *
 * Run: NEO_COMPONENT_PORT=8186 npx playwright test workstation/WorkstationBoot -c test/playwright/playwright.config.component.mjs --workers=1
 */

/** The real app, served from the repo root by the component tier's webServer. */
const APP = 'apps/workstation/index.html';

/**
 * The default-boot host, set in `apps/workstation/view/Workspace.mjs`. Its presence is the whole
 * assertion: the class is written by the Workspace the window's controller creates or its owner moves
 * in, so it cannot appear unless the boot path resolved an owner AND mounted through it.
 */
const DOCK_HOST = '.workstation-dock-host';

/** The arriving side's fail-closed answer to a saved-window URL no owner can adopt. */
const REFUSAL = 'This saved window is waiting for its original workspace.';

/**
 * What one Workstation window can say about its own boot, read from the DOM and the main thread: the
 * identity it carries across its reloads, its window generation, and the ids of its Viewport and dock
 * host — the App worker's component ids, so they name the instances behind the elements.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{carrier: Object|null, hostId: String|undefined, viewportId: String|undefined, windowId: String}>}
 */
const readBoot = page => page.evaluate(() => ({
    carrier   : JSON.parse(sessionStorage.getItem(Neo.worker.Manager.topologyIdentityStorageKey) || 'null'),
    hostId    : document.querySelector('.workstation-dock-host')?.id,
    viewportId: document.querySelector('.workstation-viewport')?.id,
    windowId  : Neo.worker.Manager.windowId
}));

test.describe('workstation boot — the rendered outcome of each URL mode', () => {
    test('default boot mounts the dock host', async ({page}) => {
        await page.goto(APP);
        await page.waitForSelector(DOCK_HOST, {state: 'attached', timeout: 60000});

        // Counted rather than presence-checked: the failure mode on the other side of this arm is a
        // second host mounted by a duplicate boot, which `waitForSelector` alone reports as success.
        expect(await page.locator(DOCK_HOST).count(), 'exactly one dock host, mounted once').toBe(1);

        // And the host is not an empty shell — a mounted-but-unpopulated host is what a boot that
        // resolves its owner and then fails to project would leave behind.
        //
        // Attached, not visible, and scoped INTO the host: an unscoped visible-wait resolves to the
        // first of nine tab-header buttons, which is a collapsed rail's `neo-dashboard-dock-reveal-title`
        // and invisible by design — measured here, so the next author does not re-add the wait that
        // times out against a correct boot.
        await expect(page.locator(`${DOCK_HOST} .neo-tab-header-button`).first())
            .toBeAttached({timeout: 60000});
        expect(await page.locator(`${DOCK_HOST} .neo-tab-header-button`).count(),
            'the host carries projected tab chrome').toBeGreaterThan(0)
    });

    test('a saved window whose workspace is unknown renders the refusal, not an empty page', async ({page}) => {
        // `?workspace=<key>` with no Group binding for this window is the branch that must FAIL
        // CLOSED. `Transaction.findByWindow` finds nothing, so the key cannot match and the Viewport
        // must say so rather than mount a host it has no owner for.
        await page.goto(`${APP}?workspace=no-such-workspace-key`);

        await expect(page.getByText(REFUSAL)).toBeVisible({timeout: 60000});

        expect(await page.locator(DOCK_HOST).count(),
            'the refusal branch must not mount a dock host').toBe(0)
    });

    test('a reload of the root window while the worker lives moves the retained root into the new window', async ({page, context}) => {
        await page.goto(APP);
        await page.waitForSelector(DOCK_HOST, {state: 'attached', timeout: 60000});

        const before = await readBoot(page);

        // The App worker is shared, and a SharedWorker ends with its last client — which a reload of the
        // only window is. A second window keeps the worker, and with it the root, alive across the
        // reload. Its own boot is the refusal arm above, so it creates no root that could confuse the count.
        const keeper = await context.newPage();

        await keeper.goto(`${APP}?workspace=no-such-workspace-key`);
        await expect(keeper.getByText(REFUSAL)).toBeVisible({timeout: 60000});

        await page.reload();
        await page.waitForSelector(DOCK_HOST, {state: 'attached', timeout: 60000});

        const after = await readBoot(page);

        // Controls first. A reload is a new window generation carrying the same identity, and the new
        // Viewport's id continues the worker's counter: a worker that restarted would mint the first id
        // again, and a same-id host below would then prove nothing.
        expect(after.windowId, 'a reload is a new window generation').not.toBe(before.windowId);
        expect(after.carrier, 'carrying the identity its slot rebinds under').toEqual(before.carrier);
        expect(after.viewportId, 'into a worker heap that survived the reload').not.toBe(before.viewportId);

        // The claim: the host the root already owned, moved — not a second one, not a fresh one.
        expect(await page.locator(DOCK_HOST).count(), 'exactly one dock host').toBe(1);
        expect(after.hostId, 'the same host instance, adopted into the new window').toBe(before.hostId);

        await keeper.close()
    });

    test('a popout URL takes the popout branch and does not mount a default host', async ({page}) => {
        // `?popout=<id>` marks the window as a vessel host. With no live pane to adopt it stays
        // empty — that is correct, and the discriminator is the class rather than the emptiness:
        // an empty page proves nothing, while `workstation-popout-host` proves the branch ran.
        await page.goto(`${APP}?popout=no-such-pane`);

        await page.waitForSelector('.workstation-popout-host', {state: 'attached', timeout: 60000});

        expect(await page.locator(DOCK_HOST).count(),
            'the popout branch must not also mount the default host').toBe(0)
    })
});
