import {FLEET_COCKPIT_SOURCES} from '../../config/cockpitSources.mjs';

/**
 * @summary Closed source-health contract shared by the Fleet cockpit's store-backed cards and
 * serializable dock blueprints. It preserves the DTO's roster / repo / runtime provenance while
 * failing malformed or contradictory input to `not-wired` + `none` — never to healthy fact.
 */

export const FLEET_SOURCE_KEYS = Object.freeze(['roster', 'repoStatus', 'runtime']);

const
    CARD_STATES         = Object.freeze(['ok', 'idle', 'wedged', 'limited', 'off']),
    FLEET_SOURCE_BY_KEY = Object.freeze({
        roster    : FLEET_COCKPIT_SOURCES.roster,
        repoStatus: FLEET_COCKPIT_SOURCES.repoStatus,
        runtime   : FLEET_COCKPIT_SOURCES.runtime
    });

/**
 * @summary Normalize one `fleetCockpitStatus` row-source fact onto the closed render vocabulary.
 * `missing` and `not-wired` cannot carry confidence; `wired` is usable only with `observed` or
 * `inferred`. When supplied, `expectedSource` closes the fact over its DTO-owned producer. Unknown,
 * inherited, malformed, cross-axis, and contradictory values fail closed.
 * @param {*} value Source-health input; malformed values fail closed.
 * @param {String|null} expectedSource Canonical producer literal for this source axis.
 * @returns {{source: String|null, state: String, confidence: String}}
 */
export function normalizeSourceFact(value, expectedSource = null) {
    if (!isPlainObject(value)) {
        return {source: null, state: 'not-wired', confidence: 'none', reason: null}
    }

    const
        source     = Object.hasOwn(value, 'source') && typeof value.source === 'string' && value.source.trim()
            ? value.source.trim()
            : null,
        state      = Object.hasOwn(value, 'state') ? value.state : null,
        confidence = Object.hasOwn(value, 'confidence') ? value.confidence : null,
        // the producer's retained cause survives normalization VERBATIM (trimmed): the abnormal
        // summary must name source AND reason, and a reason invented here would be a fabrication —
        // absent stays null. Carried on every branch: a fact failing closed keeps the cause that
        // explains WHY it failed closed.
        reason     = Object.hasOwn(value, 'reason') && typeof value.reason === 'string' && value.reason.trim()
            ? value.reason.trim()
            : null;

    if (!source || expectedSource && source !== expectedSource) {
        return {source, state: 'not-wired', confidence: 'none', reason}
    }

    if (state === 'missing') {
        return {source, state: 'missing', confidence: 'none', reason}
    }

    if (state === 'wired' && (confidence === 'observed' || confidence === 'inferred')) {
        return {source, state: 'wired', confidence, reason}
    }

    return {source, state: 'not-wired', confidence: 'none', reason}
}

/**
 * @summary Normalize one named Fleet source axis against its exact DTO producer. Unknown axes fail
 * closed rather than inheriting the generic source-fact behavior.
 * @param {String} sourceKey `roster` · `repoStatus` · `runtime`
 * @param {*} value Source-health input; malformed values fail closed.
 * @returns {{source: String|null, state: String, confidence: String}}
 */
export function normalizeFleetSourceFact(sourceKey, value) {
    return Object.hasOwn(FLEET_SOURCE_BY_KEY, sourceKey)
        ? normalizeSourceFact(value, FLEET_SOURCE_BY_KEY[sourceKey])
        : normalizeSourceFact(null)
}

/**
 * @summary Normalize the three per-row Fleet source facts. Extra future keys are ignored so this
 * card-grain contract can evolve independently from broader cockpit DTO capabilities.
 * @param {*} value Source collection; malformed values fail closed.
 * @returns {{roster: Object, repoStatus: Object, runtime: Object}}
 */
export function normalizeFleetSources(value) {
    const input = isPlainObject(value) ? value : {};

    return Object.fromEntries(FLEET_SOURCE_KEYS.map(key => [
        key,
        normalizeFleetSourceFact(key, Object.hasOwn(input, key) ? input[key] : null)
    ]))
}

/**
 * @summary Summarize the three normalized source facts into ONE honest word-line for the card's
 * source strip — the "no acronym wall" contract that retires the three 9px markers on the compact
 * card: all-wired → "all sources nominal"; otherwise NAME the abnormal source(s), action-owning
 * `runtime` first, with a `+N` overflow when several are degraded. Visible text names sources in
 * full words (Runtime / Repository / Roster) — the same names the accessible label carries, so the
 * card and the a11y tree never diverge. Summary and the (detail-view) markers agree by construction
 * — both read this same {@link #normalizeFleetSources} output, so the card can never summarize a
 * state the facts deny.
 * @param {*} value Source collection; malformed values fail closed (→ not-wired → named abnormal).
 * @returns {{level: String, text: String, ariaLabel: String}} `level` is `ok` (all nominal) or `bad`.
 */
export function summarizeFleetSources(value) {
    const
        sources = normalizeFleetSources(value),
        // directly-understandable full words, never opaque acronyms — the visible strip carries the
        // same names as the accessible label so no RUN/REP/ROS wall is reintroduced on the card
        labels  = {runtime: 'Runtime', repoStatus: 'Repository', roster: 'Roster'},
        // action-owning runtime first: the abnormal source the operator most needs named leads
        order    = ['runtime', 'repoStatus', 'roster'],
        abnormal = order.filter(key => sources[key].state !== 'wired');

    if (abnormal.length === 0) {
        return {level: 'ok', text: 'all sources nominal', ariaLabel: 'Source health: all sources nominal.'}
    }

    return buildAbnormalSummary(sources, abnormal, labels)
}

/**
 * @summary The strip's ANSWERED-abnormal summary — the one interpretation of `not-wired` shared
 * with the aggregate attention fold: a `missing` fact is a producer ANSWERING that something is
 * gone (renders, with its name and retained reason, and carries weight); `not-wired` is expected
 * absence (earns zero pixels here exactly as it carries zero weight there — rendering it was the
 * second permanent default-state line the operator verdict retired). Split from
 * {@link #summarizeFleetSources} so the legacy any-abnormal summary stays available to the
 * detail/drill surfaces that enumerate every fact.
 * @param {*} value Source collection; malformed values fail closed.
 * @returns {{level: String, text: String, ariaLabel: String}} `level` is `ok` (nothing answered
 *     abnormal — the strip renders nothing) or `bad`.
 */
export function summarizeAnsweredAbnormal(value) {
    const
        sources  = normalizeFleetSources(value),
        labels   = {runtime: 'Runtime', repoStatus: 'Repository', roster: 'Roster'},
        order    = ['runtime', 'repoStatus', 'roster'],
        abnormal = order.filter(key => sources[key].state === 'missing');

    if (abnormal.length === 0) {
        return {level: 'ok', text: '', ariaLabel: 'Source health: nothing answered abnormal.'}
    }

    return buildAbnormalSummary(sources, abnormal, labels)
}

/**
 * @summary Shared abnormal-line composer: leading source name (+N overflow) with the leading
 * source's retained reason when one exists — name-only otherwise, never a fabricated cause.
 * @param {Object} sources Normalized source facts.
 * @param {String[]} abnormal Abnormal keys, action-owning order.
 * @param {Object} labels Full-word labels.
 * @returns {{level: String, text: String, ariaLabel: String}}
 * @private
 */
function buildAbnormalSummary(sources, abnormal, labels) {

    const
        first = abnormal[0],
        extra = abnormal.length > 1 ? ` +${abnormal.length - 1}` : '',
        // the leading abnormal source's retained cause rides the line — name AND reason, the
        // operator-ratified bar for a rendered exception. A reasonless fact renders name-only
        // (never a fabricated cause); the text node downstream keeps the whole line inert.
        reason = sources[first].reason ? ` · ${sources[first].reason}` : '';

    return {
        level    : 'bad',
        text     : `${labels[first]} not nominal${extra}${reason}`,
        ariaLabel: `Source health: ${abnormal.map(key => labels[key]).join(', ')} not nominal.${sources[first].reason ? ` ${labels[first]}: ${sources[first].reason}.` : ''}`
    }
}

/**
 * @summary Normalize one DTO row's source facts and session state as one atomic honesty contract. A
 * lifecycle/runtime mismatch downgrades runtime provenance to `not-wired` + `none`, so downstream
 * cards cannot show `RUN OBSERVED` or enable controls while the lifecycle fact itself is unusable.
 * A matching stopped lifecycle remains a wired, honestly off session.
 * @param {*} lifecycle Lifecycle input; malformed values fail closed.
 * @param {*} sources Source collection; malformed values fail closed.
 * @returns {{sources: Object, state: String}}
 */
export function mapFleetSessionHealth(lifecycle, sources) {
    const
        normalizedSources = normalizeFleetSources(sources),
        runtime           = normalizedSources.runtime,
        downgradeRuntime  = () => ({
            sources: {
                ...normalizedSources,
                // the downgrade keeps the producer's retained cause — a fact failing closed keeps
                // the reason that explains why (the same rule normalizeSourceFact follows)
                runtime: {source: runtime.source, state: 'not-wired', confidence: 'none', reason: runtime.reason}
            },
            state: 'off'
        });

    if (runtime.state !== 'wired') {
        return {sources: normalizedSources, state: 'off'}
    }

    if (!isPlainObject(lifecycle)) {
        return downgradeRuntime()
    }

    const
        lifecycleSource = Object.hasOwn(lifecycle, 'source') && typeof lifecycle.source === 'string'
            ? lifecycle.source.trim()
            : null,
        state               = Object.hasOwn(lifecycle, 'state') ? lifecycle.state : null,
        lifecycleConfidence = Object.hasOwn(lifecycle, 'confidence') ? lifecycle.confidence : null;

    if (!lifecycleSource || lifecycleSource !== runtime.source || lifecycleConfidence !== runtime.confidence) {
        return downgradeRuntime()
    }

    if (state === 'running') {
        return {sources: normalizedSources, state: 'ok'}
    }

    if (state === 'stopped') {
        return {sources: normalizedSources, state: 'off'}
    }

    if (!CARD_STATES.includes(state)) {
        return downgradeRuntime()
    }

    return {sources: normalizedSources, state}
}

/**
 * @summary Resolve one roster row's display state as ONE atomic honesty contract shared by the
 * AgentCard and the HealthBar, so the card grain and the glance tally can never diverge.
 *
 * The vocabulary distinguishes participation truth from session truth, under one invariant:
 * **supervision vocabulary renders only where supervision exists (a wired runtime)** — the
 * operator-ratified default-state contract; un-managed is the NORMAL topology on FM-as-client
 * deployments and must never read as a supervision verdict or carry attention weight.
 * - **Wired runtime** → the row's `state` IS session truth (observed/inferred) and renders as-is —
 *   including `off` (`benched / offline`): a process Fleet manages and knows to be stopped.
 * - **Not-wired + `state: 'off'`** (and unknown / guest / missing rows, which are equally outside
 *   any supervision contract) → `external`: the seat runs in its own harness; Fleet manages
 *   nothing here, so no benched/offline verdict exists to claim. The previous mapping rendered
 *   these `off` — the falsified copy ("offline" about agents visibly merging PRs) this partition
 *   retires.
 * - **Not-wired + any other canonical state** → participation-active with NO session observation
 *   (the derived sample path) — renders `unobserved`: no liveness is claimed and no benched
 *   verdict is claimed. Rendering it `off` would be a false participation claim; rendering it
 *   `ok` would fabricate session liveness.
 * @param {Object} data
 * @param {String|null} [data.state] The row's raw state field.
 * @param {Object|null} [data.sources] The row's source facts (normalized here; malformed fails closed).
 * @returns {String} `ok` · `idle` · `wedged` · `limited` · `off` · `unobserved` · `external`
 */
export function resolveFleetDisplayState({state, sources} = {}) {
    if (normalizeFleetSources(sources).runtime.state === 'wired') {
        return state ?? 'off'
    }

    // unknown / guest / missing rows sit outside any supervision contract exactly like an
    // explicit un-managed `off` — both resolve `external` (the grid's raw-state tail tiering is
    // unaffected: it reads `agent.state`, never this display value).
    if (!CARD_STATES.includes(state) || state === 'off') {
        return 'external'
    }

    return 'unobserved'
}

/**
 * @summary Return only the session-state field from {@link mapFleetSessionHealth} for consumers
 * that do not persist the normalized source collection.
 * @param {*} lifecycle Lifecycle input; malformed values fail closed.
 * @param {*} sources Source collection; malformed values fail closed.
 * @returns {String} `ok` · `idle` · `wedged` · `limited` · `off`
 */
export function mapFleetSessionState(lifecycle, sources) {
    return mapFleetSessionHealth(lifecycle, sources).state
}

/**
 * @summary Return true only for own-key JSON-style objects; reject arrays, class instances, and
 * inherited/prototype-shaped input before it reaches the source-health contract.
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
