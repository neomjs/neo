/**
 * @module ai/services/graph/corpusProjectionContract
 * @summary Pure source-revision and consumer-admission contract for the container-owned core-corpus
 * projection lane.
 *
 * One projection run mutates SQLite and Chroma in place. A facet receipt is therefore not merely
 * diagnostics: every graph consumer must name the facets it needs and refuse a new read while any
 * named facet is projecting, failed, source-less, or behind the available corpus revision. The
 * fallback is always the last-known-good consumer artifact; never a mixed live-store read.
 *
 * The source identity sits once at the receipt root on purpose. Per-facet revisions without a
 * repository/ref identity are invalid rather than silently compared across unrelated histories —
 * the AgentOS extraction makes the image and corpus repositories different histories by design.
 */

export const CORPUS_PROJECTION_SCHEMA_VERSION = 'neo.corpus-projection/v1';
export const CORPUS_PROJECTION_OWNER          = 'core-corpus-projection';

export const CORPUS_PROJECTION_FACETS = Object.freeze([
    'issues',
    'pulls',
    'discussions'
]);

export const CORPUS_PROJECTION_CONSUMER = Object.freeze({
    computedGoldenPath: 'computed-golden-path',
    contextFrontier   : 'context-frontier',
    dreamRem          : 'dream-rem',
    knowledgeSearch   : 'knowledge-search'
});

export const CORPUS_PROJECTION_CONSUMER_FACETS = Object.freeze({
    [CORPUS_PROJECTION_CONSUMER.computedGoldenPath]: Object.freeze(['issues', 'discussions']),
    [CORPUS_PROJECTION_CONSUMER.contextFrontier]   : CORPUS_PROJECTION_FACETS,
    // REM's Tri-Vector schema can emit ISSUE nodes, but has no DISCUSSION/PULL_REQUEST node types.
    [CORPUS_PROJECTION_CONSUMER.dreamRem]          : Object.freeze(['issues']),
    // KB search reads the separate curated knowledge-base collection, never neo_graph_nodes.
    [CORPUS_PROJECTION_CONSUMER.knowledgeSearch]   : Object.freeze([])
});

const PROJECTION_STATES = Object.freeze(new Set([
    'never',
    'projecting',
    'committed',
    'failed'
]));

const REVISION_PATTERN = /^[0-9a-f]{40}$/i;

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isRevision(value) {
    return typeof value === 'string' && REVISION_PATTERN.test(value)
}

function buildFacetMap(factory) {
    return Object.fromEntries(CORPUS_PROJECTION_FACETS.map(facet => [facet, factory(facet)]))
}

function cloneReceipt(receipt) {
    return {
        ...receipt,
        projectedRevisionByFacet: {...receipt.projectedRevisionByFacet},
        projectionStateByFacet  : buildFacetMap(facet => ({...receipt.projectionStateByFacet[facet]}))
    }
}

/**
 * @summary Creates the source-bound empty receipt written before the first mirror fetch.
 * @param {Object} options
 * @param {String} options.sourceRepository Explicit corpus repository clone identity.
 * @param {String} options.sourceRef Explicit ref resolved inside that repository.
 * @param {Number} options.freshnessSlaMs Declared axis-2 freshness bound.
 * @param {String} [options.now=new Date().toISOString()] Observation timestamp.
 * @returns {Object}
 */
export function createCorpusProjectionReceipt({
    sourceRepository,
    sourceRef,
    freshnessSlaMs,
    now = new Date().toISOString()
} = {}) {
    if (typeof sourceRepository !== 'string' || !sourceRepository.trim()) {
        throw new Error('Corpus projection receipt requires a non-empty sourceRepository')
    }
    if (typeof sourceRef !== 'string' || !sourceRef.trim()) {
        throw new Error('Corpus projection receipt requires a non-empty sourceRef')
    }
    if (!Number.isFinite(freshnessSlaMs) || freshnessSlaMs <= 0) {
        throw new Error('Corpus projection receipt requires a positive freshnessSlaMs')
    }

    return {
        schemaVersion             : CORPUS_PROJECTION_SCHEMA_VERSION,
        sourceRepository          : sourceRepository.trim(),
        sourceRef                 : sourceRef.trim(),
        freshnessSlaMs,
        availableCorpusRevision   : null,
        availableCorpusObservedAt : null,
        materializedCorpusRevision: null,
        projectedRevisionByFacet  : buildFacetMap(() => null),
        projectionStateByFacet    : buildFacetMap(() => ({status: 'never', observedAt: now, errorCode: null})),
        lastFullMaterializationAt : null,
        lastCheckedAt             : now,
        updatedAt                 : now
    }
}

/**
 * @summary Validates and normalizes one persisted projection receipt without throwing at consumers.
 * @param {*} value Candidate receipt.
 * @returns {{valid: Boolean, code: String|null, receipt: Object|null}}
 */
export function normalizeCorpusProjectionReceipt(value) {
    if (!isPlainObject(value)) return {valid: false, code: 'receipt-missing', receipt: null};
    if (value.schemaVersion !== CORPUS_PROJECTION_SCHEMA_VERSION) {
        return {valid: false, code: 'schema-version-invalid', receipt: null}
    }
    if (typeof value.sourceRepository !== 'string' || !value.sourceRepository.trim() ||
        typeof value.sourceRef !== 'string' || !value.sourceRef.trim()) {
        return {valid: false, code: 'source-identity-missing', receipt: null}
    }
    if (!Number.isFinite(value.freshnessSlaMs) || value.freshnessSlaMs <= 0) {
        return {valid: false, code: 'freshness-sla-invalid', receipt: null}
    }
    if (!Number.isFinite(Date.parse(value.lastCheckedAt || ''))) {
        return {valid: false, code: 'last-checked-at-invalid', receipt: null}
    }
    if (value.availableCorpusObservedAt !== null && !Number.isFinite(Date.parse(value.availableCorpusObservedAt))) {
        return {valid: false, code: 'available-observed-at-invalid', receipt: null}
    }
    if (value.availableCorpusRevision !== null && !isRevision(value.availableCorpusRevision)) {
        return {valid: false, code: 'available-revision-invalid', receipt: null}
    }
    if (value.materializedCorpusRevision !== null && !isRevision(value.materializedCorpusRevision)) {
        return {valid: false, code: 'materialized-revision-invalid', receipt: null}
    }
    if (!isPlainObject(value.projectedRevisionByFacet) || !isPlainObject(value.projectionStateByFacet)) {
        return {valid: false, code: 'facet-map-missing', receipt: null}
    }

    for (const facet of CORPUS_PROJECTION_FACETS) {
        const revision = value.projectedRevisionByFacet[facet],
              state    = value.projectionStateByFacet[facet];

        if (revision !== null && !isRevision(revision)) {
            return {valid: false, code: `projected-revision-invalid:${facet}`, receipt: null}
        }
        if (!isPlainObject(state) || !PROJECTION_STATES.has(state.status)) {
            return {valid: false, code: `projection-state-invalid:${facet}`, receipt: null}
        }
        if (state.status === 'committed' && revision === null) {
            return {valid: false, code: `committed-revision-missing:${facet}`, receipt: null}
        }
    }

    return {
        valid  : true,
        code   : null,
        receipt: cloneReceipt(value)
    }
}

/**
 * @summary Marks selected facets projecting against one exact available source revision.
 * @param {Object} options
 * @param {Object} options.receipt Current valid receipt.
 * @param {String} options.availableRevision Exact source commit.
 * @param {String[]} [options.facets=CORPUS_PROJECTION_FACETS]
 * @param {String} [options.now=new Date().toISOString()]
 * @returns {Object}
 */
export function beginCorpusProjection({
    receipt,
    availableRevision,
    facets = CORPUS_PROJECTION_FACETS,
    now = new Date().toISOString()
} = {}) {
    const normalized = normalizeCorpusProjectionReceipt(receipt);

    if (!normalized.valid) throw new Error(`Cannot begin corpus projection: ${normalized.code}`);
    if (!isRevision(availableRevision)) throw new Error('Corpus projection requires a full 40-character source revision');

    const next            = cloneReceipt(normalized.receipt);
    const revisionChanged = next.availableCorpusRevision !== availableRevision;
    next.availableCorpusRevision = availableRevision;
    if (revisionChanged || !next.availableCorpusObservedAt) next.availableCorpusObservedAt = now;
    next.lastCheckedAt = now;
    next.updatedAt = now;

    for (const facet of facets) {
        if (!CORPUS_PROJECTION_FACETS.includes(facet)) throw new Error(`Unknown corpus projection facet: ${facet}`);
        next.projectionStateByFacet[facet] = {status: 'projecting', observedAt: now, errorCode: null}
    }

    return next
}

/**
 * @summary Records that the exact available source revision is fully materialized for ingestion.
 * @param {Object} options
 * @param {Object} options.receipt Current projecting receipt.
 * @param {String} options.revision Exact materialized source revision.
 * @param {Boolean} [options.full=false] True stamps the periodic/full-materialization clock.
 * @param {String} [options.now=new Date().toISOString()]
 * @returns {Object}
 */
export function recordCorpusMaterialization({
    receipt,
    revision,
    full = false,
    now = new Date().toISOString()
} = {}) {
    const normalized = normalizeCorpusProjectionReceipt(receipt);

    if (!normalized.valid) throw new Error(`Cannot record corpus materialization: ${normalized.code}`);
    if (!isRevision(revision) || revision !== normalized.receipt.availableCorpusRevision) {
        throw new Error('Materialized revision must equal the receipt availableCorpusRevision')
    }

    const next = cloneReceipt(normalized.receipt);
    next.materializedCorpusRevision = revision;
    if (full) next.lastFullMaterializationAt = now;
    next.updatedAt = now;

    return next
}

/**
 * @summary Commits one facet cursor to the receipt's exact available revision.
 * @param {Object} options
 * @param {Object} options.receipt Current projecting receipt.
 * @param {String} options.facet Facet to commit.
 * @param {String} [options.now=new Date().toISOString()]
 * @returns {Object}
 */
export function commitCorpusProjectionFacet({receipt, facet, now = new Date().toISOString()} = {}) {
    const normalized = normalizeCorpusProjectionReceipt(receipt);

    if (!normalized.valid) throw new Error(`Cannot commit corpus projection facet: ${normalized.code}`);
    if (!CORPUS_PROJECTION_FACETS.includes(facet)) throw new Error(`Unknown corpus projection facet: ${facet}`);
    if (!isRevision(normalized.receipt.availableCorpusRevision)) {
        throw new Error('Cannot commit corpus projection facet without an available source revision')
    }

    const next = cloneReceipt(normalized.receipt);
    next.projectedRevisionByFacet[facet] = next.availableCorpusRevision;
    next.projectionStateByFacet[facet] = {status: 'committed', observedAt: now, errorCode: null};
    next.updatedAt = now;

    return next
}

/**
 * @summary Records one failed facet without advancing its last committed revision.
 * @param {Object} options
 * @param {Object} options.receipt Current projecting receipt.
 * @param {String} options.facet Failed facet.
 * @param {String} options.errorCode Stable failure code.
 * @param {String} [options.now=new Date().toISOString()]
 * @returns {Object}
 */
export function failCorpusProjectionFacet({receipt, facet, errorCode, now = new Date().toISOString()} = {}) {
    const normalized = normalizeCorpusProjectionReceipt(receipt);

    if (!normalized.valid) throw new Error(`Cannot fail corpus projection facet: ${normalized.code}`);
    if (!CORPUS_PROJECTION_FACETS.includes(facet)) throw new Error(`Unknown corpus projection facet: ${facet}`);
    if (typeof errorCode !== 'string' || !errorCode.trim()) throw new Error('Failed corpus projection facet requires errorCode');

    const next = cloneReceipt(normalized.receipt);
    next.projectionStateByFacet[facet] = {status: 'failed', observedAt: now, errorCode: errorCode.trim()};
    next.updatedAt = now;

    return next
}

/**
 * @summary Decides whether one consumer may read the live graph projection.
 * @param {Object} options
 * @param {String} options.consumer Canonical consumer id.
 * @param {*} options.receipt Persisted projection receipt.
 * @param {String|null} [options.expectedSourceRepository=null] Consumer-configured source repository.
 * @param {String|null} [options.expectedSourceRef=null] Consumer-configured source ref.
 * @param {Date|Number} [options.now=Date.now()] Freshness evaluation clock.
 * @returns {{admitted: Boolean, fallback: 'current'|'last-known-good', reasonCode: String, requiredFacets: String[], staleFacets: String[]}}
 */
export function evaluateCorpusProjectionAdmission({
    consumer,
    receipt,
    expectedSourceRepository = null,
    expectedSourceRef = null,
    now = Date.now()
} = {}) {
    const requiredFacets = CORPUS_PROJECTION_CONSUMER_FACETS[consumer];

    if (!requiredFacets) {
        return {
            admitted      : false,
            fallback      : 'last-known-good',
            reasonCode    : 'consumer-unclassified',
            requiredFacets: [],
            staleFacets   : []
        }
    }

    if (requiredFacets.length === 0) {
        return {
            admitted      : true,
            fallback      : 'current',
            reasonCode    : 'no-facet-dependency',
            requiredFacets: [],
            staleFacets   : []
        }
    }

    const normalized = normalizeCorpusProjectionReceipt(receipt);

    if (!normalized.valid) {
        return {
            admitted      : false,
            fallback      : 'last-known-good',
            reasonCode    : normalized.code,
            requiredFacets: [...requiredFacets],
            staleFacets   : [...requiredFacets]
        }
    }

    if ((expectedSourceRepository != null && normalized.receipt.sourceRepository !== expectedSourceRepository.trim()) ||
        (expectedSourceRef != null && normalized.receipt.sourceRef !== expectedSourceRef.trim())) {
        return {
            admitted      : false,
            fallback      : 'last-known-good',
            reasonCode    : 'source-identity-mismatch',
            requiredFacets: [...requiredFacets],
            staleFacets   : [...requiredFacets]
        }
    }

    const {availableCorpusRevision, projectedRevisionByFacet, projectionStateByFacet} = normalized.receipt;

    if (!isRevision(availableCorpusRevision)) {
        return {
            admitted      : false,
            fallback      : 'last-known-good',
            reasonCode    : 'available-revision-missing',
            requiredFacets: [...requiredFacets],
            staleFacets   : [...requiredFacets]
        }
    }

    const staleFacets = requiredFacets.filter(facet =>
        projectedRevisionByFacet[facet] !== availableCorpusRevision ||
        projectionStateByFacet[facet].status !== 'committed'
    );

    const freshness   = evaluateCorpusProjectionFreshness({receipt: normalized.receipt, now});
    const slaBreached = freshness.reasonCodes.includes('source-check-overdue') ||
        (staleFacets.length > 0 && freshness.reasonCodes.includes('projection-lag-overdue'));
    const admitted = staleFacets.length === 0 && !slaBreached;

    return {
        admitted,
        fallback  : admitted ? 'current' : 'last-known-good',
        reasonCode: staleFacets.length === 0
            ? (slaBreached ? 'freshness-sla-breached' : 'projection-current')
            : (slaBreached ? 'freshness-sla-breached' : 'required-facet-stale'),
        requiredFacets: [...requiredFacets],
        staleFacets
    }
}

/**
 * @summary Classifies axis-2 freshness from the source-check clock and current-head projection age.
 * @param {Object} options
 * @param {*} options.receipt Candidate receipt.
 * @param {Date|Number} [options.now=Date.now()] Evaluation clock.
 * @returns {Object}
 */
export function evaluateCorpusProjectionFreshness({receipt, now = Date.now()} = {}) {
    const normalized = normalizeCorpusProjectionReceipt(receipt);
    const nowMs      = now instanceof Date ? now.getTime() : Number(now);

    if (!normalized.valid || !Number.isFinite(nowMs)) {
        return {
            status                 : 'unavailable',
            posture                : 'degraded',
            reasonCodes            : [normalized.valid ? 'clock-invalid' : normalized.code],
            freshnessSlaMs         : normalized.receipt?.freshnessSlaMs ?? null,
            sourceCheckAgeMs       : null,
            projectionLagAgeMs     : null,
            staleFacets            : [...CORPUS_PROJECTION_FACETS],
            sourceRepository       : normalized.receipt?.sourceRepository ?? null,
            sourceRef              : normalized.receipt?.sourceRef ?? null,
            availableCorpusRevision: normalized.receipt?.availableCorpusRevision ?? null
        }
    }

    const value            = normalized.receipt;
    const sourceCheckAgeMs = Math.max(0, nowMs - Date.parse(value.lastCheckedAt));
    const staleFacets      = CORPUS_PROJECTION_FACETS.filter(facet =>
        value.projectedRevisionByFacet[facet] !== value.availableCorpusRevision ||
        value.projectionStateByFacet[facet].status !== 'committed'
    );
    const projectionLagAgeMs = staleFacets.length > 0 && value.availableCorpusObservedAt
        ? Math.max(0, nowMs - Date.parse(value.availableCorpusObservedAt))
        : 0;
    const reasonCodes = [];

    if (sourceCheckAgeMs > value.freshnessSlaMs) reasonCodes.push('source-check-overdue');
    if (staleFacets.length > 0 && projectionLagAgeMs > value.freshnessSlaMs) {
        reasonCodes.push('projection-lag-overdue')
    }

    return {
        status                 : reasonCodes.length > 0 ? 'breached' : (staleFacets.length > 0 ? 'lagging' : 'current'),
        posture                : reasonCodes.length > 0 ? 'degraded' : (staleFacets.length > 0 ? 'pending' : 'healthy'),
        reasonCodes,
        freshnessSlaMs         : value.freshnessSlaMs,
        sourceCheckAgeMs,
        projectionLagAgeMs,
        staleFacets,
        sourceRepository       : value.sourceRepository,
        sourceRef              : value.sourceRef,
        availableCorpusRevision: value.availableCorpusRevision
    }
}

/**
 * @summary Produces the stable pre/post-read token consumers use to discard a pass when projection
 * state changes while they hydrate the live SQLite/Chroma pair.
 * @param {*} receipt Candidate receipt.
 * @returns {String|null} Stable valid-receipt token, otherwise null.
 */
export function createCorpusProjectionAdmissionFingerprint(receipt) {
    const normalized = normalizeCorpusProjectionReceipt(receipt);

    if (!normalized.valid) return null;

    const value = normalized.receipt;

    return JSON.stringify({
        sourceRepository        : value.sourceRepository,
        sourceRef               : value.sourceRef,
        availableCorpusRevision : value.availableCorpusRevision,
        projectedRevisionByFacet: value.projectedRevisionByFacet,
        projectionStateByFacet  : value.projectionStateByFacet
    })
}
