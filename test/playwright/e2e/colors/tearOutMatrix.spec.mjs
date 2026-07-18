import {expect, test} from '../../fixtures.mjs';

/**
 * @summary The seven-row tear-out portability witness suite — the headed measurement half of
 * `learn/guides/specificfeatures/TearOutPortabilityMatrix.md`.
 *
 * Drives the LANDED transition chain end to end on the colors app — the grammar's original
 * live product surface (shared workers on, `popupUrl` wired to the dedicated widget shell):
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

// The colors app: three DashboardPanels (Grid / Pie Chart / Bar Chart) whose header toolbars
// carry the explicit `neo-draggable` drag-handle cls. Relative navigation consumes the matrix
// runner's baseURL directly, so a fallback port can never diverge from the server it launched.
const
    surfaceUrl = '/apps/colors/index.html',
    itemHandle = '.neo-draggable',
    dragSteps  = 25;

test.describe('tear-out portability matrix — colors app, headed', () => {
    test.setTimeout(120000);

    test.beforeEach(async ({page}) => {
        await page.goto(surfaceUrl);
        await expect(page.locator('.colors-viewport')).toBeVisible({timeout: 60000})
    });

    test('row 1 probe — boundary-exit fires on a slow crossing, popup acquired MID-GESTURE, persists the drop terminal, Neo content renders (ratio-trace + instance-identity receipts pending)', async ({context, page}) => {
        const handle = page.locator(itemHandle).first();

        await expect(handle, 'calibration: the dashboard item drag handle must exist on the surface').toBeVisible({timeout: 30000});

        const
            box      = await handle.boundingBox(),
            viewport = page.viewportSize();

        expect(box, 'the drag handle reports a bounding box').toBeTruthy();

        // Diagnostic channels: the app worker's console surfaces re-entry/cleanup decisions
        // (`onDragBoundaryEntry` logs on the reattach path — the only popup-closing path).
        const mainConsole = [];
        page.on('console', message => mainConsole.push(`[${message.type()}] ${message.text()}`));

        // Slow, stepped drag from the item toward and past the right window boundary — the
        // stepped path is what makes the direction-aware ratio trace meaningful (row-1 receipt:
        // exit fires while MOVING OUT below the detach threshold, never at rest). The loop stops
        // the moment acquisition fires, isolating the post-acquisition move stream from the
        // pointer-up path when hunting an unexpected close.
        const popupPromise = context.waitForEvent('page', {timeout: 30000});

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();

        let popup = null;

        for (let i = 1; i <= dragSteps && !popup; i++) {
            await page.mouse.move(
                box.x + (viewport.width + 200 - box.x) * (i / dragSteps),
                box.y + box.height / 2,
                {steps: 4}
            );
            popup = await Promise.race([popupPromise.then(acquired => acquired), page.waitForTimeout(50).then(() => null)])
        }

        // The mid-gesture conversion: a REAL page (popup) must be acquired before pointer-up —
        // acquisition-during-gesture is the landed grammar, not a drop effect.
        popup = popup || await popupPromise;

        const popupConsole  = [];
        let   popupClosedAt = null;
        popup.on('console', message => popupConsole.push(`[${message.type()}] ${message.text()}`));
        popup.on('close', () => popupClosedAt = Date.now());

        const beforeUp = Date.now();
        await page.mouse.up();

        expect(popup.url(), 'the popup is URL-addressed (openWidgetInPopup contract)').toContain('/apps/');

        // Pointer-up outside the source window is the DETACH terminal: the popup persists as a
        // standalone OS window (closing here would be the reattach/cancel path — a row-1 FAIL).
        await page.waitForTimeout(2000);
        expect(popup.isClosed(),
            `the popup survives the drop terminal (closedAt-upDelta: ${popupClosedAt ? popupClosedAt - beforeUp : 'n/a'}ms; ` +
            `popup console: ${popupConsole.join(' | ') || 'none'}; main console tail: ${mainConsole.slice(-8).join(' | ') || 'none'})`
        ).toBe(false);

        // The widget shell boots over the shared heap and adopts the parked widget — Neo-rendered
        // content (worker-created ids) is the adoption receipt, not the bare body.
        await expect(popup.locator('[id^="neo-"]').first(), `adopted Neo content renders in the popup (console: ${popupConsole.join(' | ')})`).toBeVisible({timeout: 45000})
    });

    test('row 2 probe — activation decay-trace capture across an 8s held gesture (expiry itself UNMEASURABLE under CDP input; receipts recorded, verdict pending real-input + blocking-controlled cells)', async ({page}) => {
        const handle = page.locator(itemHandle).first();

        await expect(handle).toBeVisible({timeout: 30000});

        const box = await handle.boundingBox();

        // A REAL drag gesture (the contract's context: "measured at drag-end after >5 s") —
        // small in-container moves only, never crossing the boundary; the receipt is about the
        // platform's activation window, not the tear-out.
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();

        const atStart = await page.evaluate(() => ({
            hasBeen : navigator.userActivation.hasBeenActive,
            isActive: navigator.userActivation.isActive
        }));

        const trace = [];

        for (let i = 0; i < 16; i++) {
            await page.mouse.move(box.x + 90 + (i % 2) * 40, box.y + 70, {steps: 3});
            await page.waitForTimeout(500);
            if (i % 4 === 3) {
                trace.push(await page.evaluate(t => ({
                    atMs    : t,
                    isActive: navigator.userActivation.isActive
                }), (i + 1) * 500))
            }
        }

        const atDragEnd = await page.evaluate(() => ({
            hasBeen : navigator.userActivation.hasBeenActive,
            isActive: navigator.userActivation.isActive
        }));

        await page.mouse.up();

        const afterUp = await page.evaluate(() => ({isActive: navigator.userActivation.isActive}));

        // FIRST-RUN FINDING (macOS Chrome, CDP input): activation did NOT read expired at 5.5s —
        // the contract's "expected portable failure" is INSTRUMENT-SENSITIVE (synthetic input may
        // renew, or held-gesture semantics differ). The witness therefore RECORDS the decay trace
        // (receipts drive the cell verdict + the doc); it asserts only the invariants that hold
        // regardless of direction: activation was live at start, sticky bit persists, and the
        // measurement completed. Direction claims live in the matrix document, receipt-cited.
        await test.info().attach('row2-activation-trace', {
            body       : JSON.stringify({afterUp, atDragEnd, atStart, trace}, null, 2),
            contentType: 'application/json'
        });
        console.log('ROW2-RECEIPTS ' + JSON.stringify({afterUp, atDragEnd, atStart, trace}));

        expect(atStart.isActive,  'transient activation live at gesture start').toBe(true);
        expect(atDragEnd.hasBeen, 'sticky activation persists').toBe(true);
        expect(trace.length,      'the decay trace was captured across the 8s gesture').toBeGreaterThan(2)
    });

    test('row 3 probe — post-acquisition lifecycle-terminal receipts (requested-vs-observed coordinate pairing pending)', async ({context, page}, testInfo) => {
        const handle = page.locator(itemHandle).first();

        await expect(handle).toBeVisible({timeout: 30000});

        const
            box         = await handle.boundingBox(),
            viewport    = page.viewportSize(),
            mainConsole = [];

        page.on('console', message => mainConsole.push(`[${message.type()}] ${message.text()}`));

        const popupPromise = context.waitForEvent('page', {timeout: 30000});

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();

        // Attach the close listener INSIDE the acquisition race so not even a microsecond of the
        // popup's life is unobserved — the first reproduction closed before a post-race attach.
        let popupAcquiredAt = null,
            popupClosedAt   = null;

        const observedPopupPromise = popupPromise.then(acquired => {
            popupAcquiredAt = Date.now();
            acquired.on('close', () => popupClosedAt = Date.now());
            return acquired
        });

        let popup = null;

        for (let i = 1; i <= dragSteps && !popup; i++) {
            await page.mouse.move(
                box.x + (viewport.width + 200 - box.x) * (i / dragSteps),
                box.y + box.height / 2,
                {steps: 4}
            );
            popup = await Promise.race([observedPopupPromise, page.waitForTimeout(50).then(() => null)])
        }
        popup = popup || await observedPopupPromise;

        // The row-1 open observation under measurement: SUSTAINED pointer movement AFTER
        // acquisition closed the popup in early runs (first reproduction: within ~300ms of the
        // first continued move — faster than a 250ms sampling interval). Sample IMMEDIATELY at
        // acquisition, then continue the move stream with tight sampling — the
        // requested-vs-observed half of the receipt (the pointer path is the requested side;
        // `moveTo` is advisory, never authority).
        const
            samples     = [],
            firstMoveAt = Date.now(),
            followX0    = viewport.width - 60,
            samplePopup = async () => {
                try {
                    samples.push(await popup.evaluate(() => ({t: Date.now(), x: window.screenX, y: window.screenY})));
                    return true
                } catch {
                    return false
                }
            };

        await samplePopup();

        for (let i = 0; i < 8 && !popup.isClosed(); i++) {
            await page.mouse.move(followX0 + i * 12, box.y + box.height / 2 + i * 6, {steps: 2});
            if (!await samplePopup()) break;
            await page.waitForTimeout(120)
        }

        const upAt = Date.now();
        await page.mouse.up();
        await page.waitForTimeout(1500);

        const receipts = {
            acquiredToCloseMs: popupClosedAt && popupAcquiredAt ? popupClosedAt - popupAcquiredAt : null,
            closed           : popup.isClosed(),
            closedAfterMoveMs: popupClosedAt ? popupClosedAt - firstMoveAt : null,
            closedBeforeUp   : popupClosedAt ? popupClosedAt < upAt : false,
            mainConsoleTail  : mainConsole.slice(-10),
            reentryLogSeen   : mainConsole.some(line => line.includes('onDragBoundaryEntry')),
            sampleCount      : samples.length,
            samples
        };

        await testInfo.attach('row3-receipts', {body: JSON.stringify(receipts, null, 2), contentType: 'application/json'});
        console.log('ROW3-RECEIPTS ' + JSON.stringify(receipts));

        // Assertion floor (the cell's verdict lives in the attached receipts): a DEFINITE terminal
        // was recorded — the popup either survived the stream (samples flow) or its close was
        // observed with lifecycle timestamps. An indeterminate popup state is the only failed
        // measurement; empty consoles and zero samples are themselves findings, not failures.
        expect(receipts.closed || samples.length > 0,
            `definite terminal recorded (closed=${receipts.closed}, acquiredToCloseMs=${receipts.acquiredToCloseMs}, ` +
            `closedBeforeUp=${receipts.closedBeforeUp}, reentryLog=${receipts.reentryLogSeen})`
        ).toBe(true)
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
