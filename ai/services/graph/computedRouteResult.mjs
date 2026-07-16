/**
 * @module ai/services/graph/computedRouteResult
 * @summary The typed `computed-route.v1` contract returned by the canonical Golden Path pass.
 *
 * Owner contract: define the ONE machine-readable result the canonical `GoldenPathSynthesizer`
 * pass returns before any renderer runs, so every consumer (the handoff renderer,
 * `AgentOrchestrator`, and the Live-Lane-Awareness projection channel) reads a typed object
 * instead of reparsing `## Computed Golden Path` Markdown. The failure mode this replaces: the
 * selected route stayed method-local, so `AgentOrchestrator.parseGoldenPath()` recovered it by
 * running regular expressions over the rendered Markdown — a route that could silently drift
 * from the pass that produced it.
 *
 * Two entry points with deliberately opposite failure postures:
 * - {@link buildComputedRouteResult} is the PRODUCER factory. It **throws** on any contract
 *   violation — a malformed route is a `GoldenPathSynthesizer` bug and must fail loud, never
 *   emit a plausible-but-wrong object.
 * - {@link validateComputedRouteResult} is the CONSUMER guard. It **returns** `{valid, errors}`
 *   without throwing, so a hook/orchestrator receiving a bad envelope degrades to bare policy
 *   (fail-open) rather than crashing the turn.
 *
 * The core invariants are enforced at construction, not by convention:
 *   1. `route.items` is the only executable slot; `advisoryFallback.items` can never make an
 *      empty route routed (the slots are structurally separate and never merged here).
 *   2. `current-focus-substitution` is explicit — the caller passes `route.kind`; this module
 *      never infers a substitution from prose or from item counts.
 *   3. `status` is independent of item count — it is a required argument and is never derived
 *      from `route.items.length`; a missing/degraded route is never normalized to empty.
 *   4. Route identity `{routeVersion, sourceManifestHash, sourceWatermark}` is required; a
 *      consumer may cite or cache it but may not recompute it.
 */

/**
 * @summary The schema version stamped on every `ComputedRouteResult`.
 * @type {String}
 */
export const COMPUTED_ROUTE_SCHEMA_VERSION = 'computed-route.v1';

/**
 * @summary Valid top-level route statuses. Independent of item count.
 * @type {Set<String>}
 */
export const COMPUTED_ROUTE_STATUSES = Object.freeze(new Set([
    'fresh',
    'empty',
    'missing',
    'stale',
    'degraded'
]));

/**
 * @summary Valid `route.kind` values. `none` carries no executable items; both
 * `computed-ranked` and `current-focus-substitution` carry an executable route.
 * @type {Set<String>}
 */
export const COMPUTED_ROUTE_KINDS = Object.freeze(new Set([
    'computed-ranked',
    'current-focus-substitution',
    'none'
]));

/**
 * @summary Valid `advisoryFallback.status` values. The advisory slot is declared-intent context
 * and is never executable.
 * @type {Set<String>}
 */
export const ADVISORY_FALLBACK_STATUSES = Object.freeze(new Set([
    'available',
    'empty',
    'not-applicable',
    'degraded'
]));

/**
 * @summary Valid `freshness.status` values.
 * @type {Set<String>}
 */
export const FRESHNESS_STATUSES = Object.freeze(new Set([
    'fresh',
    'stale',
    'unverifiable'
]));

/**
 * @summary Route kinds that carry an executable `route.items` list.
 * @type {Set<String>}
 */
const EXECUTABLE_ROUTE_KINDS = Object.freeze(new Set([
    'computed-ranked',
    'current-focus-substitution'
]));

/**
 * @summary Asserts a value is a plain object (not null, not an array).
 * @param {*} value
 * @param {String} label Field name for the thrown message.
 * @throws {TypeError} When `value` is not a plain object.
 */
function assertPlainObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`[computedRouteResult] ${label} must be a plain object.`)
    }
}

/**
 * @summary Asserts a value is a non-empty string.
 * @param {*} value
 * @param {String} label Field name for the thrown message.
 * @throws {TypeError} When `value` is not a non-empty string.
 */
function assertNonEmptyString(value, label) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(`[computedRouteResult] ${label} must be a non-empty string.`)
    }
}

/**
 * @summary Normalizes a route item to the `{id, title, score, rank, citations}` shape, validating
 * the identity fields. Item order/rank is the caller's; this only enforces shape.
 * @param {Object} item
 * @param {Number} index Position, used only for error messages.
 * @returns {Object} A frozen route item.
 * @throws {TypeError} When `id`/`title` are missing.
 */
function normalizeRouteItem(item, index) {
    assertPlainObject(item, `route.items[${index}]`);
    assertNonEmptyString(item.id, `route.items[${index}].id`);
    assertNonEmptyString(item.title, `route.items[${index}].title`);

    return Object.freeze({
        id       : item.id,
        title    : item.title,
        score    : typeof item.score === 'number' ? item.score : null,
        rank     : typeof item.rank === 'number' ? item.rank : (index + 1),
        citations: Object.freeze(Array.isArray(item.citations) ? [...item.citations] : [])
    })
}

/**
 * @summary Normalizes an advisory (declared-intent) item to `{id, title, citations}`.
 * @param {Object} item
 * @param {Number} index Position, used only for error messages.
 * @returns {Object} A frozen advisory item.
 * @throws {TypeError} When `id`/`title` are missing.
 */
function normalizeAdvisoryItem(item, index) {
    assertPlainObject(item, `advisoryFallback.items[${index}]`);
    assertNonEmptyString(item.id, `advisoryFallback.items[${index}].id`);
    assertNonEmptyString(item.title, `advisoryFallback.items[${index}].title`);

    return Object.freeze({
        id       : item.id,
        title    : item.title,
        citations: Object.freeze(Array.isArray(item.citations) ? [...item.citations] : [])
    })
}

/**
 * @summary Builds a validated, frozen `computed-route.v1` `ComputedRouteResult`.
 *
 * This is the producer-side factory: it fails LOUD on any contract violation so a malformed
 * canonical pass never emits a plausible-but-wrong route. `status`, `route.kind`,
 * `advisoryFallback.status`, and `freshness.status` are required and validated against their
 * enums — there are no hidden defaults that could mask a producer bug.
 *
 * @param {Object}   params
 * @param {String}   params.status One of {@link COMPUTED_ROUTE_STATUSES}. Never inferred from item count.
 * @param {String}   params.capturedAt ISO timestamp the pass captured its inputs.
 * @param {String}   params.sourceWatermark Monotonic watermark of the scored source set (route identity).
 * @param {String}   params.expiresAt ISO timestamp after which this route is stale.
 * @param {String}   params.routeVersion Route-version token (route identity).
 * @param {String}   params.sourceManifestHash Content hash of the scored manifest (route identity).
 * @param {Object}   params.provenance `{producer, runId, algorithmVersion, citations}`.
 * @param {Object}   params.freshness `{status, checkedAt, expiresAt}`.
 * @param {Object}   params.route `{kind, items}` — `kind` is explicit; `computed-ranked`/`current-focus-substitution` carry items, `none` carries none.
 * @param {Object}   [params.advisoryFallback] `{kind:'declared-intent', status, items}` context; never executable.
 * @param {Object}   [params.probe=null] `{query, ranAt}` falsifying query for an empty/substitution
 *   route — the exact query whose non-empty result would falsify a "starved" claim; `null` when the
 *   producer has not wired a falsifier (the claim renders honestly as unwired).
 * @param {Array}    [params.citations=[]] Top-level citations.
 * @returns {Object} A deeply-frozen `ComputedRouteResult`.
 * @throws {TypeError|RangeError} On any contract violation.
 */
export function buildComputedRouteResult({
    status,
    capturedAt,
    sourceWatermark,
    expiresAt,
    routeVersion,
    sourceManifestHash,
    provenance,
    freshness,
    route,
    advisoryFallback,
    probe            = null,
    citations        = []
} = {}) {
    if (!COMPUTED_ROUTE_STATUSES.has(status)) {
        throw new RangeError(`[computedRouteResult] status must be one of ${[...COMPUTED_ROUTE_STATUSES].join(', ')}; got ${JSON.stringify(status)}.`)
    }

    assertNonEmptyString(capturedAt,         'capturedAt');
    // Route identity — required, never derivable by a consumer.
    assertNonEmptyString(sourceWatermark,    'sourceWatermark');
    assertNonEmptyString(expiresAt,          'expiresAt');
    assertNonEmptyString(routeVersion,       'routeVersion');
    assertNonEmptyString(sourceManifestHash, 'sourceManifestHash');

    assertPlainObject(provenance, 'provenance');
    assertNonEmptyString(provenance.producer, 'provenance.producer');

    assertPlainObject(freshness, 'freshness');
    if (!FRESHNESS_STATUSES.has(freshness.status)) {
        throw new RangeError(`[computedRouteResult] freshness.status must be one of ${[...FRESHNESS_STATUSES].join(', ')}; got ${JSON.stringify(freshness.status)}.`)
    }

    assertPlainObject(route, 'route');
    if (!COMPUTED_ROUTE_KINDS.has(route.kind)) {
        throw new RangeError(`[computedRouteResult] route.kind must be one of ${[...COMPUTED_ROUTE_KINDS].join(', ')}; got ${JSON.stringify(route.kind)}.`)
    }

    const rawItems   = Array.isArray(route.items) ? route.items : [];
    const routeItems = rawItems.map(normalizeRouteItem);

    // The executable slot is structural: `none` is empty, an executable kind is non-empty. This
    // is not a status normalization; `status` stays exactly as the caller passed it.
    if (route.kind === 'none' && routeItems.length > 0) {
        throw new RangeError('[computedRouteResult] route.kind "none" must carry zero route.items (advisory context is a separate slot).')
    }
    if (EXECUTABLE_ROUTE_KINDS.has(route.kind) && routeItems.length === 0) {
        throw new RangeError(`[computedRouteResult] route.kind "${route.kind}" must carry at least one route.item; use kind "none" for an empty route.`)
    }

    let advisory = null;
    if (advisoryFallback !== undefined && advisoryFallback !== null) {
        assertPlainObject(advisoryFallback, 'advisoryFallback');
        if (advisoryFallback.kind !== 'declared-intent') {
            throw new RangeError(`[computedRouteResult] advisoryFallback.kind must be "declared-intent"; got ${JSON.stringify(advisoryFallback.kind)}.`)
        }
        if (!ADVISORY_FALLBACK_STATUSES.has(advisoryFallback.status)) {
            throw new RangeError(`[computedRouteResult] advisoryFallback.status must be one of ${[...ADVISORY_FALLBACK_STATUSES].join(', ')}; got ${JSON.stringify(advisoryFallback.status)}.`)
        }

        const advisoryItems = (Array.isArray(advisoryFallback.items) ? advisoryFallback.items : []).map(normalizeAdvisoryItem);

        advisory = Object.freeze({
            kind  : 'declared-intent',
            status: advisoryFallback.status,
            items : Object.freeze(advisoryItems)
        })
    }

    let probeValue = null;
    if (probe !== undefined && probe !== null) {
        assertPlainObject(probe, 'probe');
        assertNonEmptyString(probe.query, 'probe.query');
        assertNonEmptyString(probe.ranAt, 'probe.ranAt');
        probeValue = Object.freeze({query: probe.query, ranAt: probe.ranAt})
    }

    return Object.freeze({
        schemaVersion: COMPUTED_ROUTE_SCHEMA_VERSION,
        status,
        capturedAt,
        sourceWatermark,
        expiresAt,
        routeVersion,
        sourceManifestHash,

        provenance: Object.freeze({
            producer        : provenance.producer,
            runId           : typeof provenance.runId === 'string' ? provenance.runId : null,
            algorithmVersion: typeof provenance.algorithmVersion === 'string' ? provenance.algorithmVersion : null,
            citations       : Object.freeze(Array.isArray(provenance.citations) ? [...provenance.citations] : [])
        }),

        freshness: Object.freeze({
            status   : freshness.status,
            checkedAt: typeof freshness.checkedAt === 'string' ? freshness.checkedAt : null,
            expiresAt: typeof freshness.expiresAt === 'string' ? freshness.expiresAt : expiresAt
        }),

        route: Object.freeze({
            kind : route.kind,
            items: Object.freeze(routeItems)
        }),

        advisoryFallback: advisory,

        probe       : probeValue,
        citations   : Object.freeze(Array.isArray(citations) ? [...citations] : []),
        notAuthority: true
    })
}

/**
 * @summary Consumer-side guard: validates an object against the `computed-route.v1` contract
 * WITHOUT throwing, so a consumer degrades to bare policy (fail-open) on a bad envelope instead
 * of crashing the turn.
 * @param {*} result The object to validate (may be anything — a torn read, legacy shape, etc.).
 * @returns {{valid: Boolean, errors: String[]}}
 */
export function validateComputedRouteResult(result) {
    const errors = [];

    if (!result || typeof result !== 'object' || Array.isArray(result)) {
        return {valid: false, errors: ['result is not a plain object']}
    }
    if (result.schemaVersion !== COMPUTED_ROUTE_SCHEMA_VERSION) {
        errors.push(`schemaVersion must be "${COMPUTED_ROUTE_SCHEMA_VERSION}"; got ${JSON.stringify(result.schemaVersion)}`)
    }
    if (!COMPUTED_ROUTE_STATUSES.has(result.status)) {
        errors.push(`status must be one of ${[...COMPUTED_ROUTE_STATUSES].join(', ')}`)
    }
    if (result.notAuthority !== true) {
        errors.push('notAuthority must be true')
    }

    const route = result.route;
    if (!route || typeof route !== 'object' || Array.isArray(route)) {
        errors.push('route must be a plain object')
    } else {
        if (!COMPUTED_ROUTE_KINDS.has(route.kind)) {
            errors.push(`route.kind must be one of ${[...COMPUTED_ROUTE_KINDS].join(', ')}`)
        }
        const items = Array.isArray(route.items) ? route.items : null;
        if (items === null) {
            errors.push('route.items must be an array')
        } else if (route.kind === 'none' && items.length > 0) {
            errors.push('route.kind "none" must carry zero route.items')
        } else if (EXECUTABLE_ROUTE_KINDS.has(route.kind) && items.length === 0) {
            errors.push(`route.kind "${route.kind}" must carry at least one route.item`)
        }
    }

    for (const field of ['routeVersion', 'sourceManifestHash', 'sourceWatermark']) {
        if (typeof result[field] !== 'string' || result[field].length === 0) {
            errors.push(`${field} (route identity) must be a non-empty string`)
        }
    }

    return {valid: errors.length === 0, errors}
}

/**
 * @summary Computes a deterministic, order-independent manifest hash over a set of source ids —
 * the `sourceManifestHash` component of route identity. Two passes over the same set of scored
 * sources produce the same hash regardless of ranking order or duplicate submissions; any change
 * to the set changes the hash. Uses FNV-1a over the deduplicated, sorted id list.
 * @param {String[]} ids Source ids in the scored manifest (route ranking order is irrelevant here).
 * @returns {String} An 8-char lowercase hex digest. The empty set has a stable digest.
 */
export function computeSourceManifestHash(ids) {
    const normalized = [...new Set((Array.isArray(ids) ? ids : []).map(String))].sort();
    const joined     = normalized.join('\n');

    // FNV-1a (32-bit): offset basis 0x811c9dc5, prime 0x01000193. Math.imul keeps the multiply
    // in 32-bit space; the final `>>> 0` normalizes to an unsigned integer before hex encoding.
    let hash = 0x811c9dc5;
    for (let i = 0; i < joined.length; i++) {
        hash ^= joined.charCodeAt(i);
        hash  = Math.imul(hash, 0x01000193)
    }

    return (hash >>> 0).toString(16).padStart(8, '0')
}
