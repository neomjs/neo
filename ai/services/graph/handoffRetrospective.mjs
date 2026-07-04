import {formatGoldenPathCapturedAt as formatGoldenPathTimestamp} from './goldenPathTimestamp.mjs';

/**
 * @module ai/services/graph/handoffRetrospective
 * @summary The handoff retrospective render surface — the HISTORY leg of the overview asymmetry
 * whose forecast leg is the direction-weather section. Answers "what happened since I last
 * looked" beside the Computed Golden Path's "what next", over staleness-adaptive grains.
 *
 * Render-only by construction: this module consumes pre-assembled window stats and renders a
 * bounded markdown section — it never aggregates, queries, or ranks (render ≠ memory). The
 * assembler that fills the stats contract is the caller's concern, exactly as the routing
 * sibling consumes pre-scored candidates.
 *
 * Firewall disposition (named because the handoff file is boot-consumed by agents as data):
 * this is a human-facing decision surface first; agents read it as catch-up FACTS, never as
 * routing. Two structural guarantees: this module's own template emits no numbered
 * `**issue-N**:` entries, and every INTERPOLATED display field passes
 * {@link sanitizeEventText} — single-line, emphasis-free — so neither a fake section heading
 * nor a parseable route entry can enter the handoff through event text. Content is bounded to
 * counts and public event references — private-tier material never enters the render.
 *
 * Honesty contract on numbers: every rendered count carries its declared filter set; a stats
 * payload WITHOUT declared filter sets renders the withheld state instead of naked counts — a
 * count whose filters are undeclared cannot be falsified and is invalid by construction (the
 * direction contract's falsifier-symmetry rule, applied to history).
 */

/**
 * @summary The supported retrospective grains. Monthly / per-release stay on the on-demand
 * synthesis path and are deliberately absent here.
 * @type {Object}
 */
export const RETROSPECTIVE_GRAINS = Object.freeze({
    DAILY    : Object.freeze({id: 'daily',  label: 'Daily',  windowHours: 24}),
    THREE_DAY: Object.freeze({id: '3-day',  label: '3-Day',  windowHours: 72}),
    WEEKLY   : Object.freeze({id: 'weekly', label: 'Weekly', windowHours: 168})
});

/**
 * @summary Density bound for named events — scale-to-a-glance, never a dump. Overflow renders
 * as a single "+ N more" line pointing at the substrate.
 * @type {Number}
 */
export const MAX_NAMED_EVENTS = 7;

/**
 * @summary Length bound for one interpolated display field — a headline is a phrase, never a
 * paragraph; oversized text is truncated with an ellipsis (display truncation, unlike request
 * intake, does not change any decision).
 * @type {Number}
 */
export const MAX_EVENT_TEXT_LENGTH = 160;

/**
 * @summary Normalizes interpolated display text so it can never carry route-parser structure.
 *
 * The orchestrator's handoff parser is line-oriented twice over: a `## Computed Golden Path`
 * HEADING match delimits the section, and a numbered `**issue-N**:` two-line shape matches
 * entries inside it. Both require line breaks to form — so collapsing every line break
 * (including the Unicode line/paragraph separators) into a single space kills heading injection
 * AND entry injection structurally, regardless of parser-regex details. Stripping `**`
 * additionally neutralizes the entry token itself as defense in depth. Applied to EVERY
 * interpolated field on this surface — event refs, headlines, filter-set ids — never to this
 * module's own template lines.
 * @param {*} value
 * @returns {String} single-line, heading-free, emphasis-free, length-bounded display text
 */
export function sanitizeEventText(value) {
    const text = String(value ?? '')
        .replace(/[\r\n\u2028\u2029]+/g, ' ')
        .replace(/#{2,}/g, '#')
        .replace(/\*\*/g, '')
        .trim();

    return text.length > MAX_EVENT_TEXT_LENGTH ? `${text.slice(0, MAX_EVENT_TEXT_LENGTH - 1)}…` : text
}

/**
 * @summary Selects the retrospective grain from reader staleness, with explicit override.
 *
 * Staleness-adaptive: a reader booting within a day and a half catches up on the daily grain;
 * booting after ~2 days lands on the 3-day digest; anything past four days reads the weekly.
 * An explicit valid override always wins; an invalid override falls back to staleness (the
 * render surface never throws — fail-open, like every consumer of the direction boundary).
 *
 * @param {Object} [options={}]
 * @param {Number} [options.hoursSinceLastSeen=0] Hours since the reader last consumed a handoff
 * @param {String} [options.override] Explicit grain id ('daily' | '3-day' | 'weekly')
 * @returns {Object} One of {@link RETROSPECTIVE_GRAINS}
 */
export function selectRetrospectiveGrain({hoursSinceLastSeen = 0, override} = {}) {
    if (override) {
        const match = Object.values(RETROSPECTIVE_GRAINS).find(grain => grain.id === override);

        if (match) return match;
    }

    const hours = Number.isFinite(Number(hoursSinceLastSeen)) ? Number(hoursSinceLastSeen) : 0;

    if (hours <= 36) return RETROSPECTIVE_GRAINS.DAILY;
    if (hours <= 96) return RETROSPECTIVE_GRAINS.THREE_DAY;

    return RETROSPECTIVE_GRAINS.WEEKLY
}

/**
 * @summary Renders one count line with its declared filter set — the only shape a number may
 * take on this surface.
 * @param {String} label Human-readable count label
 * @param {*} value Count value (non-finite renders as 0)
 * @param {String} filterSet The declared (pre-sanitized) filter set label
 * @returns {String}
 */
function renderCountLine(label, value, filterSet) {
    const count = Number.isFinite(Number(value)) ? Number(value) : 0;

    return `- ${label}: ${count} \`[filters: ${filterSet}]\``
}

/**
 * @summary Renders the handoff retrospective section for one window.
 *
 * States, mirroring the routing sibling's discipline: counts render ONLY under declared filter
 * sets (undeclared → the withheld honesty state); zero activity renders a bounded empty
 * diagnostic (readers must distinguish "quiet window" from "section forgot to render"); named
 * events cap at {@link MAX_NAMED_EVENTS} with an explicit overflow line; every interpolated
 * field passes {@link sanitizeEventText}.
 *
 * @param {Object} options
 * @param {Object} [options.grain=RETROSPECTIVE_GRAINS.DAILY] Selected grain (see `selectRetrospectiveGrain`)
 * @param {Object} [options.stats={}] Pre-assembled window stats:
 *   `{filterSets: String|String[], computedAt, counts: {mergedPrs, openedPrs, closedIssues,
 *   openedIssues, graduations, sessions}, topEvents: [{ref, headline, at}]}`
 * @param {Date|String} [options.capturedAt=new Date()] Handoff render timestamp
 * @returns {String} Markdown section
 */
export function renderHandoffRetrospectiveSection({
    grain      = RETROSPECTIVE_GRAINS.DAILY,
    stats      = {},
    capturedAt = new Date()
} = {}) {
    const
        header = [
            '',
            `## Handoff Retrospective (${grain?.label || 'Daily'} — what happened)`,
            '',
            `Captured at: ${formatGoldenPathTimestamp(capturedAt)}`
        ],
        footer = [
            '',
            'History surface only: no numbered immediate recommendation is rendered here; the Computed Golden Path section owns routing.',
            ''
        ],
        filterSets = [].concat(stats?.filterSets || [])
            .filter(entry => typeof entry === 'string' && entry.trim() !== '')
            .map(sanitizeEventText);

    if (filterSets.length === 0) {
        return header.concat([
            '',
            'Counts withheld: the window stats carry no declared filter set, and an unfalsifiable count never renders as fact.',
            'Re-run the assembler with `windowSemantics.filterSets` declared to surface this window.'
        ], footer).join('\n')
    }

    const
        filterSetLabel = filterSets.join(' + '),
        counts         = stats?.counts || {},
        countEntries   = [
            ['Merged PRs',    counts.mergedPrs],
            ['Opened PRs',    counts.openedPrs],
            ['Closed issues', counts.closedIssues],
            ['Opened issues', counts.openedIssues],
            ['Graduations',   counts.graduations],
            ['Sessions',      counts.sessions]
        ],
        totalActivity = countEntries.reduce((sum, [, value]) => sum + (Number.isFinite(Number(value)) ? Number(value) : 0), 0),
        events        = Array.isArray(stats?.topEvents) ? stats.topEvents.filter(event => event && (event.ref || event.headline)) : [];

    if (totalActivity === 0 && events.length === 0) {
        return header.concat([
            '',
            `Quiet window: no recorded activity in the last ${grain?.windowHours || 24}h under \`[filters: ${filterSetLabel}]\`.`,
            'This is an empty-state diagnostic for the retrospective surface, not a render failure.'
        ], footer).join('\n')
    }

    const body = [
        '',
        ...countEntries.map(([label, value]) => renderCountLine(label, value, filterSetLabel)),
        ''
    ];

    if (events.length > 0) {
        const named    = events.slice(0, MAX_NAMED_EVENTS);
        const overflow = events.length - named.length;

        body.push('Top events:', '');

        named.forEach(event => {
            const ref      = sanitizeEventText(event.ref);
            const headline = sanitizeEventText(event.headline) || 'unnamed event';
            const at       = event.at ? ` (${formatGoldenPathTimestamp(event.at)})` : '';

            body.push(`- ${ref ? `${ref} — ` : ''}${headline}${at}`)
        });

        if (overflow > 0) {
            body.push(`- … + ${overflow} more in this window (query the temporal substrate for depth)`)
        }

        body.push('');
    }

    if (stats?.computedAt) {
        body.push(`Stats computed at: ${formatGoldenPathTimestamp(stats.computedAt)} (freshness: render inherits assembler staleness)`, '')
    }

    return header.concat(body, footer).join('\n')
}
