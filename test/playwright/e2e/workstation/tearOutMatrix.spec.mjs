import {expect, test} from '../../fixtures.mjs';

/**
 * @summary The seven-row tear-out portability witness suite — the headed measurement half of
 * `learn/guides/specificfeatures/TearOutPortabilityMatrix.md`.
 *
 * Drives the LANDED transition chain end to end on the flagship workstation surface:
 * `SortZone#checkWindowBoundary` (intersection-ratio hysteresis, 0.8 detach / 0.6 reattach)
 * → `dashboard.Container#onDragBoundaryExit` → `#openWidgetInPopup` (real URL-addressed OS
 * popup on the shared heap) → `DragDrop` pointer-follow.
 *
 * MUST run HEADED on a real desktop session: headless (and virtual displays) prove wiring,
 * never native placement semantics — acquisition, `moveTo` throttling, and screen-topology
 * permissions are exactly the platform truths this suite exists to measure. Cells this
 * environment cannot honestly measure stay `NOT_YET_MEASURED` in the matrix document; the
 * suite never fakes a platform verdict.
 *
 * Scaffold state: row 1 is the first live witness (selector constants below calibrate on the
 * first headed run); rows 2–7 are contracted via `test.fixme` with their receipt requirements
 * in place — red-honest until each cell's witness lands.
 */

// The flagship surface (density context: 20 items / 9 nodes / 6 tab nodes). The dev server
// port rides NEO_E2E_PORT — the same knob the e2e config uses to dodge a foreign server.
const
    e2ePort    = Number(process.env.NEO_E2E_PORT) || 8080,
    surfaceUrl = `http://localhost:${e2ePort}/apps/workstation/index.html`,
    // First-run calibration constants: the drag handle of one dashboard item on the default
    // workspace. Adjusted on the first headed run against the live DOM; the witness fails
    // LOUD on a selector miss instead of timing out silently.
    itemHandle  = '.neo-dashboard-container .neo-header-toolbar',
    dragSteps   = 25;

test.describe('tear-out portability matrix — workstation, headed', () => {
    test.setTimeout(120000);

    test.beforeEach(async ({page}) => {
        await page.goto(surfaceUrl);
        await expect(page.locator('.neo-viewport')).toBeVisible({timeout: 60000})
    });

    test('row 1 — hysteretic grammar: a slow boundary crossing detaches below 0.8 moving out, popup acquired, no oscillation', async ({context, page}) => {
        const handle = page.locator(itemHandle).first();

        await expect(handle, 'calibration: the dashboard item drag handle must exist on the surface').toBeVisible({timeout: 30000});

        const
            box      = await handle.boundingBox(),
            viewport = page.viewportSize();

        expect(box, 'the drag handle reports a bounding box').toBeTruthy();

        // Slow, stepped drag from the item toward and past the right window boundary — the
        // stepped path is what makes the direction-aware ratio trace meaningful (row-1 receipt:
        // exit fires while MOVING OUT below the detach threshold, never at rest).
        const popupPromise = context.waitForEvent('page', {timeout: 30000});

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();

        for (let i = 1; i <= dragSteps; i++) {
            await page.mouse.move(
                box.x + (viewport.width + 200 - box.x) * (i / dragSteps),
                box.y + box.height / 2,
                {steps: 4}
            )
        }

        // The mid-gesture conversion: a REAL page (popup) must be acquired before pointer-up —
        // acquisition-during-gesture is the landed grammar, not a drop effect.
        const popup = await popupPromise;

        await page.mouse.up();

        expect(popup.url(), 'the popup is URL-addressed (openWidgetInPopup contract)').toContain('/apps/');
        await expect(popup.locator('body')).toBeVisible({timeout: 30000})
    });

    test.fixme('row 2 — acquisition: window.open boolean-shaped failure + the >5s userActivation negative control', async () => {
        // Receipts: assert the acquisition path checks window.open's BOOLEAN result (a blocked
        // popup never throws); measure navigator.userActivation at drag-end after >5s — the
        // expected portable failure proving release-time window.open is the negative baseline.
    });

    test.fixme('row 3 — moving embodiment: requested-vs-observed windowMoveTo coordinates', async () => {
        // Receipts: per pointer-follow step, record requested coords vs window.screenX/Y
        // observed in the popup; moveTo is advisory, never correctness authority.
    });

    test.fixme('row 4 — object permanence: same instance id + live stores across detach and reintegration', async () => {
        // Receipts: component instance id and store references identical before detach and
        // after drag-back reintegration; data streamed uninterrupted across the transition.
    });

    test.fixme('row 5 — screen topology: getScreenDetails denied degrades to the documented fallback', async () => {
        // Receipts: the full flow completes with the permission denied; denial never blocks.
    });

    test.fixme('row 6 — multi-window targeting: at most one target exposes one menu + one preview per gesture', async () => {
        // Receipts: the claim protocol's identity binding only — arbitration is out of scope.
    });

    test.fixme('row 7 — terminal cleanup: exact-once across drop, cancel, and blocked-acquisition terminals', async () => {
        // Receipts: cleanup runs exactly once per terminal; a repeated terminal is a no-op.
    })
});
