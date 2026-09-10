import {test, expect} from '@playwright/test';

/**
 * @summary Workstation's three boot modes, observed as RENDERED DOM in the real app.
 *
 * This tier is the point and it is not interchangeable with the unit witness. `apps/workstation`'s
 * boot orchestration lives in `view/Viewport.mjs#onConstructed`, which `await`s the window's URL
 * through `Neo.Main.getByPath` and then resolves its owning workspace through the Transaction
 * Group. A unit spec cannot reach that: there is no Main thread to answer the URL read, so the
 * branch under test never executes. The failure this file exists to catch was measured — a
 * refactor took `.workstation-dock-host` from 1 to 0 while the entire workstation unit tier stayed
 * green at 97/97, because an async rejection inside `onConstructed` is an unhandled rejection and
 * nothing hooks `unhandledrejection`.
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
 * assertion: the class is written by the Workspace the Viewport mounts, so it cannot appear unless
 * the boot path resolved an owner AND mounted through it.
 */
const DOCK_HOST = '.workstation-dock-host';

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

        await expect(page.getByText('This saved window is waiting for its original workspace.'))
            .toBeVisible({timeout: 60000});

        expect(await page.locator(DOCK_HOST).count(),
            'the refusal branch must not mount a dock host').toBe(0)
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
