import {test, expect} from '@playwright/test';

/**
 * What a drop-preview region actually RENDERS, per edge (ticket-ref-ok: this is the enforcement AC
 * for the left/right region-preview defect — the four edges must be visually equal, uniform border
 * included; the cut side is a stamped class, never a thicker edge).
 *
 * **Why this arm exists at all.** Three layers of coverage already touch this surface and none of
 * them can fail on it: the e2e symmetry spec compares band *thicknesses*, the unit spec asserts the
 * *stylesheet as source text* (`readFileSync` + `toContain`), and neither renders an affordance. A
 * test that reads its own SCSS cannot observe what a browser composites, which is how an edge that
 * paints far darker than its siblings shipped with everything green.
 *
 * So this mounts the real renderer, drives one affordance per edge and both split positions through
 * the real config, and reads COMPUTED style off the produced node.
 *
 * **Colour is the whole subject; geometry is deliberately NOT asserted.** Placement comes from
 * `applyTargetGeometry`, which is a method rather than a remote config and so cannot be driven over
 * RMA — an earlier revision carried a target rect, a viewport id and a returned `rect` that nothing
 * ever read. Dead witnesses are worse than absent ones: they read as coverage. The pure geometry
 * contract is a unit concern and is tested there.
 */

const EDGES = ['top', 'right', 'bottom', 'left'];

let previewId;

const buildPreview = (kind, state = 'accepted') => ({
    schema   : 'neo.dock.preview.v1',
    previewId: `preview:probe:main-tabs:${kind}`,
    itemId   : 'probe-item',
    source   : {surface: 'dashboard-sort-zone', sortZoneId: 'probe-zone'},
    target   : {containerId: 'workspace', nodeId: 'main-tabs'},
    placement: {kind, ratio: 0.5},
    feedback : {state}
});

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-splitter/index.html');
    await page.waitForSelector('#dock-splitter-test-viewport', {state: 'attached'});

    previewId = await page.evaluate(async () => {
        const preview = await Neo.worker.App.createNeoInstance({
            importPath: '../dashboard/dock/interaction/Preview.mjs',
            ntype     : 'dock-preview',
            parentId  : 'dock-splitter-test-viewport'
        });

        if (!preview.success) throw new Error(`preview: ${preview.error.message}`);

        return preview.id
    });

    expect(previewId, 'the preview renderer must mount').toBeTruthy()
});

test.afterEach(async ({page}) => {
    await page.evaluate(async id => { id && await Neo.worker.App.destroyNeoInstance(id) }, previewId)
});

/**
 * Renders one edge affordance and reads back what the browser computed for it.
 *
 * The instance lives in the App Worker, so the config is set over RMA rather than by reaching for
 * `Neo.get` on the main thread — which does not exist there. Geometry is deliberately NOT driven
 * here: `applyTargetGeometry` is a method, not a remote config, and the fill/border/opacity under
 * test are decided by the class set alone. The pure geometry contract is a unit concern.
 */
const renderEdge = async (page, edge, state = 'accepted') => {
    await page.evaluate(([id, previewObj]) => Neo.worker.App.setConfigs({id, dockPreview: previewObj}),
        [previewId, buildPreview(`edge-${edge}`, state)]);

    // Wait for THIS edge's class, not merely for a node to exist. The node is reused across
    // renders, so `waitForSelector` on the generic class returns the PREVIOUS edge's node
    // immediately and every subsequent read is a stale one.
    await page.waitForSelector(`.neo-dock-preview-edge-${edge}`, {state: 'attached', timeout: 4000});

    return page.evaluate(() => {
        const node = document.querySelector('.neo-dock-preview-affordance');

        if (!node) return {missing: true};

        const s = getComputedStyle(node);

        return {
            background  : s.backgroundColor,
            borderTop   : {width: s.borderTopWidth,    color: s.borderTopColor},
            borderRight : {width: s.borderRightWidth,  color: s.borderRightColor},
            borderBottom: {width: s.borderBottomWidth, color: s.borderBottomColor},
            borderLeft  : {width: s.borderLeftWidth,   color: s.borderLeftColor},
            opacity     : s.opacity,
            cls         : node.className
        }
    })
};

/** The split-group sibling of {@link renderEdge}; `orientation` decides the split axis. */
const renderSplit = async (page, position, orientation = 'horizontal') => {
    const kind = `split-${position}`;

    await page.evaluate(([id, previewObj]) => Neo.worker.App.setConfigs({id, dockPreview: previewObj}), [previewId, {
        ...buildPreview(kind),
        placement: {kind, orientation, ratio: 0.5}
    }]);

    await page.waitForSelector(`.neo-dock-preview-${kind}`, {state: 'attached', timeout: 4000});

    return page.evaluate(() => {
        const node = document.querySelector('.neo-dock-preview-affordance');

        if (!node) return {missing: true};

        const s = getComputedStyle(node);

        return {background: s.backgroundColor, opacity: s.opacity, cls: node.className}
    })
};

test.describe('Neo.dashboard.dock.interaction.Preview — what each edge region paints', () => {
    test('every edge paints a uniform border in both feedback states — the cut side is a class, never a width', async ({page}) => {
        // Both states carry their own border rule (solid accept, dashed reject), so a
        // state-scoped cut override would be invisible to a single-state matrix — each state
        // renders its full edge set and pins the uniform contract independently.
        for (const state of ['accepted', 'rejected']) {
            const rendered = {};

            for (const edge of EDGES) {
                rendered[edge] = await renderEdge(page, edge, state);
                expect(rendered[edge].missing, `${state}/${edge}: an affordance node must be rendered`).toBeFalsy()
            }

            // The property the original defect reports: one edge reading darker than its
            // siblings. A fill that differs between edges IS the bug, whatever produced it.
            const fills = EDGES.map(e => rendered[e].background);

            expect(new Set(fills).size, `${state}: fills must be identical across edges, got ${JSON.stringify(fills)}`).toBe(1);

            // Non-vacuity: a transparent fill everywhere would also collapse to one value while
            // rendering nothing. Pin that the fill is a real translucent colour.
            const fill = fills[0];

            expect(fill, `${state}: the fill must not be transparent`).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
            expect(fill, `${state}: the fill must carry alpha`).toMatch(/rgba\([^)]+,\s*0?\.\d+\)/);

            // Border, compared ACROSS edges — not merely within each one.
            //
            // An earlier revision asserted only that the four SIDES of a given edge shared a
            // colour. Every edge could satisfy that independently while differing from its
            // siblings, so the per-edge facts reduce to one normalized signature and the
            // SIGNATURES are compared. The border is UNIFORM by contract: the cut side survives
            // only as the stamped semantic class, never as a thicker edge.
            const signatures = EDGES.map(edge => {
                const r      = rendered[edge],
                      sides  = [r.borderTop, r.borderRight, r.borderBottom, r.borderLeft],
                      widths = new Set(sides.map(side => parseFloat(side.width))),
                      colors = new Set(sides.map(side => side.color));

                // Structure first: one shared width, one shared colour, and a real border —
                // without this the reduction below could collapse a broken edge into a tidy signature.
                expect(widths.size, `${state}/${edge}: all four border widths must match — no cut accent`).toBe(1);
                expect([...widths][0], `${state}/${edge}: the border must render`).toBeGreaterThan(0);
                expect(colors.size, `${state}/${edge}: all four border colours must match`).toBe(1);

                return `${[...colors][0]}|width:${[...widths][0]}`
            });

            expect(new Set(signatures).size,
                `${state}: border signature must be identical across edges, got ${JSON.stringify(signatures)}`).toBe(1);

            // Opacity is a whole-overlay multiplier; an edge-dependent value would darken one axis.
            expect(new Set(EDGES.map(e => rendered[e].opacity)).size, `${state}: opacity must not vary by edge`).toBe(1)
        }
    });

    test('a split placement paints the same translucent region, not the solid insertion bar', async ({page}) => {
        // The `.neo-dock-preview-split:not(.neo-dock-preview-region)` rule paints the accent colour
        // as a SOLID background — correct for a thin insertion guide, and exactly what "the border
        // colour with no transparency" looks like if a region-mode split ever reaches it. Region
        // mode is the default, so a split must land in the translucent family with the edges.
        const edge = await renderEdge(page, 'top');

        // BOTH positions, not one. `before` and `after` take different branches in
        // `affordanceGeometry` and carry inverted cut sides, so proving one says nothing about the
        // other — and `after` is the branch a right-hand drop actually produces.
        for (const position of ['before', 'after']) {
            const split = await renderSplit(page, position);

            expect(split.missing, `split-${position}: an affordance must render`).toBeFalsy();

            // The PAINT is asserted before the class that routes it. Ordered the other way, a mutant
            // that drops the region class fails on the class line and the colour assertion never runs —
            // red for the adjacent reason, leaving the property actually under test unproven.
            expect(split.background, `split-${position}: must not paint the solid accent bar`).toBe(edge.background);
            expect(split.background, `split-${position}: the fill must carry alpha`).toMatch(/rgba\([^)]+,\s*0?\.\d+\)/);
            expect(split.cls, `split-${position}: a region-mode split must carry the region class`).toContain('neo-dock-preview-region')
        }
    });

    test('a native hold paints a rising fill over the published dwell — and only while the clock is set', async ({page}) => {
        // The hold is the gesture on the native-titlebar path: the coordinator publishes `{armedAt,
        // durationMs}` with every hover frame and the writer sets it on the renderer before the
        // preview, so the affordance is built with the fill — duration from the clock, the time
        // already spent as a negative delay, so a node rebuilt mid-hold resumes rather than restarts.
        const read = () => page.evaluate(() => {
            const node = document.querySelector('.neo-dock-preview-affordance');

            if (!node) return {missing: true};

            const after = getComputedStyle(node, '::after');

            return {
                animation: after.animationName,
                cls      : node.className,
                delay    : after.animationDelay,
                duration : after.animationDuration,
                dwellMs  : node.style.getPropertyValue('--dock-native-dwell-ms'),
                elapsed  : node.style.getPropertyValue('--dock-native-dwell-elapsed')
            }
        });

        // the clock first, then the preview — the writer's order
        await page.evaluate(([id, previewObj]) => Neo.worker.App.setConfigs({
            id,
            dwell      : {armedAt: Date.now() - 400, durationMs: 1200},
            dockPreview: previewObj
        }), [previewId, buildPreview('edge-top')]);

        await page.waitForSelector('.neo-dock-preview-dwelling', {state: 'attached', timeout: 4000});

        const held = await read();

        expect(held.cls).toContain('neo-dock-preview-dwelling');
        expect(held.dwellMs, 'the fill runs for the published dwell').toBe('1200ms');
        expect(parseInt(held.elapsed, 10), 'the time already spent rides along').toBeGreaterThanOrEqual(400);
        expect(held.animation).toBe('neo-dock-preview-dwell-fill');
        expect(held.duration).toBe('1.2s');
        expect(parseFloat(held.delay), 'the elapsed time is applied as a negative delay').toBeLessThanOrEqual(-0.4);

        // reduced motion keeps the information and drops the motion
        await page.emulateMedia({reducedMotion: 'reduce'});

        const reduced = await read();

        expect(reduced.animation, 'reduced motion paints a static armed state').toBe('none');

        await page.emulateMedia({reducedMotion: 'no-preference'});

        // the clock clears: the same preview paints without the fill
        await page.evaluate(([id, previewObj]) => Neo.worker.App.setConfigs({id, dwell: null, dockPreview: previewObj}),
            [previewId, buildPreview('edge-left')]);

        await page.waitForSelector('.neo-dock-preview-edge-left', {state: 'attached', timeout: 4000});

        const released = await read();

        expect(released.cls).not.toContain('neo-dock-preview-dwelling');
        expect(released.animation).toBe('none')
    });

    test('each edge carries its own kind and cut classes', async ({page}) => {
        // Guards the fill assertions above: identical colours read off a node that never received
        // the per-edge classes would be a green that means nothing. The cut side is the INVERSE of
        // the edge — a left region's inner boundary is on its right.
        const inverse = {top: 'bottom', bottom: 'top', left: 'right', right: 'left'};

        for (const edge of EDGES) {
            const {cls} = await renderEdge(page, edge);

            expect(cls, `${edge}: the region mode class must be present`).toContain('neo-dock-preview-region');
            expect(cls, `${edge}: the per-edge kind class must be present`).toContain(`neo-dock-preview-edge-${edge}`);
            expect(cls, `${edge}: the cut side must be the inner edge`).toContain(`neo-dock-preview-cut-${inverse[edge]}`)
        }
    })
});
