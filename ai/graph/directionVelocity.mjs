import {parseBreakdownKey, UNATTRIBUTED_DIRECTION_KEY, validateConservation} from './directionSchema.mjs';

/**
 * @module ai/graph/directionVelocity
 * @summary The velocity composition: per-direction `{v_D, s_D, r_D}` aggregated FROM window-level
 * direction breakdowns, upward — never a second attribution pass, never a sibling pipeline
 * (attribute-then-aggregate is the disposed shape; aggregate-then-attribute was rejected as the
 * unfalsifiable class whose retroactive membership drift silently rewrites history).
 *
 * The three components, per the owner disposition:
 * - **v_D (velocity):** attributed MOTION measure per window — share × window motion count.
 * - **s_D (stall-mass):** attributed STALL measure through the SAME breakdown machinery, kept
 *   SEPARABLE — stalls never subtract into velocity, so "fast-but-bleeding" stays visible to the
 *   consumer that rejects rows on stall-mass alone.
 * - **r_D (regression / attribution flow):** the cross-window delta of a direction's SHARE —
 *   defined only across ≥2 windows with IDENTICAL filter sets (differing filters are a type
 *   error, not a number), null otherwise. Rate is about attention flow, not volume.
 *
 * Honesty plumbing on every emitted row: the `mappingVersion` + `filterSet` pins and a
 * `falsifyingQuery` composed from the SAME filters and version — one number, one filter, both
 * sides. Conservation is re-checked per window at this boundary (defense in depth over the
 * attribution pass), and unparseable window timestamps refuse loudly — a NaN comparison would
 * order garbage silently, the recurring falsifier class this family pre-empts by construction.
 */

/**
 * @summary The cardinality-probe threshold: when a record's breakdown bytes exceed this fraction
 * of the whole record, the disposition flips to a side-table layout.
 * @type {Number}
 */
export const BREAKDOWN_CARDINALITY_THRESHOLD = 0.20;

/**
 * @summary Probes one record's breakdown-vs-record byte ratio and returns the layout disposition.
 * Pure and deterministic — the caller supplies the serialized sizes it actually persists.
 * @param {Object} options
 * @param {Number} options.recordBytes Total serialized record size
 * @param {Number} options.breakdownBytes Serialized breakdown-map size
 * @returns {{disposition: 'inline'|'side-table', ratio: Number|null, reason: String|null}}
 */
export function probeBreakdownCardinality({recordBytes, breakdownBytes} = {}) {
    if (!Number.isFinite(recordBytes) || !Number.isFinite(breakdownBytes) || recordBytes <= 0 || breakdownBytes < 0) {
        return {disposition: 'side-table', ratio: null, reason: 'unmeasurable sizes fail toward the conservative layout'};
    }

    const ratio = breakdownBytes / recordBytes;

    return {
        disposition: ratio > BREAKDOWN_CARDINALITY_THRESHOLD ? 'side-table' : 'inline',
        ratio,
        reason     : null
    }
}

/**
 * @summary Validates one window input and normalizes it for composition. A window carries the
 * attribution pass's outputs for BOTH event classes: motion (velocity substrate) and stalls
 * (stall-mass substrate), each as a breakdown map plus its absolute event count.
 * @param {Object} window
 * @returns {{valid: Boolean, reason: String|null, window: Object|null}}
 */
function normalizeWindow(window) {
    if (window == null || typeof window !== 'object') {
        return {valid: false, reason: 'window must be an object', window: null};
    }

    const {windowId, since, until} = window;

    if (typeof windowId !== 'string' || windowId.trim() === '') {
        return {valid: false, reason: 'window requires a windowId', window: null};
    }

    for (const [name, value] of [['since', since], ['until', until]]) {
        if (!Number.isFinite(Date.parse(value))) {
            return {valid: false, reason: `window "${windowId}" has an unparseable ${name} — ordering would be vacuous`, window: null};
        }
    }

    const motionBreakdown = window.motionBreakdown || {};
    const stallBreakdown  = window.stallBreakdown  || {};
    const motionCount     = Number.isFinite(window.motionCount) ? window.motionCount : 0;
    const stallCount      = Number.isFinite(window.stallCount)  ? window.stallCount  : 0;

    // conservation re-check at the composition boundary, per event class with entries present
    for (const [label, breakdown, count] of [['motion', motionBreakdown, motionCount], ['stall', stallBreakdown, stallCount]]) {
        if (count > 0) {
            const conservation = validateConservation(breakdown);

            if (!conservation.valid) {
                return {valid: false, reason: `window "${windowId}" ${label} breakdown fails conservation: ${conservation.reason}`, window: null};
            }
        }
    }

    return {valid: true, reason: null, window: {windowId, since, until, motionBreakdown, stallBreakdown, motionCount, stallCount}}
}

/**
 * @summary Extracts the single mapping version used across a window's breakdown keys. Mixed
 * versions inside one window are a defect (a window is attributed under ONE mapping).
 * @param {Object[]} windows Normalized windows
 * @returns {{valid: Boolean, reason: String|null, mappingVersion: Number|null}}
 */
function extractMappingVersion(windows) {
    let version = null;

    for (const window of windows) {
        for (const breakdown of [window.motionBreakdown, window.stallBreakdown]) {
            for (const key of Object.keys(breakdown)) {
                if (key === UNATTRIBUTED_DIRECTION_KEY) continue;

                const parsed = parseBreakdownKey(key);

                if (version === null) {
                    version = parsed.mappingVersion;
                } else if (parsed.mappingVersion !== version) {
                    return {valid: false, reason: `mixed mapping versions across breakdown keys (${version} vs ${parsed.mappingVersion}) — compose per version, never across`, mappingVersion: null};
                }
            }
        }
    }

    return {valid: true, reason: null, mappingVersion: version}
}

/**
 * @summary Composes per-direction `{v_D, s_D, r_D}` rows from ordered window breakdowns.
 *
 * Fail-open at the row level, fail-closed at the contract level: malformed windows refuse the
 * whole composition with a reason (a velocity built on a bad window is worse than none), while
 * directions simply absent from a window contribute zero — absence is data.
 *
 * @param {Object} options
 * @param {Object[]} options.windows Chronologically intended window inputs (sorted internally by
 *   `since`): `{windowId, since, until, motionBreakdown, motionCount, stallBreakdown?, stallCount?}`
 * @param {String} options.filterSet The declared filter set ALL windows were attributed under —
 *   cross-window comparison is defined only within identical filter sets (type error otherwise;
 *   the caller passes ONE, and the falsifying queries pin it)
 * @returns {{valid: Boolean, reason: String|null, mappingVersion: Number|null, filterSet: String|null,
 *   rows: Object[]|null}} rows: one per direction key —
 *   `{directionKey, mappingVersion, filterSet, falsifyingQuery, perWindow: [{windowId, v, s, share}],
 *   v_D, s_D, r_D}` with `v_D`/`s_D` as summed absolute measures and `r_D` the share delta across
 *   the last two windows (null under 2 windows)
 */
export function composeVelocity({windows = [], filterSet} = {}) {
    if (typeof filterSet !== 'string' || filterSet.trim() === '') {
        return {valid: false, reason: 'composition requires the declared filterSet — an unpinned number cannot carry its falsifier', mappingVersion: null, filterSet: null, rows: null};
    }

    const normalized = [];

    for (const input of Array.isArray(windows) ? windows : []) {
        const result = normalizeWindow(input);

        if (!result.valid) {
            return {valid: false, reason: result.reason, mappingVersion: null, filterSet: null, rows: null};
        }

        normalized.push(result.window);
    }

    if (normalized.length === 0) {
        return {valid: false, reason: 'composition requires at least one window', mappingVersion: null, filterSet: null, rows: null};
    }

    const versionResult = extractMappingVersion(normalized);

    if (!versionResult.valid) {
        return {valid: false, reason: versionResult.reason, mappingVersion: null, filterSet: null, rows: null};
    }

    const ordered = [...normalized].sort((a, b) => Date.parse(a.since) - Date.parse(b.since));

    // the direction-key universe across all windows and both event classes
    const keys = new Set();

    for (const window of ordered) {
        Object.keys(window.motionBreakdown).forEach(key => keys.add(key));
        Object.keys(window.stallBreakdown).forEach(key => keys.add(key));
    }

    const rows = [];

    for (const key of [...keys].sort()) {
        const perWindow = ordered.map(window => {
            const motionShare = Number.isFinite(window.motionBreakdown[key]) ? window.motionBreakdown[key] : 0;
            const stallShare  = Number.isFinite(window.stallBreakdown[key])  ? window.stallBreakdown[key]  : 0;

            return Object.freeze({
                windowId: window.windowId,
                share   : motionShare,
                // absolute attributed measures: share × the window's event count per class.
                // v and s stay SEPARATE columns end to end — stalls never subtract into velocity.
                v: motionShare * window.motionCount,
                s: stallShare * window.stallCount
            })
        });

        const v_D = perWindow.reduce((sum, entry) => sum + entry.v, 0);
        const s_D = perWindow.reduce((sum, entry) => sum + entry.s, 0);

        // r_D: attribution flow — the SHARE delta across the last two windows (rate of attention,
        // not volume); defined only with ≥2 windows, null otherwise (never extrapolated).
        const r_D = ordered.length >= 2
            ? perWindow[perWindow.length - 1].share - perWindow[perWindow.length - 2].share
            : null;

        rows.push(Object.freeze({
            directionKey   : key,
            mappingVersion : versionResult.mappingVersion,
            filterSet,
            falsifyingQuery: `recompute {v,s,r} for "${key}" over windows [${ordered.map(w => w.windowId).join(', ')}] under filters [${filterSet}] at mapping v${versionResult.mappingVersion ?? 'n/a'} — any differing result falsifies this row`,
            perWindow      : Object.freeze(perWindow),
            v_D,
            s_D,
            r_D
        }));
    }

    return {
        valid         : true,
        reason        : null,
        mappingVersion: versionResult.mappingVersion,
        filterSet,
        rows          : Object.freeze(rows)
    }
}
