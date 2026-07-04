import {slugifyIdPart, validateBusinessProperties} from './businessSchema.mjs';

/**
 * @summary Central schema definition for the Direction layer of the Native Edge Graph, mechanizing
 * the accepted direction contract (ADR 0033 — ticket-ref-ok: the Accepted decision record is this
 * module's source of authority; the pointer is load-bearing, not archaeology).
 *
 * This module is the authoritative family registry for the `EVOLUTION_GOAL` node label and the
 * `ATTRIBUTED_TO` edge type — the layer that makes evolution DIRECTION a first-class computed
 * object (Epic: direction-weighted Golden Path). It GENERALIZES the business family: an
 * `EVOLUTION_GOAL` carries the same five-field honesty contract as `BUSINESS_GOAL`/`METRIC`
 * (imported from `businessSchema.mjs` — one vocabulary per contract, never a re-derived copy),
 * plus direction-specific identity and intent fields. The two families stay SEPARATE node classes
 * on a shared schema shape: composable siblings, never merged.
 *
 * The load-bearing disciplines, all from the direction contract:
 *
 * - **Deterministic identity (§2.1):** a direction is identified by a deterministic key — a
 *   declared `EVOLUTION_GOAL` id or an emergent `cluster-` key — never an LLM label or mutable
 *   cluster name. Attribution facts are `{directionKey, mappingVersion}` pairs with APPEND-ONLY
 *   history: fact ids embed the mapping version, so a re-clustering mints NEW facts under the next
 *   version instead of rewriting prior ones.
 * - **Conservation (§2.3):** per window, per declared filter set, attributed shares plus the
 *   UNATTRIBUTED share must sum to the whole. The pool is first-class, not residue — below any
 *   coverage floor the correct behavior is to render the pool, never to fake a split.
 * - **Falsifier symmetry (§2.4):** every attribution fact names the filter set it was computed
 *   under and the query that would falsify it; a fact that cannot name its falsifier is invalid
 *   by construction (the `businessSchema.mjs` discipline, applied to attribution).
 * - **Operator-owned intent (§2.5):** `intentWeight` is Tier-4-set by the operator, never
 *   computed. Validators enforce shape; write paths MUST NOT derive or auto-adjust it.
 * - **Fail-open boundary (§2.6):** nothing in this layer gates the computed route. Direction data
 *   is additive annotation; consumers that zero a route on missing/low alignment violate the
 *   contract this schema serves.
 */

/**
 * @summary Node labels owned by the direction family (Native Edge Graph node-type registry).
 * @type {ReadonlyArray<String>}
 */
export const DIRECTION_NODE_TYPES = Object.freeze(['EVOLUTION_GOAL']);

/**
 * @summary Edge types owned by the direction family.
 *
 * `ATTRIBUTED_TO` connects a motion fact (session / PR / commit / ticket node) to the direction it
 * served. Family disposition: attribution is a durable structural FACT — "motion X served
 * direction D under mapping vN" stays historically true — so the type is cross-listed in
 * `PROTECTED_EDGE_TYPES` (GraphService decay shield). A velocity number built on decaying edges
 * rots invisibly; measurement substrate is fact-class, not scent (the direction contract §2.5).
 * @type {ReadonlyArray<String>}
 */
export const DIRECTION_EDGE_TYPES = Object.freeze(['ATTRIBUTED_TO']);

/**
 * @summary `EVOLUTION_GOAL` lifecycle states (mirror of the business-goal lifecycle — retirement
 * is not deletion; the anchor and its attribution history persist).
 * @type {ReadonlyArray<String>}
 */
export const EVOLUTION_GOAL_LIFECYCLE = Object.freeze(['active', 'achieved', 'retired']);

/**
 * @summary Seed classes for declared anchors. `operator` anchors count against the small-N cap;
 * `release-train` seeds (the vX.Y → vX.Y+1 arc) are free per the direction contract §2.5.
 * @type {ReadonlyArray<String>}
 */
export const EVOLUTION_GOAL_SEED_CLASSES = Object.freeze(['operator', 'release-train']);

/**
 * @summary The small-N cap on operator-declared anchors (the direction contract §2.5: "small-N capped").
 *
 * Direction is a strategic vocabulary, not a tag cloud — past this count, declared intent stops
 * being legible as strategy. Raising the cap is a decision-record amendment, not a config tweak.
 * @type {Number}
 */
export const DECLARED_ANCHOR_CAP = 12;

/**
 * @summary The first-class UNATTRIBUTED pool key (the direction contract §2.3).
 *
 * Motion no mapping explains lands here VISIBLY — it is the innovation-or-drift signal a human
 * judges, and the fail-open floor: attribution absence degrades to unweighted-but-visible, never
 * to fail-closed, never to a faked split.
 * @type {String}
 */
export const UNATTRIBUTED_DIRECTION_KEY = 'unattributed';

/**
 * @summary Node-id / key prefixes for the direction family (kebab convention shared with the
 * business family's `business-goal-` / `metric-` prefixes).
 * @type {Object}
 */
export const DIRECTION_ID_PREFIXES = Object.freeze({
    ATTRIBUTION   : 'attribution-',
    CLUSTER_KEY   : 'cluster-',
    EVOLUTION_GOAL: 'evolution-goal-'
});

/**
 * @summary Default tolerance for the conservation identity on float shares.
 * @type {Number}
 */
export const CONSERVATION_EPSILON = 1e-9;

/**
 * @summary Derives the `EVOLUTION_GOAL` node id from its stable operator slug.
 *
 * Goals are operator-named: the slug is the durable identity (display titles rename freely without
 * re-minting). Where a slug names a CONCEPT, callers canonicalize it through the concept-spine SSOT
 * (`conceptSpineCanonicalization.canonicalizeConceptId`) BEFORE minting — the 2,705-alias-cluster
 * hazard makes canonical ids a correctness gate, not polish (the direction contract §2.5). This module stays
 * dependency-light and pure; the canonicalization routing is the writer's obligation.
 * @param {String} slug Stable operator slug (e.g. `outward-traction`, `release-train-v13-2`)
 * @returns {String}
 */
export function createEvolutionGoalId(slug) {
    const normalized = slugifyIdPart(slug);

    if (normalized === '') {
        throw new Error('createEvolutionGoalId: slug is missing or empty — EVOLUTION_GOAL identity is a stable operator slug');
    }

    return DIRECTION_ID_PREFIXES.EVOLUTION_GOAL + normalized;
}

/**
 * @summary Derives an emergent-cluster direction key from a deterministic cluster id.
 *
 * The cluster KEY is stable per cluster id; which mapping version produced the cluster travels on
 * the attribution fact (and composes into breakdown keys), never inside this key — so version
 * churn re-attributes without re-keying (the direction contract §2.1).
 * @param {String} clusterId Deterministic cluster identifier from the mapping artifact
 * @returns {String}
 */
export function createClusterDirectionKey(clusterId) {
    const normalized = slugifyIdPart(clusterId);

    if (normalized === '') {
        throw new Error('createClusterDirectionKey: clusterId is missing or empty');
    }

    return DIRECTION_ID_PREFIXES.CLUSTER_KEY + normalized;
}

/**
 * @summary Returns true for any valid direction key: a declared goal id, an emergent cluster key,
 * or the first-class UNATTRIBUTED pool.
 * @param {String} directionKey
 * @returns {Boolean}
 */
export function isDirectionKey(directionKey) {
    if (directionKey === UNATTRIBUTED_DIRECTION_KEY) return true;
    if (typeof directionKey !== 'string') return false;

    // Per-prefix suffix check: a key is valid iff it carries a NON-EMPTY id after ITS OWN
    // prefix — a shared length bound would tie short cluster keys to the longer goal prefix
    // and admit empty declared-goal suffixes (the exact identity-contract drift class).
    for (const prefix of [DIRECTION_ID_PREFIXES.EVOLUTION_GOAL, DIRECTION_ID_PREFIXES.CLUSTER_KEY]) {
        if (directionKey.startsWith(prefix)) {
            return directionKey.length > prefix.length;
        }
    }

    return false;
}

/**
 * @summary Composes the durable-record breakdown key `"<directionKey>@<mappingVersion>"`
 * (the direction contract §2.2 — the `directionBreakdown` map key on L1/L2 records).
 * @param {String} directionKey
 * @param {Number} mappingVersion Positive integer mapping version
 * @returns {String}
 */
export function composeBreakdownKey(directionKey, mappingVersion) {
    if (!isDirectionKey(directionKey)) {
        throw new Error(`composeBreakdownKey: "${directionKey}" is not a valid direction key`);
    }

    if (!Number.isInteger(mappingVersion) || mappingVersion < 1) {
        throw new Error('composeBreakdownKey: mappingVersion must be a positive integer');
    }

    return `${directionKey}@${mappingVersion}`;
}

/**
 * @summary Parses a breakdown key back into `{directionKey, mappingVersion}` — the falsifier-side
 * inverse of `composeBreakdownKey`, so a shipped falsifying query can pin the SAME version the
 * measurement carried (the direction contract §2.4 falsifier symmetry).
 * @param {String} breakdownKey
 * @returns {{directionKey: String, mappingVersion: Number}}
 */
export function parseBreakdownKey(breakdownKey) {
    const at = String(breakdownKey ?? '').lastIndexOf('@');

    if (at < 1) {
        throw new Error(`parseBreakdownKey: "${breakdownKey}" is not a "<directionKey>@<mappingVersion>" key`);
    }

    const directionKey   = breakdownKey.slice(0, at);
    const mappingVersion = Number(breakdownKey.slice(at + 1));

    if (!isDirectionKey(directionKey) || !Number.isInteger(mappingVersion) || mappingVersion < 1) {
        throw new Error(`parseBreakdownKey: "${breakdownKey}" failed key/version validation`);
    }

    return {directionKey, mappingVersion};
}

/**
 * @summary Derives the deterministic attribution-fact id.
 *
 * Identity contract: `(motionId, directionKey, mappingVersion)` → the same id on every
 * recomputation UNDER THE SAME VERSION (idempotent re-runs), while a new mapping version yields a
 * NEW id — the append-only-under-version contract mechanized at the id layer (the direction contract §2.1: a
 * re-clustering writes new facts, never rewrites old ones). `--` join is injective because
 * `slugifyIdPart` output can never contain `--` (the `businessSchema.mjs` collision argument).
 * @param {Object} identity
 * @param {String} identity.motionId       Graph node id of the motion fact (e.g. `issue-14567`)
 * @param {String} identity.directionKey   Declared goal id, cluster key, or the UNATTRIBUTED pool
 * @param {Number} identity.mappingVersion Positive integer mapping version
 * @returns {String}
 */
export function createAttributionFactId({motionId, directionKey, mappingVersion}) {
    if (slugifyIdPart(motionId) === '') {
        throw new Error('createAttributionFactId: motionId is missing or empty');
    }

    // Validates key + version in one place; the composed suffix keeps version in the identity.
    const versionedKey = composeBreakdownKey(directionKey, mappingVersion);

    return DIRECTION_ID_PREFIXES.ATTRIBUTION + [slugifyIdPart(motionId), slugifyIdPart(versionedKey)].join('--');
}

/**
 * @summary Validates a full `EVOLUTION_GOAL` node's properties: the shared five-field business
 * contract (imported — one vocabulary per contract) plus the direction-specific fields.
 *
 * `intentWeight` is OPERATOR-OWNED (the direction contract §2.5): validators enforce shape and range; no write
 * path may compute, derive, or auto-adjust it. Fail-closed: returns every violation.
 * @param {Object} properties
 * @returns {{valid: Boolean, errors: String[]}}
 */
export function validateEvolutionGoalProperties(properties) {
    const props    = properties ?? {};
    const {errors} = validateBusinessProperties(props);

    if (slugifyIdPart(props.slug) === '') {
        errors.push('missing EVOLUTION_GOAL identity property "slug" (stable operator slug)');
    }

    if (!EVOLUTION_GOAL_LIFECYCLE.includes(props.lifecycle)) {
        errors.push(`"lifecycle" must be one of [${EVOLUTION_GOAL_LIFECYCLE.join(', ')}]`);
    }

    if (typeof props.intentWeight !== 'number' || !Number.isFinite(props.intentWeight) || props.intentWeight <= 0 || props.intentWeight > 1) {
        errors.push('"intentWeight" must be a finite number in (0, 1] — operator-set (Tier-4), never computed');
    }

    if (!EVOLUTION_GOAL_SEED_CLASSES.includes(props.seedClass)) {
        errors.push(`"seedClass" must be one of [${EVOLUTION_GOAL_SEED_CLASSES.join(', ')}] — operator anchors count against the cap; release-train seeds are free`);
    }

    return {valid: errors.length === 0, errors};
}

/**
 * @summary Enforces the small-N declared-anchor cap (the direction contract §2.5) at plan time.
 *
 * Counts only `operator`-class ACTIVE goals — release-train seeds and retired/achieved goals are
 * exempt. Pure check: the writer calls this before minting a new operator anchor.
 * @param {Object[]} existingGoals Current `EVOLUTION_GOAL` property records
 * @returns {{atCap: Boolean, operatorActiveCount: Number, cap: Number}}
 */
export function checkDeclaredAnchorCap(existingGoals) {
    const operatorActiveCount = (Array.isArray(existingGoals) ? existingGoals : [])
        .filter(goal => goal != null && goal.seedClass === 'operator' && goal.lifecycle === 'active')
        .length;

    return {atCap: operatorActiveCount >= DECLARED_ANCHOR_CAP, operatorActiveCount, cap: DECLARED_ANCHOR_CAP};
}

/**
 * @summary Validates one attribution fact against the direction contract.
 *
 * Every fact must name: its motion source, a valid direction key, the mapping version that
 * produced it, its share of the motion unit, the declared filter set it was computed under
 * (the direction contract §2.4 — filters are never implicit), and the query that would falsify it (§2.4
 * falsifier symmetry; the `falsifyingQuery` MUST apply the same filter set and version pin).
 * @param {Object} fact
 * @returns {{valid: Boolean, errors: String[]}}
 */
export function validateAttributionFact(fact) {
    const errors = [];
    const f      = fact ?? {};

    if (slugifyIdPart(f.motionId) === '') {
        errors.push('missing attribution property "motionId" (the motion fact\'s graph node id)');
    }

    if (!isDirectionKey(f.directionKey)) {
        errors.push(`"directionKey" must be a declared goal id ("${DIRECTION_ID_PREFIXES.EVOLUTION_GOAL}…"), a cluster key ("${DIRECTION_ID_PREFIXES.CLUSTER_KEY}…"), or "${UNATTRIBUTED_DIRECTION_KEY}"`);
    }

    if (!Number.isInteger(f.mappingVersion) || f.mappingVersion < 1) {
        errors.push('"mappingVersion" must be a positive integer — attribution history is append-only under version');
    }

    if (typeof f.share !== 'number' || !Number.isFinite(f.share) || f.share <= 0 || f.share > 1) {
        errors.push('"share" must be a finite number in (0, 1] — a motion unit\'s measure distributes over its directions');
    }

    if (typeof f.filterSet !== 'string' || f.filterSet.trim() === '') {
        errors.push('"filterSet" must be a non-empty string — motion inputs are class-filtered by construction, never implicitly (the direction contract §2.4)');
    }

    if (typeof f.falsifyingQuery !== 'string' || f.falsifyingQuery.trim() === '') {
        errors.push('"falsifyingQuery" must be a non-empty string — an attribution that cannot name its falsifier is invalid by construction');
    }

    return {valid: errors.length === 0, errors};
}

/**
 * @summary Machine-checks the conservation identity for one window under one filter set
 * (the direction contract §2.3): the attributed shares plus the UNATTRIBUTED pool must sum to 1.
 *
 * A failed identity is a BUILD DEFECT, never noise — the caller (the L1 aggregation lane) must
 * refuse the window, not clamp it. The UNATTRIBUTED entry is required even at share 0: the pool's
 * visibility is the fail-open floor.
 * @param {Object} breakdown Map of breakdown key (or the UNATTRIBUTED key) → share
 * @param {Number} [epsilon=CONSERVATION_EPSILON] Float tolerance
 * @returns {{valid: Boolean, total: Number, unattributedShare: Number|null, errors: String[]}}
 */
export function validateConservation(breakdown, epsilon = CONSERVATION_EPSILON) {
    const errors  = [];
    const entries = Object.entries(breakdown ?? {});

    if (entries.length === 0) {
        return {valid: false, total: 0, unattributedShare: null, errors: ['conservation check requires at least the UNATTRIBUTED pool entry']};
    }

    let total             = 0;
    let unattributedShare = null;

    for (const [key, share] of entries) {
        if (typeof share !== 'number' || !Number.isFinite(share) || share < 0) {
            errors.push(`share for "${key}" must be a finite number >= 0`);
            continue;
        }

        total += share;

        if (key === UNATTRIBUTED_DIRECTION_KEY) {
            unattributedShare = share;
        } else {
            // Throws on malformed keys — a breakdown with an unparseable key is itself a defect.
            try {
                parseBreakdownKey(key);
            } catch (e) {
                errors.push(e.message);
            }
        }
    }

    if (unattributedShare === null) {
        errors.push(`missing "${UNATTRIBUTED_DIRECTION_KEY}" entry — the pool is first-class, present even at share 0`);
    }

    if (Math.abs(total - 1) > epsilon) {
        errors.push(`conservation violated: shares sum to ${total}, expected 1 (±${epsilon}) — Σ attributed + unattributed = total is a build invariant, not a target`);
    }

    return {valid: errors.length === 0, total, unattributedShare, errors};
}
