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

const buildPreview = kind => ({
    schema   : 'neo.dock.preview.v1',
    previewId: `preview:probe:main-tabs:${kind}`,
    itemId   : 'probe-item',
    source   : {surface: 'dashboard-sort-zone', sortZoneId: 'probe-zone'},
    target   : {containerId: 'workspace', nodeId: 'main-tabs'},
    placement: {kind, ratio: 0.5},
    feedback : {state: 'accepted'}
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
const renderEdge = async (page, edge) => {
    await page.evaluate(([id, previewObj]) => Neo.worker.App.setConfigs({id, dockPreview: previewObj}),
        [previewId, buildPreview(`edge-${edge}`)]);

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
    test('every edge paints the same translucent fill — only the cut border differs', async ({page}) => {
        const rendered = {};

        for (const edge of EDGES) {
            rendered[edge] = await renderEdge(page, edge);
            expect(rendered[edge].missing, `${edge}: an affordance node must be rendered`).toBeFalsy()
        }

        // The property the defect reports: one edge reading far darker than its siblings. A fill
        // that differs between edges IS the bug, whatever produced it.
        const fills = EDGES.map(e => rendered[e].background);

        expect(new Set(fills).size, `fills must be identical across edges, got ${JSON.stringify(fills)}`).toBe(1);

        // Non-vacuity: a transparent fill everywhere would also collapse to one value while
        // rendering nothing. Pin that the fill is a real translucent colour.
        const fill = fills[0];

        expect(fill, 'the fill must not be transparent').not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
        expect(fill, 'the fill must carry alpha — an opaque fill is the reported defect').toMatch(/rgba\([^)]+,\s*0?\.\d+\)/);

        // Border, compared ACROSS edges — not merely within each one.
        //
        // An earlier revision asserted only that the four SIDES of a given edge shared a colour.
        // Every edge could satisfy that independently while differing from its siblings: a
        // right-only border colour, or a width that changes with the axis, stayed green. AC-1 asks
        // for equality across edges, so the per-edge facts are reduced to one normalized signature
        // and the SIGNATURES are compared. The border is UNIFORM by contract: the cut
        // side survives only as the stamped semantic class, never as a thicker edge — an
        // asymmetric width reads as a rendering glitch, and the region fill already shows where
        // the splitter lands.
        const signatures = EDGES.map(edge => {
            const r      = rendered[edge],
                  sides  = [r.borderTop, r.borderRight, r.borderBottom, r.borderLeft],
                  widths = new Set(sides.map(side => parseFloat(side.width))),
                  colors = new Set(sides.map(side => side.color));

            // Structure first: one shared width, one shared colour, and a real border. Without
            // this the reduction below could collapse a genuinely broken edge into a tidy signature.
            expect(widths.size, `${edge}: all four border widths must match — no cut accent`).toBe(1);
            expect([...widths][0], `${edge}: the border must render`).toBeGreaterThan(0);
            expect(colors.size, `${edge}: all four border colours must match`).toBe(1);

            return `${[...colors][0]}|width:${[...widths][0]}`
        });

        expect(new Set(signatures).size,
            `border signature must be identical across edges, got ${JSON.stringify(signatures)}`).toBe(1);

        // Opacity is a multiplier on the whole overlay; an edge-dependent value would darken one axis.
        expect(new Set(EDGES.map(e => rendered[e].opacity)).size, 'opacity must not vary by edge').toBe(1)
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
