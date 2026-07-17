/**
 * @module ai/services/graph/lifecycleFrontier
 * @summary The typed `lifecycle-frontier.v1` contract: what already requires ONE agent's response now.
 *
 * This is the counterpart to the computed route, not a competitor. The route answers "which direction
 * best serves the declared goals next"; this answers "what is already waiting on me". They are separate
 * authorities, and the separation is load-bearing: lifecycle facts are source-backed obligations, never
 * score inputs, so nothing here may be folded into ranking. A frontier that ordered items by importance
 * would have quietly become a second scorer.
 *
 * The failure this replaces is measured, not theoretical: across ~50 turn-end fires in one session a
 * peer had to hand-survey own-PR gate state, the review queue, and assigned tickets EVERY time to find
 * the real next action — because nothing produced this list.
 *
 * Two invariants carry most of the weight:
 * 1. **Exclusions are as load-bearing as admissions.** "CI is running" is not a call to act; an approved
 *    PR waiting on the human merge gate is not the agent's move. Admitting either manufactures busywork
 *    rows and teaches peers to ignore the surface — the same way fixture rows taught them to ignore the
 *    route.
 * 2. **Never-foreign.** A missing, inferred, or conflicted identity omits the overlay with a reason. A
 *    confidently-wrong identity map leaks another peer's obligations, and leakage is worse than absence.
 */

/**
 * @summary The frontier's schema version.
 * @type {String}
 */
export const LIFECYCLE_FRONTIER_SCHEMA_VERSION = 'lifecycle-frontier.v1';

/**
 * The five response-required stages, in presentation order. The order is the contract: an own-PR repair
 * outranks a review request because the former blocks a lane the agent already owns. Index = rank.
 * @type {String[]}
 */
export const LIFECYCLE_STAGES = Object.freeze([
    'own-pr-repair',
    'own-pr-reviewer-routing',
    'requested-review',
    'claimed-a2a-task',
    'direct-message'
]);

/**
 * @summary Valid frontier statuses. Independent of item count — an empty frontier is an honest answer,
 * and `missing`/`degraded` must never be normalized to `empty`.
 * @type {Set<String>}
 */
export const LIFECYCLE_FRONTIER_STATUSES = Object.freeze(new Set([
    'fresh',
    'empty',
    'missing',
    'stale',
    'degraded'
]));

/**
 * @summary Binding resolutions. Only an attested agent may carry a lifecycle overlay; everything else
 * omits it with a reason rather than guessing.
 * @type {Set<String>}
 */
export const LIFECYCLE_SCOPE_RESOLUTIONS = Object.freeze(new Set([
    'agent-instance',
    'agent',
    'omitted'
]));

const STAGE_RANK = Object.freeze(
    LIFECYCLE_STAGES.reduce((rank, stage, index) => Object.assign(rank, {[stage]: index}), {})
);

/**
 * @summary Asserts a value is a non-empty string.
 * @param {*} value
 * @param {String} label Field name for the thrown message.
 * @throws {TypeError} When `value` is not a non-empty string.
 */
function assertNonEmptyString(value, label) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(`[lifecycleFrontier] ${label} must be a non-empty string.`)
    }
}

/**
 * @summary Normalizes one response-required item, validating the fields a consumer must be able to
 * trust: which stage it belongs to, what it points at, and since when it has been actionable.
 *
 * `actionableSince` is required because it is the only thing that makes the list orderable by age
 * rather than by discovery accident — and because a row that cannot say since when it needed a
 * response cannot be reasoned about at all.
 *
 * `headSha` carries the head a PR-derived row was observed against: a row that outlives its head is
 * stale by construction, and the head is what a consumer re-checks against.
 *
 * @param {Object} item
 * @param {Number} index Position, used only for error messages.
 * @returns {Object} A frozen item.
 * @throws {TypeError|RangeError} On a contract violation.
 */
function normalizeFrontierItem(item, index) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new TypeError(`[lifecycleFrontier] items[${index}] must be a plain object.`)
    }

    if (!STAGE_RANK.hasOwnProperty(item.stage)) {
        throw new RangeError(`[lifecycleFrontier] items[${index}].stage must be one of ${LIFECYCLE_STAGES.join(', ')}; got ${JSON.stringify(item.stage)}.`)
    }

    assertNonEmptyString(item.id,              `items[${index}].id`);
    assertNonEmptyString(item.source,          `items[${index}].source`);
    assertNonEmptyString(item.subjectId,       `items[${index}].subjectId`);
    assertNonEmptyString(item.actionableSince, `items[${index}].actionableSince`);

    return Object.freeze({
        id             : item.id,
        stage          : item.stage,
        kind           : typeof item.kind === 'string' ? item.kind : null,
        state          : typeof item.state === 'string' ? item.state : null,
        source         : item.source,
        subjectId      : item.subjectId,
        headSha        : typeof item.headSha === 'string' ? item.headSha : null,
        actionableSince: item.actionableSince,
        checkedAt      : typeof item.checkedAt === 'string' ? item.checkedAt : null,
        citations      : Object.freeze(Array.isArray(item.citations) ? [...item.citations] : [])
    })
}

/**
 * @summary Orders the frontier: stage rank first, then oldest `actionableSince` first, then stable
 * source id.
 *
 * The id tiebreak is not cosmetic — without it two equal-aged rows could swap between passes and a
 * consumer diffing consecutive frontiers would report movement that never happened.
 *
 * @param {Object[]} items Normalized items.
 * @returns {Object[]} A new, ordered array.
 */
function orderFrontierItems(items) {
    return [...items].sort((a, b) =>
        (STAGE_RANK[a.stage] - STAGE_RANK[b.stage]) ||
        (Date.parse(a.actionableSince) - Date.parse(b.actionableSince)) ||
        String(a.id).localeCompare(String(b.id))
    )
}

/**
 * @summary Builds a validated, frozen `lifecycle-frontier.v1` envelope for ONE attested agent.
 *
 * Producer-side: fails LOUD on a contract violation, because a malformed frontier is a producer bug and
 * a plausible-but-wrong obligation list is worse than none. Source degradation is NOT a violation —
 * that is what `coverage.degradedSources` and `status: 'degraded'` exist to carry honestly.
 *
 * @param {Object}   params
 * @param {Object}   params.scope `{agentId, harnessInstance, resolution}` — the attested binding.
 *   `resolution: 'omitted'` REQUIRES zero items: an unattested agent gets no overlay, never a guess.
 * @param {String}   params.status One of {@link LIFECYCLE_FRONTIER_STATUSES}. Never derived from item count.
 * @param {String}   params.capturedAt ISO timestamp of the source read.
 * @param {String}   params.sourceWatermark Monotonic watermark of the observed source set.
 * @param {String}   params.expiresAt ISO timestamp after which the frontier is stale.
 * @param {Object}   [params.coverage] `{sources, degradedSources}` — which sources answered, which degraded.
 * @param {Object[]} [params.items=[]] Response-required items; ordered here, not by the caller.
 * @param {String}   [params.omittedReason=null] Why the overlay is absent when `resolution: 'omitted'`.
 * @returns {Object} A deeply-frozen frontier envelope.
 * @throws {TypeError|RangeError} On any contract violation.
 */
export function buildLifecycleFrontier({
    scope,
    status,
    capturedAt,
    sourceWatermark,
    expiresAt,
    coverage = {},
    items    = [],
    omittedReason = null
} = {}) {
    if (!LIFECYCLE_FRONTIER_STATUSES.has(status)) {
        throw new RangeError(`[lifecycleFrontier] status must be one of ${[...LIFECYCLE_FRONTIER_STATUSES].join(', ')}; got ${JSON.stringify(status)}.`)
    }

    if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
        throw new TypeError('[lifecycleFrontier] scope must be a plain object.')
    }

    if (!LIFECYCLE_SCOPE_RESOLUTIONS.has(scope.resolution)) {
        throw new RangeError(`[lifecycleFrontier] scope.resolution must be one of ${[...LIFECYCLE_SCOPE_RESOLUTIONS].join(', ')}; got ${JSON.stringify(scope.resolution)}.`)
    }

    assertNonEmptyString(capturedAt,      'capturedAt');
    assertNonEmptyString(sourceWatermark, 'sourceWatermark');
    assertNonEmptyString(expiresAt,       'expiresAt');

    const rawItems = Array.isArray(items) ? items : [];

    // Never-foreign, enforced structurally: an unattested binding cannot carry obligations. Leaking one
    // peer's rows to another is worse than showing nothing, so this is a producer error, not a warning.
    if (scope.resolution === 'omitted' && rawItems.length > 0) {
        throw new RangeError('[lifecycleFrontier] an omitted scope must carry zero items — an unattested agent never receives a lifecycle overlay.')
    }

    if (scope.resolution !== 'omitted') {
        assertNonEmptyString(scope.agentId, 'scope.agentId')
    }

    const normalized = orderFrontierItems(rawItems.map(normalizeFrontierItem));

    return Object.freeze({
        schemaVersion: LIFECYCLE_FRONTIER_SCHEMA_VERSION,
        status,
        capturedAt,
        sourceWatermark,
        expiresAt,

        scope: Object.freeze({
            agentId        : typeof scope.agentId === 'string' ? scope.agentId : null,
            harnessInstance: typeof scope.harnessInstance === 'string' ? scope.harnessInstance : null,
            resolution     : scope.resolution,
            omittedReason  : scope.resolution === 'omitted' ? (omittedReason || 'unattested-binding') : null
        }),

        coverage: Object.freeze({
            sources        : Object.freeze(Array.isArray(coverage.sources) ? [...coverage.sources] : []),
            degradedSources: Object.freeze(Array.isArray(coverage.degradedSources) ? [...coverage.degradedSources] : [])
        }),

        items       : Object.freeze(normalized),
        notAuthority: true
    })
}

/**
 * @summary Consumer-side guard: validates a frontier WITHOUT throwing, so a reader degrades to bare
 * policy rather than crashing on a torn or legacy envelope.
 * @param {*} frontier The object to validate (may be anything).
 * @returns {{valid: Boolean, errors: String[]}}
 */
export function validateLifecycleFrontier(frontier) {
    const errors = [];

    if (!frontier || typeof frontier !== 'object' || Array.isArray(frontier)) {
        return {valid: false, errors: ['frontier is not a plain object']}
    }
    if (frontier.schemaVersion !== LIFECYCLE_FRONTIER_SCHEMA_VERSION) {
        errors.push(`schemaVersion must be "${LIFECYCLE_FRONTIER_SCHEMA_VERSION}"`)
    }
    if (!LIFECYCLE_FRONTIER_STATUSES.has(frontier.status)) {
        errors.push(`status must be one of ${[...LIFECYCLE_FRONTIER_STATUSES].join(', ')}`)
    }
    if (frontier.notAuthority !== true) {
        errors.push('notAuthority must be true')
    }

    const items = Array.isArray(frontier.items) ? frontier.items : null;

    if (items === null) {
        errors.push('items must be an array')
    } else {
        if (frontier.scope?.resolution === 'omitted' && items.length > 0) {
            errors.push('an omitted scope must carry zero items')
        }
        items.forEach((item, index) => {
            if (!STAGE_RANK.hasOwnProperty(item?.stage)) {
                errors.push(`items[${index}].stage is not a known lifecycle stage`)
            }
            if (typeof item?.actionableSince !== 'string' || item.actionableSince.length === 0) {
                errors.push(`items[${index}].actionableSince is required`)
            }
        })
    }

    return {valid: errors.length === 0, errors}
}
