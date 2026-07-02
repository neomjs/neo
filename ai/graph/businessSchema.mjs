/**
 * @summary Central schema definition for the Business layer of the Native Edge Graph.
 *
 * This module is the authoritative family registry for `BUSINESS_GOAL` / `METRIC` node labels and the
 * `ADVANCED_BY` edge type — the layer that lets the graph reason over the business the way it reasons
 * over the codebase. It follows the established family-enum pattern (each semantic family's enum lives
 * in its owning module — the same shape the concept, decision-record, and protected families use) and
 * the central-definition sibling shape of `identityRoots.mjs`.
 *
 * The load-bearing discipline (verify-before-assert mechanized into the business layer): a metric that
 * cannot name the query that would falsify it is INVALID BY CONSTRUCTION. `validateMetricProperties`
 * fails closed on a missing/empty `falsifyingQuery` — the graph refuses an unanchored number the way
 * CI refuses an untested diff. Consumers MUST route every business-node write through these validators;
 * a write path that bypasses them re-introduces the vanity-metric class the schema exists to exclude.
 *
 * Prioritization boundary (honesty contract): defining these labels does NOT make them Golden-Path
 * prioritization substrate — `computedGoldenPathRouting` type-gates ranking to ISSUE/DISCUSSION nodes.
 * Until that gate names the business labels (the Golden-Path-v2 lane), this layer is a REPORTING
 * surface. Do not claim otherwise in any consumer.
 */

/**
 * @summary Node labels owned by the business family (Native Edge Graph node-type registry, Business layer).
 * @type {ReadonlyArray<String>}
 */
export const BUSINESS_NODE_TYPES = Object.freeze(['BUSINESS_GOAL', 'METRIC']);

/**
 * @summary Edge types owned by the business family (Native Edge Graph edge-type registry, Business family).
 *
 * `ADVANCED_BY` connects a `BUSINESS_GOAL` to the work that advances it (issue / PR / metric node).
 * Family disposition: the edge is a durable structural FACT — "goal X was advanced by artifact Y"
 * stays historically true — so it joins the decay shield rather than fading as scent. The
 * zombie-priority guard is NOT decay: retiring a goal reweights its `ADVANCED_BY` edges to
 * `RETIRED_GOAL_EDGE_WEIGHT` in the same commit (see `retiredGoalEdgeWeight` docs below).
 * @type {ReadonlyArray<String>}
 */
export const BUSINESS_EDGE_TYPES = Object.freeze(['ADVANCED_BY']);

/**
 * @summary The five property fields EVERY business node (both labels) must carry, per the graduated
 * business-engine design contract. `publicFlag` travels with the node so redaction is schema-side,
 * not pipeline-goodwill; `confoundDisclaimer` keeps every number honest about what it cannot isolate.
 * @type {ReadonlyArray<String>}
 */
export const REQUIRED_BUSINESS_PROPERTIES = Object.freeze([
    'claimClass',
    'falsifyingQuery',
    'windowSemantics',
    'confoundDisclaimer',
    'publicFlag'
]);

/**
 * @summary Starter taxonomy for `claimClass` — the epistemic class of the number.
 *
 * `measured` (read from an instrumented source), `derived` (computed from other metric nodes),
 * `attributed` (causally linked via an attribution anchor, e.g. UTM), `external-reported`
 * (a third party's number, trust-bounded). The set is extensible ONLY via a reviewed
 * decision-record amendment — validators require membership so a new class is a decision,
 * not a typo.
 * @type {ReadonlyArray<String>}
 */
export const METRIC_CLAIM_CLASSES = Object.freeze(['measured', 'derived', 'attributed', 'external-reported']);

/**
 * @summary `BUSINESS_GOAL` lifecycle states. Retirement is not deletion: the goal node and its
 * `ADVANCED_BY` history persist; only the edge weights drop (zombie-priority guard).
 * @type {ReadonlyArray<String>}
 */
export const BUSINESS_GOAL_LIFECYCLE = Object.freeze(['active', 'achieved', 'retired']);

/**
 * @summary Weight applied to a retired goal's `ADVANCED_BY` edges in the retirement commit.
 *
 * Protected edges never decay (the GraphService decay shield), so without this reweight a retired
 * goal would rank as loudly as a live one forever. 0.1 keeps the historical fact walkable while
 * removing its priority pull.
 * @type {Number}
 */
export const RETIRED_GOAL_EDGE_WEIGHT = 0.1;

/**
 * @summary Node-id prefixes for the business labels (kebab convention shared with `issue-` /
 * `discussion-` ids, which `computedGoldenPathRouting` keys on).
 * @type {Object}
 */
export const BUSINESS_ID_PREFIXES = Object.freeze({
    BUSINESS_GOAL: 'business-goal-',
    METRIC       : 'metric-'
});

/**
 * @summary Normalizes one identity-key part into a deterministic, collision-safe slug segment.
 *
 * Lower-cases, trims, and collapses every non `[a-z0-9]` run into a single `-`. Empty results are
 * a validation error at the caller — identity parts are never optional.
 * @param {String} value
 * @returns {String}
 */
export function slugifyIdPart(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * @summary Derives the deterministic `METRIC` node id from its four identity fields.
 *
 * Identity contract: `(source, metricName, windowSemantics, periodStart)` → the same id on every
 * recomputation, so an upsert is idempotent and a `falsifyingQuery` re-run lands on the SAME node
 * instead of minting a rival — AND distinct tuples always yield distinct ids. Parts are joined
 * with `--`, which is injective by construction: `slugifyIdPart` collapses every non-alphanumeric
 * run to a single `-` and strips edge dashes, so no part can ever contain `--` or start/end with
 * `-`, making the four part boundaries unambiguous (a single-`-` join is NOT collision-safe:
 * `git`/`review-latency` would equal `git-review`/`latency`). Throws on any missing/empty part —
 * a metric with an incomplete identity cannot exist, even transiently.
 * @param {Object} identity
 * @param {String} identity.source          Ingestion source key (e.g. `github`, `npm`)
 * @param {String} identity.metricName      Category-level metric name (never a private target)
 * @param {String} identity.windowSemantics Window contract (e.g. `day:utc`, `week:iso`, `point-in-time`)
 * @param {String} identity.periodStart     ISO-8601 period start (e.g. `2026-07-01`)
 * @returns {String}
 */
export function createMetricId({source, metricName, windowSemantics, periodStart}) {
    const parts = {source, metricName, windowSemantics, periodStart};

    for (const [key, raw] of Object.entries(parts)) {
        if (slugifyIdPart(raw) === '') {
            throw new Error(`createMetricId: identity part "${key}" is missing or empty — METRIC identity is (source, metricName, windowSemantics, periodStart), all required`);
        }
    }

    return BUSINESS_ID_PREFIXES.METRIC + [parts.source, parts.metricName, parts.windowSemantics, parts.periodStart].map(slugifyIdPart).join('--');
}

/**
 * @summary Derives the `BUSINESS_GOAL` node id from its stable operator slug.
 *
 * Goals are operator-named: the slug is the durable identity, so renaming display titles never
 * re-mints the node. Throws on an empty slug.
 * @param {String} slug Stable operator slug (e.g. `category-correct-search-share`)
 * @returns {String}
 */
export function createBusinessGoalId(slug) {
    const normalized = slugifyIdPart(slug);

    if (normalized === '') {
        throw new Error('createBusinessGoalId: slug is missing or empty — BUSINESS_GOAL identity is a stable operator slug');
    }

    return BUSINESS_ID_PREFIXES.BUSINESS_GOAL + normalized;
}

/**
 * @summary Validates the five-field business property contract shared by BOTH business labels.
 *
 * Fail-closed: returns every violation, never a partial pass. `falsifyingQuery` is the
 * invalid-by-construction gate; `publicFlag` must be a real boolean (a truthy string is a
 * redaction hazard, not a flag).
 * @param {Object} properties
 * @returns {{valid: Boolean, errors: String[]}}
 */
export function validateBusinessProperties(properties) {
    const errors = [];
    const props  = properties ?? {};

    for (const field of REQUIRED_BUSINESS_PROPERTIES) {
        if (!(field in props)) {
            errors.push(`missing required property "${field}"`);
        }
    }

    if ('falsifyingQuery' in props && (typeof props.falsifyingQuery !== 'string' || props.falsifyingQuery.trim() === '')) {
        errors.push('"falsifyingQuery" must be a non-empty string — a metric that cannot name its falsifier is invalid by construction');
    }

    if ('claimClass' in props && !METRIC_CLAIM_CLASSES.includes(props.claimClass)) {
        errors.push(`"claimClass" must be one of [${METRIC_CLAIM_CLASSES.join(', ')}] — extending the taxonomy is a decision-record amendment, not a write`);
    }

    if ('windowSemantics' in props && (typeof props.windowSemantics !== 'string' || props.windowSemantics.trim() === '')) {
        errors.push('"windowSemantics" must be a non-empty string (e.g. "day:utc", "week:iso", "point-in-time")');
    }

    if ('confoundDisclaimer' in props && (typeof props.confoundDisclaimer !== 'string' || props.confoundDisclaimer.trim() === '')) {
        errors.push('"confoundDisclaimer" must be a non-empty string naming what the number cannot isolate');
    }

    if ('publicFlag' in props && typeof props.publicFlag !== 'boolean') {
        errors.push('"publicFlag" must be a strict boolean — redaction decisions never coerce');
    }

    return {valid: errors.length === 0, errors};
}

/**
 * @summary Validates a full `METRIC` node's properties: the shared five-field contract plus the
 * identity fields and the append-only period state.
 *
 * `periodClosed` is the mutability hinge: `false` = current period, value may update in place;
 * `true` = closed period, immutable forever (see `isClosedPeriodViolation`).
 * @param {Object} properties
 * @returns {{valid: Boolean, errors: String[]}}
 */
export function validateMetricProperties(properties) {
    const props    = properties ?? {};
    const {errors} = validateBusinessProperties(props);

    for (const field of ['source', 'metricName', 'periodStart']) {
        if (typeof props[field] !== 'string' || props[field].trim() === '') {
            errors.push(`missing METRIC identity property "${field}"`);
        }
    }

    if (typeof props.periodClosed !== 'boolean') {
        errors.push('"periodClosed" must be a strict boolean — the append-only contract needs an explicit period state');
    }

    if (typeof props.value !== 'number' || !Number.isFinite(props.value)) {
        errors.push('"value" must be a finite number');
    }

    return {valid: errors.length === 0, errors};
}

/**
 * @summary Validates a full `BUSINESS_GOAL` node's properties: the shared five-field contract plus
 * the operator slug and lifecycle state.
 * @param {Object} properties
 * @returns {{valid: Boolean, errors: String[]}}
 */
export function validateBusinessGoalProperties(properties) {
    const props    = properties ?? {};
    const {errors} = validateBusinessProperties(props);

    if (slugifyIdPart(props.slug) === '') {
        errors.push('missing BUSINESS_GOAL identity property "slug" (stable operator slug)');
    }

    if (!BUSINESS_GOAL_LIFECYCLE.includes(props.lifecycle)) {
        errors.push(`"lifecycle" must be one of [${BUSINESS_GOAL_LIFECYCLE.join(', ')}]`);
    }

    return {valid: errors.length === 0, errors};
}

/**
 * @summary Append-only guard for `METRIC` writes: a write against a node whose stored period is
 * closed is a contract violation, not an update.
 *
 * Callers (the ingestion probe, future rollup writers) MUST invoke this before any upsert that
 * resolves to an existing node id. Closing a period (`periodClosed false → true`) is the one
 * legal transition on a closed-bound write; every other mutation of a closed period is refused.
 * @param {Object|null} existingProperties The stored node's properties (null/undefined = new node)
 * @param {Object}      incomingProperties The proposed write
 * @returns {{violation: Boolean, reason: String|null}}
 */
export function isClosedPeriodViolation(existingProperties, incomingProperties) {
    if (!existingProperties || existingProperties.periodClosed !== true) {
        return {violation: false, reason: null};
    }

    const incoming = incomingProperties ?? {};

    if ('periodClosed' in incoming && incoming.periodClosed !== true) {
        return {
            violation: true,
            reason   : 'closed METRIC period is append-only — a closed period never reopens (periodClosed true → false refused)'
        };
    }

    const changed = Object.keys(incoming).filter(key =>
        key !== 'periodClosed' &&
        JSON.stringify(incoming[key]) !== JSON.stringify(existingProperties[key])
    );

    if (changed.length > 0) {
        return {
            violation: true,
            reason   : `closed METRIC period is append-only — refused mutation of [${changed.join(', ')}]`
        };
    }

    return {violation: false, reason: null};
}

/**
 * @summary Plans the zombie-priority reweight for a goal entering the `retired` lifecycle state.
 *
 * Pure planner: given the goal's edge records, returns the `{id, weight}` updates for its
 * `ADVANCED_BY` edges — every one drops to `RETIRED_GOAL_EDGE_WEIGHT`, non-`ADVANCED_BY` edges are
 * untouched. The caller (service / probe layer) MUST apply these updates in the SAME commit as the
 * lifecycle transition to `retired`; a retired goal with un-reweighted edges is the zombie-priority
 * state this planner exists to prevent. Deletion is never planned — the historical fact stays walkable.
 * @param {Object[]} edges Edge records shaped `{id, type, properties?}`
 * @returns {Object[]} Update records shaped `{id, weight}`
 */
export function planRetiredGoalEdgeReweight(edges) {
    return (Array.isArray(edges) ? edges : [])
        .filter(edge => edge != null && edge.type === 'ADVANCED_BY' && edge.id != null)
        .map(edge => ({id: edge.id, weight: RETIRED_GOAL_EDGE_WEIGHT}));
}
