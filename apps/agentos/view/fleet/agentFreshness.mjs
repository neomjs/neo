/**
 * @summary The FM cockpit detail-pane freshness ledger — the render-correctness contract at
 * pane grain: a mutable claim renders WITH its observation time + freshness, and a claim with no
 * live observation renders honestly as `unobserved`, NEVER as a silently-current one. Pure and
 * `now`-injected (no argless `new Date()` — clock-brittle under test); fail-closed toward
 * "we don't know" exactly like the sibling {@link module:apps/agentos/view/fleet/sourceHealth}
 * source contract.
 *
 * The detail view's panes (lane · activity · PRs · thought-stream) each declare their own
 * `freshnessTtl` (their honest live cadence) and, once their Lane-C / memory-surface feed leaf
 * lands, stamp an `observedAt`. Until a feed wires `observedAt`, a pane
 * degrades to `unobserved` — so the view is honest TODAY and sharpens to timestamped
 * fresh/stale/lost automatically when a feed wires the ledger, with no view change. Every rendered
 * claim stays `notAuthority` (witness, not decision authority); this contract only decides how fresh a claim is,
 * never whether it is authoritative.
 *
 * @module apps/agentos/view/fleet/agentFreshness
 */

/**
 * The closed freshness vocabulary. `fresh` / `stale` / `lost` classify a REAL observation by age
 * vs its TTL; `unobserved` is the honest no-live-source state — never a fabricated current claim.
 * @type {String[]}
 */
export const FRESHNESS_CLASSES = Object.freeze(['fresh', 'stale', 'lost', 'unobserved']);

/**
 * How many TTLs past its freshness window an observation is treated as `lost` rather than merely
 * `stale`: a stale claim is old-but-still-shown; a lost claim is too old to stand as evidence.
 * @type {Number}
 * @private
 */
const LOST_TTL_FACTOR = 4;

/**
 * @summary Classify one pane's freshness from its ledger, honestly. An observation is `fresh`
 * within its TTL, `stale` past it, and `lost` past `LOST_TTL_FACTOR × TTL` (or on an explicit
 * source-reported `lost`). Anything we cannot place in time — no parseable `observedAt`, no finite
 * `now`, or no positive `freshnessTtl` — is `unobserved`, the fail-closed default that never reads
 * as current. A future/skewed observation clamps to `fresh` (skew resolves toward honesty, not a
 * false "stale").
 * @param {Object|null} ledger
 * @param {String|null} [ledger.observedAt] ISO-8601 observation time (the feed stamps it).
 * @param {Number|null} [ledger.freshnessTtl] The pane's live-cadence window, in ms.
 * @param {Boolean} [ledger.lost] An explicit source-reported loss (overrides age).
 * @param {Number|null} now Injected wall-clock ms (`Date.now()` at the call site; tests pin it).
 * @returns {{freshness: String, observedAt: (String|null), ageMs: (Number|null)}}
 */
export function classifyPaneFreshness(ledger, now) {
    if (!isPlainObject(ledger)) {
        return {freshness: 'unobserved', observedAt: null, ageMs: null}
    }

    const
        observedAt   = typeof ledger.observedAt === 'string' ? ledger.observedAt : null,
        freshnessTtl = Number.isFinite(ledger.freshnessTtl) && ledger.freshnessTtl > 0 ? ledger.freshnessTtl : null,
        observedMs   = observedAt ? Date.parse(observedAt) : NaN;

    // an explicit source-reported loss beats any age math — the source told us the claim is gone
    if (ledger.lost === true) {
        return {freshness: 'lost', observedAt, ageMs: null}
    }

    // a claim we cannot place in time is never rendered as current — degrade to honest unobserved
    if (!Number.isFinite(observedMs) || !Number.isFinite(now) || freshnessTtl === null) {
        return {freshness: 'unobserved', observedAt, ageMs: null}
    }

    const ageMs = now - observedMs;

    if (ageMs <= freshnessTtl) {
        return {freshness: 'fresh', observedAt, ageMs}
    }

    if (ageMs <= freshnessTtl * LOST_TTL_FACTOR) {
        return {freshness: 'stale', observedAt, ageMs}
    }

    return {freshness: 'lost', observedAt, ageMs}
}

/**
 * @summary The render half: map a classification to its freshness cls + human label. `fresh` shows
 * the relative observation age, `stale` shows it with the state word, `lost` states the claim is
 * too old to trust, and `unobserved` states plainly that no live source has reported — the honest
 * empty, never a blank that could read as current. The cls tokens (`is-fresh` / `is-stale` /
 * `is-lost` / `is-unobserved`) are the only styling surface; color/motion live in SCSS tokens.
 * @param {{freshness: String, ageMs: (Number|null)}} classification From {@link classifyPaneFreshness}.
 * @returns {{freshness: String, cls: String[], label: String}}
 */
export function describePaneFreshness({freshness, ageMs} = {}) {
    const relative = Number.isFinite(ageMs) ? formatAge(ageMs) : null;

    switch (freshness) {
        case 'fresh':
            return {freshness, cls: ['fm-freshness', 'is-fresh'], label: relative ? `updated ${relative}` : 'live'};
        case 'stale':
            return {freshness, cls: ['fm-freshness', 'is-stale'], label: relative ? `stale · last seen ${relative}` : 'stale'};
        case 'lost':
            return {freshness, cls: ['fm-freshness', 'is-lost'], label: 'lost — no recent observation'};
        default:
            return {freshness: 'unobserved', cls: ['fm-freshness', 'is-unobserved'], label: 'not observed — source not wired'}
    }
}

/**
 * @summary Compact relative-age label from a millisecond age. Pure; negative (future / clock-skew)
 * ages clamp to `0s ago` rather than rendering a nonsensical future time.
 *
 * Exported as a shared chrome primitive: pane freshness and the viewer-wake telltale
 * ({@link module:apps/agentos/view/fleet/viewerWakeTelltale}) must word relative ages identically —
 * one formatter, two consumers, no drift.
 * @param {Number} ageMs
 * @returns {String}
 */
export function formatAge(ageMs) {
    const seconds = Math.max(0, Math.floor(ageMs / 1000));

    if (seconds < 60) {
        return `${seconds}s ago`
    }

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) {
        return `${minutes}m ago`
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
        return `${hours}h ago`
    }

    return `${Math.floor(hours / 24)}d ago`
}

/**
 * @summary Return true only for own-key JSON-style objects; reject arrays, class instances, and
 * inherited/prototype-shaped input before it reaches the ledger contract — the same fail-closed
 * guard the sibling source-health contract uses.
 * @param {*} value
 * @returns {Boolean}
 * @private
 */
function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null
}
