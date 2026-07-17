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

/**
 * @summary The stages whose rows are derived from a pull request, and therefore reset on head change.
 *
 * Named explicitly because the reset invariant only applies to them: a claimed task or a direct message
 * has no head to move under it, so requiring one there would be noise.
 * @type {Set<String>}
 */
const PR_DERIVED_STAGES = Object.freeze(new Set(['own-pr-repair', 'own-pr-reviewer-routing', 'requested-review']));

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

    // A PR-derived row without its head is a PRODUCER bug, so it fails loud here rather than being
    // normalized to null and handed on. Closing this at the consumer alone left the producer happily
    // minting rows that could not support the head-change reset — the guard would catch them, but only
    // after a malformed frontier already existed and only for readers that ran the guard. `null` here
    // dressed an omission up as a decision.
    if (PR_DERIVED_STAGES.has(item.stage)) {
        assertNonEmptyString(item.headSha, `items[${index}].headSha (PR-derived stage "${item.stage}" resets on head change)`)
    }

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
 *
 * Validates the WHOLE contract, not the fields that happen to be interesting. A guard that passes a
 * structurally incomplete envelope is worse than no guard: the reader believes it validated, then acts
 * on a frontier with no capture time (it cannot tell stale from current), no expiry (it cannot tell
 * expired from live), or no scope (it cannot tell whose obligations these are). Each omission converts
 * a detectable tear into a confident wrong answer — so every field the producer emits is required here.
 *
 * Freshness and reader binding are only checkable with the reader's own facts, so `now` and `agentId`
 * are optional inputs rather than assumed: a guard that silently skips them looks like it validated
 * expiry when it never could. Supplied, they make "is this expired?" and "is this even mine?"
 * executable — the second being the whole point of never-foreign at the consuming end.
 *
 * Freshness and reader binding need the reader's own facts, so they are REQUIRED by default. Making
 * them optional was itself a fail-open: called bare, the guard returned `valid: true` for an expired
 * envelope scoped to another agent — the two failures it exists to catch — while looking like it had
 * validated them. A caller that genuinely only wants structure must now say so, so that choice appears
 * at the call site instead of hiding in an omitted argument.
 *
 * @param {*} frontier The object to validate (may be anything).
 * @param {Object} [reader] The consuming reader's facts.
 * @param {Date|Number|String} [reader.now] Reader clock — required unless `shapeOnly`.
 * @param {String} [reader.agentId] Consuming agent — required unless `shapeOnly`.
 * @param {Boolean} [reader.shapeOnly=false] Explicitly validate STRUCTURE ONLY, accepting that expiry
 *   and reader binding go unchecked.
 * @returns {{valid: Boolean, errors: String[]}}
 */
export function validateLifecycleFrontier(frontier, {now, agentId, shapeOnly = false} = {}) {
    const errors = [];

    if (!shapeOnly && (now === undefined || typeof agentId !== 'string' || agentId.length === 0)) {
        return {
            valid : false,
            errors: ['reader validation requires now + agentId; pass {shapeOnly: true} to check structure only']
        }
    }

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

    // Without these a reader cannot distinguish stale from current, or expired from live — the two
    // judgements a perishable answer exists to support. A present-but-unparseable stamp is worse than
    // an absent one: it looks like a judgement the reader can make and is not.
    for (const field of ['capturedAt', 'expiresAt']) {
        if (typeof frontier[field] !== 'string' || Number.isNaN(Date.parse(frontier[field]))) {
            errors.push(`${field} must be a parseable ISO timestamp`)
        }
    }

    if (typeof frontier.sourceWatermark !== 'string' || frontier.sourceWatermark.length === 0) {
        errors.push('sourceWatermark is required')
    }

    // An envelope that expires before it was captured was never valid for a single instant. Both stamps
    // parsing individually says nothing about whether they describe a coherent window.
    if (typeof frontier.capturedAt === 'string' && typeof frontier.expiresAt === 'string' &&
        !Number.isNaN(Date.parse(frontier.capturedAt)) && !Number.isNaN(Date.parse(frontier.expiresAt)) &&
        Date.parse(frontier.expiresAt) <= Date.parse(frontier.capturedAt)) {
        errors.push(`expiresAt ${frontier.expiresAt} is not after capturedAt ${frontier.capturedAt}`)
    }

    // Without a resolved scope a reader cannot tell whose obligations it is holding, which is the one
    // question never-foreign exists to answer.
    if (!frontier.scope || typeof frontier.scope !== 'object' || Array.isArray(frontier.scope)) {
        errors.push('scope is required')
    } else if (!LIFECYCLE_SCOPE_RESOLUTIONS.has(frontier.scope.resolution)) {
        errors.push(`scope.resolution must be one of ${[...LIFECYCLE_SCOPE_RESOLUTIONS].join(', ')}`)
    } else if (frontier.scope.resolution !== 'omitted' &&
               (typeof frontier.scope.agentId !== 'string' || frontier.scope.agentId.length === 0)) {
        errors.push('an attested scope must carry a non-empty agentId')
    } else if (agentId && frontier.scope.resolution !== 'omitted' && frontier.scope.agentId !== agentId) {
        // Never-foreign at the CONSUMING end. The producer refuses to build a foreign overlay; this is
        // the reader refusing to act on one it was handed anyway.
        errors.push(`frontier is scoped to ${frontier.scope.agentId}, not the consuming agent ${agentId}`)
    }

    // An expired frontier is not a frontier — it is a description of a world that has moved on.
    if (now !== undefined) {
        const readerNow = now instanceof Date ? now.getTime() : (typeof now === 'string' ? Date.parse(now) : now);

        if (!Number.isFinite(readerNow)) {
            // An UNPARSEABLE reader clock fails the guard rather than skipping the check. Skipping was
            // the same fail-open as before wearing a defensive coat: the caller asked for expiry
            // validation, the guard could not perform it, and returned valid anyway — so a 2020 envelope
            // passed because the CLOCK was malformed, not the envelope.
            errors.push(`reader clock ${JSON.stringify(now)} is not a parseable time; expiry could not be validated`)
        } else if (typeof frontier.expiresAt === 'string' && !Number.isNaN(Date.parse(frontier.expiresAt)) &&
                   Date.parse(frontier.expiresAt) <= readerNow) {
            errors.push(`frontier expired at ${frontier.expiresAt}`)
        }
    }

    // Without coverage a degraded read is indistinguishable from a complete one.
    if (!frontier.coverage || typeof frontier.coverage !== 'object' || Array.isArray(frontier.coverage)) {
        errors.push('coverage is required')
    } else {
        for (const field of ['sources', 'degradedSources']) {
            const list = frontier.coverage[field];

            if (!Array.isArray(list)) {
                errors.push(`coverage.${field} must be an array`)
            } else if (list.some(entry => typeof entry !== 'string')) {
                // A numeric member passes an is-array check and names no source — the list exists to be
                // read, not counted.
                errors.push(`coverage.${field} must contain only strings`)
            }
        }

        // Coherence: status and coverage must tell the same story, or the reader believes whichever it
        // happens to look at.
        if (Array.isArray(frontier.coverage.degradedSources)) {
            const degraded = frontier.coverage.degradedSources.length > 0;

            if (degraded && frontier.status !== 'degraded') {
                errors.push(`status is "${frontier.status}" while coverage names degraded sources`)
            }
            if (!degraded && frontier.status === 'degraded') {
                errors.push('status is "degraded" while coverage names no degraded source')
            }
        }
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

            // EVERY field the producer emits, not the ones that happen to be interesting. A partial row
            // reads as a real obligation while naming nothing a peer can act on or trace.
            for (const field of ['id', 'kind', 'state', 'source', 'subjectId', 'checkedAt']) {
                if (typeof item?.[field] !== 'string' || item[field].length === 0) {
                    errors.push(`items[${index}].${field} is required`)
                }
            }

            if (typeof item?.actionableSince !== 'string' || Number.isNaN(Date.parse(item?.actionableSince))) {
                errors.push(`items[${index}].actionableSince must be a parseable ISO timestamp`)
            }

            // A PR-derived row MUST name its head. Every such row resets on head change, and a row with
            // `headSha: null` cannot support that invariant: nothing downstream can tell whether its
            // clock belongs to the code that exists now. The builder emitting null made the omission
            // look deliberate, which is worse than absent.
            if (PR_DERIVED_STAGES.has(item?.stage) && (typeof item?.headSha !== 'string' || item.headSha.length === 0)) {
                errors.push(`items[${index}].headSha is required for the PR-derived stage "${item?.stage}"`)
            }

            // Members, not just the container: `citations: [42]` passes an is-array check and cites
            // nothing a reader can follow.
            if (!Array.isArray(item?.citations)) {
                errors.push(`items[${index}].citations must be an array`)
            } else if (item.citations.some(citation => typeof citation !== 'string')) {
                errors.push(`items[${index}].citations must contain only strings`)
            }
        });

        // Order is part of the contract, so a reader can trust position instead of re-sorting. An
        // out-of-order envelope means the producer's ordering was bypassed — the reader cannot tell
        // whether the rest of the contract held either.
        const ordered = [...items].sort((a, b) =>
            (STAGE_RANK[a?.stage] - STAGE_RANK[b?.stage]) ||
            (Date.parse(a?.actionableSince) - Date.parse(b?.actionableSince)) ||
            String(a?.id).localeCompare(String(b?.id))
        );

        if (items.some((item, index) => item !== ordered[index])) {
            errors.push('items are not in contract order (stage, then actionableSince oldest-first, then id)')
        }
    }

    return {valid: errors.length === 0, errors}
}
