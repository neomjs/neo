import {RETROSPECTIVE_GRAINS} from './handoffRetrospective.mjs';

/**
 * @module ai/services/graph/handoffRetrospectiveAssembler
 * @summary The retrospective ASSEMBLER — folds raw window facts into the stats contract that
 * {@link module:ai/services/graph/handoffRetrospective.renderHandoffRetrospectiveSection}
 * renders. The pure half of the history leg: no I/O, no clock of its own (the window anchor is
 * an argument), so it is exhaustively unit-testable and replayable, exactly as the direction
 * attribution pass is pure beneath its writer.
 *
 * Fact contract (each array holds `{ref, headline, at}`; `at` is an ISO string or Date):
 * `{mergedPrs, openedPrs, closedIssues, openedIssues, graduations, sessions}`. The assembler
 * windows each array by `at` against the grain, counts the survivors, and merges them into one
 * recency-ranked `topEvents` list — the render caps the display, so the assembler hands over a
 * bounded-but-generous slice rather than pre-truncating a single class.
 *
 * Filter-set honesty is preserved end to end: `filterSets` passes through to the render, which
 * refuses to show naked counts without it. The assembler NEVER invents a filter set — an
 * assembler that folds unfiltered facts must say so, or the render withholds.
 */

/**
 * @summary How many merged events to hand the render — a generous multiple of the render's own
 * display cap, so recency ranking happens over the real set, not a per-class pre-truncation.
 * @type {Number}
 */
export const TOP_EVENT_ASSEMBLY_LIMIT = 20;

/**
 * @summary The fact classes the assembler folds, paired with the count key the render expects
 * and the event-kind tag used in the merged top-events list.
 * @type {Array<{source: String, countKey: String, kind: String}>}
 */
const FACT_CLASSES = Object.freeze([
    {source: 'mergedPrs',    countKey: 'mergedPrs',    kind: 'merged-pr'},
    {source: 'openedPrs',    countKey: 'openedPrs',    kind: 'opened-pr'},
    {source: 'closedIssues', countKey: 'closedIssues', kind: 'closed-issue'},
    {source: 'openedIssues', countKey: 'openedIssues', kind: 'opened-issue'},
    {source: 'graduations',  countKey: 'graduations',  kind: 'graduation'},
    {source: 'sessions',     countKey: 'sessions',     kind: 'session'}
]);

/**
 * @summary Parses an event timestamp to epoch millis; unparseable / missing → NaN (excluded
 * from the window, never crashing the fold).
 * @param {String|Date|Number} at
 * @returns {Number}
 */
function toEpoch(at) {
    if (at instanceof Date) return at.getTime();
    if (typeof at === 'number') return Number.isFinite(at) ? at : NaN;
    if (typeof at === 'string') {
        const parsed = Date.parse(at);
        return Number.isNaN(parsed) ? NaN : parsed
    }
    return NaN
}

/**
 * @summary Folds raw window facts into the render's stats contract for one grain.
 *
 * Windowing rule: an event is in-window when its `at` is within `grain.windowHours` before
 * `now` (inclusive) and not in the future relative to `now`. Events with no parseable `at` are
 * excluded from counts AND top-events — an undateable fact cannot be placed in a window
 * honestly. When NO `filterSets` is supplied the contract still returns `filterSets: []`, which
 * the render turns into the withheld state — the assembler never fabricates a filter declaration.
 *
 * @param {Object} options
 * @param {Object} [options.facts={}] `{mergedPrs, openedPrs, closedIssues, openedIssues, graduations, sessions}`
 * @param {Object} [options.grain=RETROSPECTIVE_GRAINS.DAILY] One of the render's grains
 * @param {Date|String|Number} [options.now=new Date()] The window anchor (argument, never a clock read)
 * @param {String|String[]} [options.filterSets=[]] The declared filter set(s) the facts were gathered under
 * @returns {{filterSets: String[], computedAt: String, counts: Object, topEvents: Array<{ref, headline, at, kind}>}}
 */
export function assembleRetrospectiveStats({
    facts      = {},
    grain      = RETROSPECTIVE_GRAINS.DAILY,
    now        = new Date(),
    filterSets = []
} = {}) {
    const
        nowEpoch    = toEpoch(now),
        anchorEpoch = Number.isNaN(nowEpoch) ? Date.now() : nowEpoch,
        windowMs    = (grain?.windowHours || RETROSPECTIVE_GRAINS.DAILY.windowHours) * 3600 * 1000,
        lowerBound  = anchorEpoch - windowMs,
        counts      = {},
        allEvents   = [];

    for (const {source, countKey, kind} of FACT_CLASSES) {
        const raw = Array.isArray(facts?.[source]) ? facts[source] : [];

        const inWindow = raw.filter(event => {
            const epoch = toEpoch(event?.at);

            return !Number.isNaN(epoch) && epoch >= lowerBound && epoch <= anchorEpoch
        });

        counts[countKey] = inWindow.length;

        for (const event of inWindow) {
            allEvents.push({
                ref     : event.ref || '',
                headline: event.headline || event.title || '',
                at      : event.at,
                kind
            })
        }
    }

    const topEvents = allEvents
        .sort((a, b) => toEpoch(b.at) - toEpoch(a.at))
        .slice(0, TOP_EVENT_ASSEMBLY_LIMIT);

    return {
        filterSets: [].concat(filterSets).filter(entry => typeof entry === 'string' && entry.trim() !== ''),
        computedAt: (Number.isNaN(nowEpoch) ? new Date() : new Date(anchorEpoch)).toISOString(),
        counts,
        topEvents
    }
}
