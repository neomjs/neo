import {FLEET_COCKPIT_SOURCES} from '../../../../src/ai/fleet/fleetCockpitStatus.mjs';

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
        return {source: null, state: 'not-wired', confidence: 'none'}
    }

    const
        source     = Object.hasOwn(value, 'source') && typeof value.source === 'string' && value.source.trim()
            ? value.source.trim()
            : null,
        state      = Object.hasOwn(value, 'state') ? value.state : null,
        confidence = Object.hasOwn(value, 'confidence') ? value.confidence : null;

    if (!source || expectedSource && source !== expectedSource) {
        return {source, state: 'not-wired', confidence: 'none'}
    }

    if (state === 'missing') {
        return {source, state: 'missing', confidence: 'none'}
    }

    if (state === 'wired' && (confidence === 'observed' || confidence === 'inferred')) {
        return {source, state: 'wired', confidence}
    }

    return {source, state: 'not-wired', confidence: 'none'}
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
                runtime: {source: runtime.source, state: 'not-wired', confidence: 'none'}
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
