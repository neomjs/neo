import { test, expect } from '../../fixtures.mjs';

/**
 * Whitebox-e2e for the dock motion pipeline — the "e2e-tested" half of "animated": committed dock
 * operations on the REAL app move real pixels, and the `neo-dashboard-dock-animating` signal
 * (`DockMotionSignal`) brackets each motion — appears when motion starts, clears when it settles.
 * That bracket is the exact lifecycle tour step-gating and the recording pipeline consume, so these
 * specs pin the integrated truth of the three-producer pipeline (the token contract, the
 * choreography classes, and the FLIP commit layer) rather than any single producer's unit view.
 *
 * Waits are event/state-driven only (`expect.poll` on DOM class presence, rAF rect samples over a
 * window) — no timing sleeps, per the house e2e rule.
 *
 * Run: NEO_E2E_PORT=8093 npx playwright test dashboard/DockMotionNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */

const SIGNAL = '.neo-dashboard-dock-animating';

const connect = async (page, neuralLink) => {
    await page.goto('/examples/dashboard/dock/');
    page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));
    await page.waitForTimeout(2500); // settle worker boot + first render (the one sanctioned boot wait)

    const app      = await neuralLink.connectToApp('Neo.examples.dashboard.dock');
    const holders  = await app.findInstances({ className: 'Neo.examples.dashboard.dock.MainContainer' }, ['id']);
    const holderId = Array.isArray(holders) ? holders[0]?.id : holders?.id;
    expect(holderId, 'the dock MainContainer must exist in the App Worker').toBeTruthy();

    // Motion-contract readiness: the dock tokens arrive via the per-surface theme-file loading
    // — a state-driven wait, not a sleep. If this times out, the LOADER is the defect
    // (tokens absent → every motion collapses to instant): see the token-delivery bug ticket.
    await expect.poll(async () => page.evaluate(() => {
        const scope = document.querySelector('.neo-dashboard') || document.body;
        return getComputedStyle(scope).getPropertyValue('--dock-transition-duration').trim();
    }), { message: 'the dock motion tokens must be resolvable on the surface (theme-file delivery)', timeout: 15000, intervals: [250] }).not.toBe('');

    return { app, holderId };
};

// The signal class must APPEAR (motion started) — polled fast enough to catch a token-length
// (260ms) window — and then CLEAR (motion settled). Producer-side leaves are event-driven
// (transitionend / animationend / FLIP play resolution); the clear bound includes the signal's
// own fail-safe horizon so a lost end event fails the spec only if the BACKSTOP also fails.
const expectSignalBracket = async (page, {appearMs = 1500, clearMs = 3500} = {}) => {
    await expect.poll(
        () => page.locator(SIGNAL).count(),
        { message: 'the dock-animating signal must APPEAR when motion starts', timeout: appearMs, intervals: [25] }
    ).toBeGreaterThan(0);

    await expect.poll(
        () => page.locator(SIGNAL).count(),
        { message: 'the dock-animating signal must CLEAR when motion settles', timeout: clearMs, intervals: [50] }
    ).toBe(0);
};

// The stable-marker motion witness: rAF-records {x, y, w, o} tuples for the first element
// matching the selector. Sampling by MARKER CLASS, never by instance, is what lets observation
// live THROUGH a removeAll+rebuild re-projection — the marker is exactly the
// survives-recreation correlation key the FLIP addon itself uses. Fail-closed semantics:
// frames without a match count as gaps (no fabricated zeros), zero-size reads ARE recorded so
// a consumer can convict them, and every consumer asserts a minimum sample floor before
// reading shape — an oracle that observed nothing must fail, never default-pass.
const startMotionSampler = (page, selector) => page.evaluate(sel => {
    window.__motion = { gaps: 0, samples: [], stop: false };

    const tick = () => {
        const el = document.querySelector(sel);

        if (el) {
            const r = el.getBoundingClientRect();

            window.__motion.samples.push({
                o: Math.round(parseFloat(getComputedStyle(el).opacity) * 100),
                w: Math.round(r.width),
                x: Math.round(r.x),
                y: Math.round(r.y)
            })
        } else {
            window.__motion.gaps++
        }

        window.__motion.stop || window.__motion.samples.length + window.__motion.gaps > 600 || requestAnimationFrame(tick)
    };

    requestAnimationFrame(tick)
}, selector);

const readMotionSamples = page => page.evaluate(() => {
    window.__motion.stop = true;
    return window.__motion
});

// The explicit witness precondition: the target must be laid out (present + non-zero width)
// BEFORE the operation fires, so "no motion observed" can never be confused with "nothing
// existed to observe".
const expectMarkerLaidOut = (page, selector) => expect.poll(
    () => page.evaluate(sel => {
        const el = document.querySelector(sel);
        return el ? Math.round(el.getBoundingClientRect().width) : 0
    }, selector),
    { message: `the motion witness target must be laid out before the operation (${selector})`, timeout: 10000, intervals: [100] }
).toBeGreaterThan(0);

test.describe('Dock motion pipeline (Neural Link) — the signal brackets real motion', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1600, height: 900 } });

    test('a committed resizeSplit GLIDES: real geometry motion over time, signal-bracketed', async ({ page, neuralLink }) => {
        const { app, holderId } = await connect(page, neuralLink);
        const MARKER            = '[class*="dock-flip-item-"]';

        await expectMarkerLaidOut(page, MARKER);
        await startMotionSampler(page, MARKER);

        // state-relative: the app heap is SHARED across the sweep (SharedWorker), so derive a
        // guaranteed-delta target from the CURRENT committed sizes rather than assuming seeds
        const topo0  = await app.getDockTopology(holderId);
        const doc0   = topo0?.document ?? topo0;
        const cur    = doc0.nodes['root-split'].sizes;
        const target = cur[0] < 0.5 ? [0.65, 0.35] : [0.3, 0.7];

        // the bracket is armed CONCURRENTLY with the operation: the appear-poll races the op's
        // delivery into the browser, so the witness cannot miss a motion window that opens
        // before the RPC settles
        const [result] = await Promise.all([
            app.executeDockOperation(holderId, {
                operation: 'resizeSplit', splitNodeId: 'root-split', sizes: target
            }),
            expectSignalBracket(page)
        ]);

        expect(result.errors).toEqual([]);
        expect(result.applied).toBe(true);

        // real movement: the pane traveled THROUGH intermediate widths (a hard cut shows at
        // most the before/after pair; a glide shows a progression) — on valid reads only
        const { samples } = await readMotionSamples(page);
        expect(samples.length, 'the glide witness must have observed real frames').toBeGreaterThan(5);
        expect(samples.every(s => s.w > 0), 'a zero-width sample means the witness watched a dead node').toBe(true);

        const widths = [...new Set(samples.map(s => s.w))];
        expect(widths.length, `the pane must move THROUGH intermediate widths (saw ${widths.length} distinct)`).toBeGreaterThan(2);
    });

    test('a committed moveItem is FLIP-bracketed: the pane travels between real positions around the structural commit', async ({ page, neuralLink }) => {
        const { app, holderId } = await connect(page, neuralLink);

        // state-relative (shared heap): pick a REAL cross-zone move from the current doc —
        // an item out of main-tabs if it has one, else one back INTO it
        const topo0     = await app.getDockTopology(holderId);
        const doc0      = topo0?.document ?? topo0;
        const mainItems = doc0.nodes['main-tabs']?.items || [];
        const move      = mainItems.length
            ? { itemId: mainItems[0], targetNodeId: 'terminal-tabs' }
            : { itemId: (doc0.nodes['terminal-tabs']?.items || [])[0], targetNodeId: 'main-tabs' };
        expect(move.itemId, 'a movable item must exist in the shared-heap doc').toBeTruthy();

        // the moved pane's OWN marker (the per-item correlation key the projection stamps) —
        // geometry is asserted on the item that moves, not on whichever pane matches first
        const itemMarker = `[class*="dock-flip-item-${encodeURIComponent(move.itemId)}"]`;
        await expectMarkerLaidOut(page, itemMarker);

        const before = await page.evaluate(sel => {
            const r = document.querySelector(sel).getBoundingClientRect();
            return { x: Math.round(r.x), y: Math.round(r.y) }
        }, itemMarker);

        await startMotionSampler(page, itemMarker);

        const [result] = await Promise.all([
            app.executeDockOperation(holderId, {
                operation: 'moveItem', itemId: move.itemId, targetNodeId: move.targetNodeId, index: 0
            }),
            expectSignalBracket(page)
        ]);

        expect(result.errors).toEqual([]);
        expect(result.applied).toBe(true);

        // document truth stays pinned by the structural suite; the landed-move guard keeps a
        // silent no-op from greening the bracket
        const topo = await app.getDockTopology(holderId);
        const doc  = topo?.document ?? topo;
        expect(doc.nodes[move.targetNodeId].items).toContain(move.itemId);

        // positive geometry: the pane physically LANDED somewhere else, and the FLIP carried
        // it THROUGH intermediate positions (a hard cut yields at most the two endpoints)
        const { samples } = await readMotionSamples(page);
        expect(samples.length, 'the FLIP witness must have observed real frames').toBeGreaterThan(5);

        const last = samples[samples.length - 1];
        expect(
            Math.abs(last.x - before.x) + Math.abs(last.y - before.y),
            `the moved pane must land at a different position (from ${before.x},${before.y} to ${last.x},${last.y})`
        ).toBeGreaterThan(20);

        const positions = [...new Set(samples.map(s => `${s.x},${s.y}`))];
        expect(positions.length, `the FLIP must travel THROUGH intermediate positions (saw ${positions.length})`).toBeGreaterThan(2);
    });

    test('a rail-click reveal SLIDES: the overlay travels through intermediate render states, signal-bracketed', async ({ page, neuralLink }) => {
        const { app, holderId } = await connect(page, neuralLink);

        // the seeded workspace shows the inspector VISIBLE — auto-hide it first (the landed
        // reveal journey's own setup op), which projects its rail tab
        // idempotent under the shared heap: a prior spec may already have hidden or pinned it
        const topo0 = await app.getDockTopology(holderId);
        const doc0  = topo0?.document ?? topo0;

        if (doc0.items?.inspector?.autoHidden !== true) {
            const setup = await app.executeDockOperation(holderId, {
                operation: 'setItemAutoHidden', itemId: 'inspector', autoHidden: true
            });
            expect(setup.errors).toEqual([]);
        }

        const railTab = page.locator('.neo-dashboard-dock-rail-tab', { hasText: 'Inspector' }).first();
        await expect(railTab, 'the inspector rail tab must render after auto-hiding').toBeVisible({ timeout: 10000 });

        // the witness watches the VISIBLE overlay only — pre-entry frames (hidden overlay or
        // none) count as gaps, so every recorded sample is a real revealed-state paint
        const OVERLAY = '.neo-dashboard-dock-reveal-overlay:not(.neo-dashboard-dock-reveal-overlay-hidden)';
        await startMotionSampler(page, OVERLAY);

        await Promise.all([
            railTab.click(),
            expectSignalBracket(page)
        ]);

        // positive geometry: the entry GLIDES — the slide translates and the fade progresses,
        // so the revealed overlay paints through intermediate {position, opacity} states (a
        // hard cut yields at most the entry and settled states)
        const { samples } = await readMotionSamples(page);
        expect(samples.length, 'the entry witness must have observed the revealed overlay').toBeGreaterThan(5);
        expect(samples.every(s => s.w > 0), 'a zero-width sample means the witness watched a dead node').toBe(true);

        const states = [...new Set(samples.map(s => `${s.x},${s.y},${s.o}`))];
        expect(states.length, `the reveal entry must travel through intermediate states (saw ${states.length})`).toBeGreaterThan(2);

        // the reveal actually opened (the signal wasn't a stray)
        await expect(page.locator(OVERLAY)).toHaveCount(1);
    });
});

test.describe('Dock motion pipeline — reduced-motion collapses through the token layer', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' });

    test('a committed resizeSplit lands INSTANTLY: correct document, no sustained motion, signal clears within the fail-safe', async ({ page, neuralLink }) => {
        const { app, holderId } = await connect(page, neuralLink);
        const MARKER            = '[class*="dock-flip-item-"]';

        await expectMarkerLaidOut(page, MARKER);

        // state-relative target (shared heap): derive a guaranteed-delta ratio from the
        // CURRENT committed sizes — a hardcoded target the document already holds would make
        // the whole spec a no-op that "lands instantly" without any resize happening
        const topo0  = await app.getDockTopology(holderId);
        const doc0   = topo0?.document ?? topo0;
        const cur    = doc0.nodes['root-split'].sizes;
        const target = cur[0] < 0.5 ? [0.65, 0.35] : [0.3, 0.7];

        const beforeW = await page.evaluate(
            sel => Math.round(document.querySelector(sel).getBoundingClientRect().width), MARKER
        );

        await startMotionSampler(page, MARKER);

        // no bracket arming here: with 0ms durations an instant settle may never paint the
        // signal class at all — the signal claim under reduced motion is the fail-safe clear
        const result = await app.executeDockOperation(holderId, {
            operation: 'resizeSplit', splitNodeId: 'root-split', sizes: target
        });

        expect(result.errors).toEqual([]);
        expect(result.applied).toBe(true);

        // document truth: the committed topology holds the requested geometry
        const topo1 = await app.getDockTopology(holderId);
        const doc1  = topo1?.document ?? topo1;
        expect(doc1.nodes['root-split'].sizes).toEqual(target);

        // DOM truth through the STABLE marker: the replacement pane settles at the NEW
        // geometry — a real resize happened. A dead/absent read yields delta 0 (keeps
        // polling → fails the bound), so a destroyed node can never satisfy this.
        await expect.poll(
            async () => {
                const w = await page.evaluate(sel => {
                    const el = document.querySelector(sel);
                    return el ? Math.round(el.getBoundingClientRect().width) : 0
                }, MARKER);
                return w > 0 ? Math.abs(w - beforeW) : 0
            },
            { message: 'the replacement pane must land at the NEW geometry (real resize, no dead-node read)', timeout: 5000, intervals: [100] }
        ).toBeGreaterThan(50);

        // instant settle: among the frames that observed a laid-out marker, at most the
        // before/after widths — and a zero read is an oracle failure, never a pass
        const { samples } = await readMotionSamples(page);
        expect(samples.length, 'the reduced-motion witness must have observed real frames').toBeGreaterThan(5);
        expect(samples.every(s => s.w > 0), 'a zero-width sample means the witness watched a dead node').toBe(true);

        const widths = [...new Set(samples.map(s => s.w))];
        expect(widths.length, `reduced motion must NOT glide (saw widths: ${widths.join(',')})`).toBeLessThanOrEqual(2);

        // the HONEST signal bound under 0ms durations: a zero-duration transition fires no
        // transitionend, so the producer's leave may ride the fail-safe backstop (2s) — the
        // contract claim is "clears within the horizon", not a false instant-clear
        await expect.poll(
            () => page.locator(SIGNAL).count(),
            { message: 'the signal must clear within the fail-safe horizon', timeout: 3500, intervals: [100] }
        ).toBe(0);
    });
});
