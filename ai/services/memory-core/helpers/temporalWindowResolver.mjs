const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @module ai/services/memory-core/helpers/temporalWindowResolver
 * @summary Pure window resolution for the temporal-pyramid dynamic-synthesis path — turns a caller's
 * `(partition, preset | explicit windowStart/windowEnd)` request into a validated **half-open**
 * `[windowStart, windowEnd)` interval with a declared filter-set.
 *
 * This is the deterministic front of the on-demand weekly / monthly / quarterly synthesis path: it decides
 * WHICH window to synthesize and nothing else — it never touches storage or inference and writes no durable
 * output. The named grains (weekly / monthly / quarterly) and the finer arbitrary grains (daily / 3-day)
 * resolve through the SAME path, and an arbitrary `(windowStart, windowEnd)` is a first-class call, not a
 * retrofit. Half-open boundaries keep adjacent windows non-overlapping: an event at exactly `windowEnd`
 * belongs to the next window, never to both.
 *
 * The reference clock is **injected** (`now`), never read internally — a synthesis run is deterministic and
 * replayable from its resolved window, so the same request against the same clock always resolves the same
 * interval. `filterSet` is carried on every result because cross-window comparisons are only defined within
 * an identical filter set (partition + grain); a comparison across differing filter sets is undefined, not
 * merely noisy.
 */

/**
 * The duration-based grain presets. Each names its pyramid tier where one exists — weekly/monthly/quarterly
 * are the L3/L4/L5 dynamic tiers; the finer daily/3-day grains are first-class arbitrary windows below the
 * pyramid and carry `tier: null`. Release (cut-to-cut) windows are NOT duration-based and resolve through a
 * separate release-boundary lookup, so they are deliberately absent from this pure duration map.
 * @type {Object<String, {durationMs: Number, tier: (String|null)}>}
 */
const TEMPORAL_WINDOW_PRESETS = Object.freeze({
    'daily'    : {durationMs:  1 * DAY_MS, tier: null},
    '3-day'    : {durationMs:  3 * DAY_MS, tier: null},
    'weekly'   : {durationMs:  7 * DAY_MS, tier: 'L3'},
    'monthly'  : {durationMs: 30 * DAY_MS, tier: 'L4'},
    'quarterly': {durationMs: 90 * DAY_MS, tier: 'L5'}
});

/**
 * @summary Returns the sorted list of supported grain presets (for callers / OpenAPI enums / diagnostics).
 * @returns {String[]}
 */
export function getTemporalWindowPresets() {
    return Object.keys(TEMPORAL_WINDOW_PRESETS)
}

/**
 * @summary Coerces a `Date` / ISO-8601 string / epoch-ms number to finite epoch milliseconds, or `null`.
 *
 * A pure boundary parser: it never invents a value. `null`/`undefined`/unparseable inputs return `null` so
 * the caller fails loud with a precise message rather than silently synthesizing a wrong window.
 * @param {Date|String|Number} value
 * @returns {Number|null}
 */
function toEpochMs(value) {
    if (value === undefined || value === null) return null;

    if (value instanceof Date) {
        const time = value.getTime();
        return Number.isFinite(time) ? time : null
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null
    }

    if (typeof value === 'string') {
        const time = Date.parse(value);
        return Number.isFinite(time) ? time : null
    }

    return null
}

/**
 * @summary Assembles the resolved-window descriptor shared by both the explicit and preset paths.
 * @param {Object} options
 * @param {String} options.partition Per-agent partition key, or `'unified'`.
 * @param {Number} options.start     Inclusive window start (epoch ms).
 * @param {Number} options.end       Exclusive window end (epoch ms).
 * @param {String|null} options.preset The named grain preset, or `null` for an explicit window.
 * @param {String|null} options.tier   The pyramid tier (`'L3'|'L4'|'L5'`), or `null` for finer/explicit windows.
 * @returns {Object} The resolved half-open window with declared filter-set semantics.
 */
function buildResolvedWindow({partition, start, end, preset, tier}) {
    return {
        partition,
        preset,
        tier,
        windowStart    : start,
        windowEnd      : end,
        windowStartIso : new Date(start).toISOString(),
        windowEndIso   : new Date(end).toISOString(),
        windowSemantics: {
            interval  : 'half-open',
            durationMs: end - start,
            filterSet : {grain: preset || 'explicit', partition}
        }
    }
}

/**
 * @summary Resolves a temporal synthesis request into a validated half-open `[windowStart, windowEnd)` window.
 *
 * Two mutually-exclusive request shapes, one path:
 * - **explicit** — supply `windowStart` and `windowEnd` (Date / ISO / epoch-ms); the window is used verbatim
 *   after validation. No `now` is needed.
 * - **preset** — supply a grain `preset` (see {@link getTemporalWindowPresets}); the window is `[now - grain,
 *   now)` and an injected `now` reference is REQUIRED (never read internally, so the run stays deterministic).
 *
 * Fails loud on every ambiguous or invalid request — an unparseable bound, a non-`start < end` interval, an
 * unknown preset, a preset without `now`, or a request that supplies neither shape — rather than synthesizing
 * a silently-wrong window.
 *
 * @param {Object} options
 * @param {String} [options.partition='unified'] Per-agent partition key, or `'unified'` for the cross-agent view.
 * @param {String} [options.preset]      A grain preset (`'daily'|'3-day'|'weekly'|'monthly'|'quarterly'`).
 * @param {Date|String|Number} [options.windowStart] Explicit inclusive start (mutually exclusive with `preset`).
 * @param {Date|String|Number} [options.windowEnd]   Explicit exclusive end.
 * @param {Date|String|Number} [options.now] Injected reference clock — REQUIRED for a preset window.
 * @returns {{partition: String, preset: (String|null), tier: (String|null), windowStart: Number, windowEnd: Number, windowStartIso: String, windowEndIso: String, windowSemantics: Object}}
 */
export function resolveTemporalWindow({partition = 'unified', preset, windowStart, windowEnd, now} = {}) {
    const hasExplicit = windowStart !== undefined || windowEnd !== undefined;

    if (hasExplicit) {
        if (preset !== undefined) {
            throw new Error('resolveTemporalWindow: pass EITHER a preset OR an explicit windowStart/windowEnd, not both')
        }

        const start = toEpochMs(windowStart),
              end   = toEpochMs(windowEnd);

        if (start === null || end === null) {
            throw new Error('resolveTemporalWindow: an explicit window needs a parseable windowStart AND windowEnd (Date / ISO-8601 / epoch-ms)')
        }

        if (!(start < end)) {
            throw new Error('resolveTemporalWindow: a half-open window requires windowStart < windowEnd')
        }

        return buildResolvedWindow({partition, start, end, preset: null, tier: null})
    }

    if (preset === undefined) {
        throw new Error('resolveTemporalWindow: supply either a preset or an explicit windowStart/windowEnd')
    }

    const presetDef = TEMPORAL_WINDOW_PRESETS[preset];

    if (!presetDef) {
        throw new Error(`resolveTemporalWindow: unknown grain preset "${preset}" (supported: ${getTemporalWindowPresets().join(', ')})`)
    }

    const nowMs = toEpochMs(now);

    if (nowMs === null) {
        throw new Error('resolveTemporalWindow: a preset window requires an injected `now` reference (Date / ISO-8601 / epoch-ms)')
    }

    return buildResolvedWindow({partition, start: nowMs - presetDef.durationMs, end: nowMs, preset, tier: presetDef.tier})
}
