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
    [CORPUS_PROJECTION_CONSUMER.dreamRem]          : CORPUS_PROJECTION_FACETS,
    [CORPUS_PROJECTION_CONSUMER.knowledgeSearch]   : CORPUS_PROJECTION_FACETS
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
 * @param {String} [options.now=new Date().toISOString()] Observation timestamp.
 * @returns {Object}
 */
export function createCorpusProjectionReceipt({sourceRepository, sourceRef, now = new Date().toISOString()} = {}) {
    if (typeof sourceRepository !== 'string' || !sourceRepository.trim()) {
        throw new Error('Corpus projection receipt requires a non-empty sourceRepository')
    }
    if (typeof sourceRef !== 'string' || !sourceRef.trim()) {
        throw new Error('Corpus projection receipt requires a non-empty sourceRef')
    }

    return {
        schemaVersion            : CORPUS_PROJECTION_SCHEMA_VERSION,
        sourceRepository         : sourceRepository.trim(),
        sourceRef                : sourceRef.trim(),
        availableCorpusRevision  : null,
        projectedRevisionByFacet : buildFacetMap(() => null),
        projectionStateByFacet   : buildFacetMap(() => ({status: 'never', observedAt: now, errorCode: null})),
        lastFullMaterializationAt: null,
        updatedAt                : now
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
    if (value.availableCorpusRevision !== null && !isRevision(value.availableCorpusRevision)) {
        return {valid: false, code: 'available-revision-invalid', receipt: null}
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

    const next = cloneReceipt(normalized.receipt);
    next.availableCorpusRevision = availableRevision;
    next.updatedAt = now;

    for (const facet of facets) {
        if (!CORPUS_PROJECTION_FACETS.includes(facet)) throw new Error(`Unknown corpus projection facet: ${facet}`);
        next.projectionStateByFacet[facet] = {status: 'projecting', observedAt: now, errorCode: null}
    }

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
 * @returns {{admitted: Boolean, fallback: 'current'|'last-known-good', reasonCode: String, requiredFacets: String[], staleFacets: String[]}}
 */
export function evaluateCorpusProjectionAdmission({consumer, receipt} = {}) {
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

    return {
        admitted      : staleFacets.length === 0,
        fallback      : staleFacets.length === 0 ? 'current' : 'last-known-good',
        reasonCode    : staleFacets.length === 0 ? 'projection-current' : 'required-facet-stale',
        requiredFacets: [...requiredFacets],
        staleFacets
    }
}
