import {expect} from '@playwright/test';

/**
 * @summary Shared DOM-rect assertions for dock containers and drag affordances.
 *
 * Why this module exists: the drop-overlay geometry contract (overlays are dock-host-local)
 * shipped a viewport-rooted realization through a fully green suite — the
 * `tab-into` preview rendered −98px from its zone and the top edge chip painted inside the
 * tourbar — because no assertion ever read a rect. The flicker census cannot see a static
 * offset, so the only detector that fired was a human eye. These families make the geometry
 * contract mechanical.
 *
 * Discipline (binding):
 * - **Component ids, not class selectors.** Rects come from the Neural Link fixture's
 *   `getDomRect(componentIds)` — component identity survives restyling; classes do not.
 *   Transient painted nodes that are not components (the preview affordance vnode child)
 *   are read by the caller and passed in as pre-measured rects.
 * - **Containment and parity, never coordinate-space unification.** Explicit `screenX/Y`
 *   axes are intentionally mixed in Neo drag surfaces (one dock demo pairs source client
 *   coords with target-window screen coords — proven by a 21-call-site census of the drag
 *   surfaces). These families assert "inside" and "equal within tolerance", never
 *   "same coordinate space".
 * - **Mid-gesture is the assertion point.** The displacement was only visible while a drag
 *   was parked; end-state reads miss it (whitebox-e2e protocol §5.1).
 *
 * @see test/playwright/e2e/workstation/WorkstationDragAffordancesNL.spec.mjs
 * @see test/playwright/e2e/workstation/WorkstationFiveBeatNL.spec.mjs
 */

/**
 * Reads DOM rects for component ids through the Neural Link bridge.
 * @param {Object} app the connected neuralLink app wrapper
 * @param {String[]} ids component ids
 * @returns {Promise<Object>} map of id → rect {x, y, top, left, right, bottom, width, height}
 */
export async function readComponentRects(app, ids) {
    const rects = await app.getDomRect(ids);

    // The bridge returns either a bare array aligned to `ids` or an {id: rect} map; normalize.
    if (Array.isArray(rects)) {
        return Object.fromEntries(ids.map((id, index) => [id, rects[index]]))
    }

    return rects
}

/**
 * Strict rect-in-rect check with a small anti-rounding tolerance.
 * @param {Object} inner
 * @param {Object} outer
 * @param {Number} [tolerance=1]
 * @returns {Boolean}
 */
export function withinRect(inner, outer, tolerance = 1) {
    return inner.left   >= outer.left   - tolerance
        && inner.top    >= outer.top    - tolerance
        && inner.right  <= outer.right  + tolerance
        && inner.bottom <= outer.bottom + tolerance
}

/**
 * Rect intersection test (zero-area rects never intersect).
 * @param {Object} first
 * @param {Object} second
 * @returns {Boolean}
 */
export function intersectsRect(first, second) {
    return first.left < second.right
        && first.right > second.left
        && first.top < second.bottom
        && first.bottom > second.top
}

/**
 * Family 1 — the boot containment chain: the app's chrome bands tile the window without gaps
 * or overlaps, and the dock host owns everything below them. This is the chain the overlay
 * displacement broke: when the indicator layer rooted at the viewport instead of the host,
 * the header bands were the first surface it bled into.
 *
 * Asserts adjacency through tour, status and topology bars into the dock host (±1px),
 * and the dock host reaches the window's bottom edge.
 *
 * @param {Object} app the connected neuralLink app wrapper
 * @param {Object} ids {tourBarId, statusBarId, topologyBarId, dockHostId} component ids (the tour bar needs
 *   `reference: 'tour-bar'` on the workspace — added with this family)
 * @param {Object} [options] {viewportHeight} expected window inner height; omit to skip the
 *   bottom-edge leg (e.g. when the host's own bottom chrome is intentional)
 */
export async function assertBootContainmentChain(app, {tourBarId, statusBarId, topologyBarId, dockHostId}, {viewportHeight} = {}) {
    const rects    = await readComponentRects(app, [tourBarId, statusBarId, topologyBarId, dockHostId]),
          tour     = rects[tourBarId],
          status   = rects[statusBarId],
          topology = rects[topologyBarId],
          host     = rects[dockHostId];

    expect(tour?.height,   'tour bar must render with height').toBeGreaterThan(0);
    expect(status?.height, 'status bar must render with height').toBeGreaterThan(0);
    expect(topology?.height, 'topology bar must render with height').toBeGreaterThan(0);
    expect(host?.height,   'dock host must render with height').toBeGreaterThan(0);

    expect(Math.abs(tour.bottom - status.top),
        'tour bar and status bar must tile without gap or overlap').toBeLessThanOrEqual(1);
    expect(Math.abs(status.bottom - topology.top),
        'status bar and topology bar must tile without gap or overlap').toBeLessThanOrEqual(1);
    expect(Math.abs(topology.bottom - host.top),
        'topology bar and dock host must tile without gap or overlap').toBeLessThanOrEqual(1);

    if (viewportHeight !== undefined) {
        expect(Math.abs(host.bottom - viewportHeight),
            'the dock host owns everything below the chrome bands').toBeLessThanOrEqual(1)
    }

    return rects
}

/**
 * Family 2 — affordance containment: every painted indicator child and the painted preview
 * region stays inside the dock host. The 2026-07-26 regression's signature was the top edge
 * chip escaping into the tourbar; containment makes that shape impossible to re-ship silently.
 *
 * @param {Object} app the connected neuralLink app wrapper
 * @param {Object} geometry {dockHostId, indicatorIds, previewRect} — dockHost + indicator
 *   component ids (the seeded cross/chip children carry `candidateKey`), and the caller-read
 *   rect of the transient preview affordance node
 * @param {Number} [tolerance=1]
 */
export async function assertAffordanceContainment(app, {dockHostId, indicatorIds, previewRect}, tolerance = 1) {
    const rects = await readComponentRects(app, [dockHostId, ...indicatorIds]),
          host  = rects[dockHostId];

    for (const id of indicatorIds) {
        const rect = rects[id];

        if (!rect || rect.width === 0 || rect.height === 0) continue; // hidden (off) children have no paint

        expect(withinRect(rect, host, tolerance),
            `indicator ${id} must paint inside the dock host`).toBe(true)
    }

    if (previewRect) {
        expect(withinRect(previewRect, host, tolerance),
            'the painted preview region must stay inside the dock host').toBe(true)
    }

    return rects
}

/**
 * Family 3 — preview/zone alignment: the painted preview equals its target zone rect within
 * tolerance for `tab-into`, or occupies the named edge of the zone for edge previews — hugging
 * that edge, spanning the zone across it, and never floating free or extending past it.
 *
 * These are the relationships that hold whatever the preview LANGUAGE is. How thick a directional
 * placement paints is affordance policy: `Preview#resultRegionPreviews` paints the region the pane
 * would occupy, its predecessor painted a fixed insertion band, and the exact rect for either is
 * pinned per edge in `unit/dashboard/DockPreview.spec.mjs` against `affordanceGeometry`. This
 * helper asserted a thickness too, and that copy is the one that rotted: it kept the band budget
 * after the default became region mode, so the demo's own witness reported a red that named no
 * defect. A size contract belongs in one place, and this is not it.
 *
 * Known bound of the instrument: "a sub-region, not the whole zone" is expressed against the same
 * `tolerance` as every other comparison, so a placement occupying more than `1 - tolerance/extent`
 * of its zone reads as the whole thing — above roughly 0.993 on a 300px zone. `Preview` derives
 * that share from the affordance's own `ratio`, so a legitimate region near the extreme would be
 * refused here. Widening it means asserting the share, which is the size contract this helper
 * deliberately does not hold a copy of; raise the caller's `tolerance` for such a case instead.
 *
 * @param {Object} app the connected neuralLink app wrapper
 * @param {Object} geometry {zoneId, previewRect, kind: 'tab-into' | 'edge-top' | 'edge-right' | 'edge-bottom' | 'edge-left'}
 * @param {Number} [tolerance=2]
 */
export async function assertPreviewZoneAlignment(app, {zoneId, previewRect, kind}, tolerance = 2) {
    const rects = await readComponentRects(app, [zoneId]),
          zone  = rects[zoneId];

    expect(zone?.width, 'the target zone must be measurable').toBeGreaterThan(0);

    if (kind === 'tab-into') {
        for (const key of ['left', 'top', 'width', 'height']) {
            expect(Math.abs(previewRect[key] - zone[key]),
                `tab-into preview ${key} must equal the zone rect`).toBeLessThanOrEqual(tolerance)
        }
    } else {
        const edge = kind.replace('edge-', '');

        expect(withinRect(previewRect, zone, tolerance),
            'an edge preview never extends past its zone').toBe(true);

        const vertical = edge === 'top' || edge === 'bottom',
              // the axis the placement extends along, and the one it spans
              along    = vertical ? 'height' : 'width',
              across   = vertical ? 'width'  : 'height',
              anchor   = edge;

        // Spanning the zone across the edge is what makes it an EDGE placement rather than a box
        // that happens to sit near one. Neither preview language has ever painted less.
        expect(Math.abs(previewRect[across] - zone[across]),
            `the ${edge} placement spans the zone's ${across}`).toBeLessThanOrEqual(tolerance);

        // A placement, not the whole zone: `tab-into` is the affordance that claims everything, and
        // an edge preview that grew to fill its zone would be indistinguishable from it.
        expect(previewRect[along], `the ${edge} placement has a visible ${along}`).toBeGreaterThan(tolerance);
        expect(previewRect[along], `the ${edge} placement stays a sub-region of its zone`)
            .toBeLessThan(zone[along] - tolerance);

        expect(Math.abs(previewRect[anchor] - zone[anchor]),
            `the ${edge} placement hugs the zone's ${edge} edge`).toBeLessThanOrEqual(tolerance)
    }

    return rects
}

/**
 * Family 4 — chip/header exclusion: no painted indicator rect may intersect the tour bar.
 * The operator-visible half of the 2026-07-26 displacement (top chip at y=10..36 inside the
 * tourbar) is named directly here. Containment (family 2) implies this, but the exclusion is
 * asserted against the header explicitly so a boot-chain regression fails with the header in
 * the message, not a coordinate.
 *
 * @param {Object} app the connected neuralLink app wrapper
 * @param {Object} geometry {tourBarId, indicatorIds}
 */
export async function assertChipHeaderExclusion(app, {tourBarId, indicatorIds}) {
    const rects = await readComponentRects(app, [tourBarId, ...indicatorIds]),
          tour  = rects[tourBarId];

    for (const id of indicatorIds) {
        const rect = rects[id];

        if (!rect || rect.width === 0 || rect.height === 0) continue;

        expect(intersectsRect(rect, tour),
            `indicator ${id} must never overlap the tour bar`).toBe(false)
    }

    return rects
}
