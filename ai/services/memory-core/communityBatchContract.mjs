import crypto        from 'crypto';
import {ACTOR_KINDS} from './communityAttentionClassifier.mjs';

/**
 * @summary The versioned canonical batch contract for community-activity admission.
 * Providers acquire and normalize; Memory Core validates and admits. Bumping this string is a
 * breaking contract change — admission refuses any batch that does not declare exactly this version,
 * so an older connector fails loudly at the boundary instead of half-admitting an unknown shape.
 * @member {String}
 */
export const BATCH_SCHEMA_VERSION = 'community-activity-batch.v1';

/**
 * @summary Bound on the opaque `nextProviderState` blob. It is opaque to Memory Core but not
 * unbounded: an unbounded caller-supplied blob is a denial-of-storage vector, so it is size-capped,
 * schema-versioned, and held to the same no-secret/no-prose rule as every other durable field.
 * @member {Number}
 */
export const MAX_PROVIDER_STATE_BYTES = 65536;

/**
 * @summary Maximum observations accepted by one synchronous hosted MCP push.
 *
 * This mirrors the established small-work MCP boundary: larger acquisition windows stay connector-side
 * and are split into checkpoint-chained batches instead of turning Memory Core into a queue receiver.
 * @member {Number}
 */
export const MAX_HOSTED_OBSERVATIONS = 50;

/**
 * @summary Maximum UTF-8 bytes accepted by one hosted community batch envelope.
 * @member {Number}
 */
export const MAX_HOSTED_BATCH_BYTES = 256 * 1024;

const
    REQUIRED_BATCH_KEYS       = [
        'schemaVersion', 'sourceInstanceId', 'resourceFamily', 'adapterSchemaVersion',
        'providerStateSchemaVersion', 'registrationEpoch', 'baseCheckpointVersion', 'baseInventoryHash',
        'batchId', 'observations', 'nextProviderState', 'nextInventoryHash', 'coverage'
    ],
    REQUIRED_COVERAGE_KEYS    = ['fromBasis', 'toBasis', 'complete'],
    /**
     * v1 keys that must be PRESENT but may hold `null`: the initial checkpoint basis has no prior
     * inventory, and a batch that changes no opaque provider state carries `null`. Presence is still
     * required so a reduced batch (an omitted key) fails loudly rather than defaulting.
     */
    NULLABLE_BATCH_KEYS              = new Set(['baseInventoryHash', 'nextInventoryHash', 'nextProviderState']),
    OPTIONAL_OBSERVATION_STRING_KEYS = ['parentProviderEntityId', 'providerState', 'sourceAssociation'],
    REQUIRED_OBSERVATION_KEYS        = ['providerEntityId', 'occurrenceKind', 'occurrenceCoordinate', 'occurredAt', 'actorKind'],
    /**
     * Provider prose never enters an automatic durable row. A batch carrying any of these is
     * REJECTED rather than silently stripped: stripping would let a connector believe prose was
     * admitted and stored, which is a worse contract than a loud refusal.
     */
    PROSE_KEYS                = new Set(['body', 'bodyHTML', 'bodyText', 'excerpt', 'summary', 'text', 'title']),
    /** Absence is never inferred — it is one of three explicitly-evidenced dispositions. */
    ABSENCE_DISPOSITIONS      = new Set(['deleted', 'inaccessible', 'unknown']),
    /**
     * Popularity telemetry sits OUTSIDE the community-event source families. It is refused at the
     * boundary rather than admitted-then-filtered, because an admitted row is durable history that
     * later surfaces (counts, Bird View, wake, claim) would have to keep re-excluding forever.
     */
    POPULARITY_KINDS          = new Set([
        'repository.forked', 'repository.starred', 'repository.unstarred', 'repository.watched', 'repository.unwatched'
    ]),
    /**
     * Server-owned policy output. Attention eligibility is a zero-authority judgement made by a
     * server-side classifier and written in the same admission transaction — it is NOT connector
     * payload. Two consequences, both enforced here: a connector may not self-assert it (validation
     * refuses), and it never enters any digest (so revising our policy can never masquerade as
     * connector corruption on an otherwise-identical batch).
     */
    SERVER_POLICY_KEYS        = new Set(['attentionDisposition', 'attentionReason', 'eligibility', 'eligibilityReason', 'trustProjection']);

const
    HOSTED_AUTHORITY_KEYS = new Set(['registrationEpoch', 'sourceInstanceId', 'tenantId']),
    HOSTED_SOURCE_KEYS    = ['canonicalProviderHost', 'resourceKind', 'providerResourceId'],
    SENSITIVE_KEY_PATTERN = /(?:authorization|credential|password|private[-_]?key|secret|token)/i;

/**
 * @summary Returns true when an object graph carries credential-shaped key names.
 *
 * Provider grants and resolved secrets belong to the connector. The hosted wire contract refuses the
 * whole envelope rather than attempting lossy redaction, so a connector can never mistake a stripped
 * credential for admitted state. Values are deliberately not inspected or echoed.
 * @param {*} value
 * @returns {Boolean}
 */
export function carriesCredentialMaterial(value) {
    if (!value || typeof value !== 'object') return false;

    if (Array.isArray(value)) {
        return value.some(carriesCredentialMaterial)
    }

    return Object.entries(value).some(([key, nested]) => (
        SENSITIVE_KEY_PATTERN.test(key) || carriesCredentialMaterial(nested)
    ))
}

/**
 * @summary Returns true when any hosted payload level attempts to assert server-owned authority.
 *
 * The recursive walk is deliberate: OpenAPI normalization can remove unknown nested properties.
 * Authority claims therefore have to fail on the raw request rather than disappear before the
 * admission service sees them.
 * @param {*} value
 * @returns {Boolean}
 */
export function carriesHostedAuthority(value) {
    if (!value || typeof value !== 'object') return false;

    if (Array.isArray(value)) {
        return value.some(carriesHostedAuthority)
    }

    return Object.entries(value).some(([key, nested]) => (
        HOSTED_AUTHORITY_KEYS.has(key) || carriesHostedAuthority(nested)
    ))
}

/**
 * @summary Measures one hosted connector envelope without retaining its content.
 * @param {Object} envelope
 * @returns {{bytes: Number, observations: Number}}
 */
export function measureHostedEnvelope(envelope) {
    let bytes = Number.POSITIVE_INFINITY;

    try {
        bytes = Buffer.byteLength(JSON.stringify(envelope), 'utf8')
    } catch {}

    return {
        bytes,
        observations: Array.isArray(envelope?.batch?.observations)
            ? envelope.batch.observations.length
            : 0
    }
}

/**
 * @summary Validates the hosted connector boundary before source resolution or database work.
 *
 * Tenant, durable source id, and registration epoch are server authority. A remote connector supplies
 * only the neutral provider identity used for the tenant-scoped lookup plus the authority-free batch.
 * @param {Object} envelope
 * @param {Object} [limits]
 * @param {Number} [limits.maxBytes]
 * @param {Number} [limits.maxObservations]
 * @returns {{valid: Boolean, errors: String[], volume: {bytes: Number, observations: Number}}}
 */
export function validateHostedEnvelope(envelope, {
    maxBytes        = MAX_HOSTED_BATCH_BYTES,
    maxObservations = MAX_HOSTED_OBSERVATIONS
} = {}) {
    const errors = [];

    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
        return {
            valid : false,
            errors: ['HOSTED_ENVELOPE_NOT_AN_OBJECT'],
            volume: {bytes: 0, observations: 0}
        }
    }

    const {source, batch} = envelope;

    if (!source || typeof source !== 'object' || Array.isArray(source)) {
        errors.push('HOSTED_SOURCE_IDENTITY_REQUIRED')
    } else {
        HOSTED_SOURCE_KEYS.forEach(key => {
            if (typeof source[key] !== 'string' || !source[key].trim()) {
                errors.push(`HOSTED_SOURCE_${key.toUpperCase()}_REQUIRED`)
            }
        })
    }

    if (!batch || typeof batch !== 'object' || Array.isArray(batch)) {
        errors.push('HOSTED_BATCH_REQUIRED')
    }

    if (carriesHostedAuthority(envelope)) {
        errors.push('HOSTED_AUTHORITY_FIELDS_FORBIDDEN')
    }

    if (carriesCredentialMaterial(envelope)) {
        errors.push('HOSTED_CREDENTIAL_MATERIAL_FORBIDDEN')
    }

    if (batch && typeof batch === 'object' && !Array.isArray(batch)) {
        const contract = validateBatch({
            ...batch,
            sourceInstanceId : 'server-resolved-hosted-source',
            registrationEpoch: 1
        });

        errors.push(...contract.errors)
    }

    const volume = measureHostedEnvelope(envelope);

    if (!Number.isFinite(volume.bytes)) {
        errors.push('HOSTED_ENVELOPE_NOT_SERIALIZABLE')
    } else if (volume.bytes > maxBytes) {
        errors.push('HOSTED_BATCH_BYTES_EXCEEDED')
    }

    if (volume.observations > maxObservations) {
        errors.push('HOSTED_BATCH_OBSERVATIONS_EXCEEDED')
    }

    return {valid: errors.length === 0, errors, volume}
}

/**
 * Returns an observation without server-owned policy fields, so digests are computed over
 * connector-supplied payload only and stay stable across policy revisions.
 * @param {Object} observation
 * @returns {Object}
 */
function connectorPayloadOf(observation) {
    return Object.keys(observation)
        .filter(key => !SERVER_POLICY_KEYS.has(key))
        .reduce((out, key) => {
            out[key] = observation[key];
            return out
        }, {})
}

/**
 * @summary Deterministically serializes a value so equal payloads yield equal strings.
 *
 * Object keys are sorted. Arrays deliberately keep their order here: array-ordering policy is a
 * per-collection semantic decision, not a global one, and a blanket sort is exactly the trap that
 * would silently weaken corruption detection. The one collection whose order is normalized is the
 * observation list, and that happens once, explicitly, in {@link canonicalBatchDigest}.
 * @param {*} value
 * @returns {String}
 */
function canonicalize(value) {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalize).join(',')}]`
    }

    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
    }

    return JSON.stringify(value === undefined ? null : value)
}

/**
 * @summary The stable identity of one observed change — the same across retries, distinct per
 * revision. It is derived from `(sourceInstanceId, providerEntityId, occurrenceKind,
 * occurrenceCoordinate)`, NOT minted per insert, so the same observation arriving in two different
 * batches shares one identity (dedup) while a genuine revision — which carries a different
 * `occurrenceCoordinate` — is a new identity and a new immutable fact.
 * @param {String} sourceInstanceId
 * @param {Object} observation
 * @returns {String} `occ:<hex>`
 */
export function occurrenceIdentity(sourceInstanceId, observation) {
    const key = canonicalize([sourceInstanceId, observation.providerEntityId, observation.occurrenceKind, observation.occurrenceCoordinate]);

    return `occ:${crypto.createHash('sha256').update(key).digest('hex')}`
}

/**
 * @summary The per-observation content digest over its connector payload. Admission uses
 * `(occurrenceIdentity, observationDigest)` as the dedup key: same identity + same digest is a
 * retry; same identity + different digest is an integrity conflict.
 * @param {Object} observation
 * @returns {String} `sha256:<hex>`
 */
export function observationDigest(observation) {
    return `sha256:${crypto.createHash('sha256').update(canonicalize(connectorPayloadOf(observation))).digest('hex')}`
}

/**
 * @summary The batch corruption detector: a stable digest over the whole v1 connector payload.
 *
 * Admission treats `batchId` + this digest as the idempotency key — same id and same digest is a
 * retry, same id and a different digest is an integrity conflict. Server policy is excluded so a
 * policy revision cannot masquerade as corruption; everything else the connector supplies (including
 * the opaque `nextProviderState` and the base/next checkpoint+inventory anchors) participates,
 * because a batch that advances to a different next-state IS a different batch.
 *
 * **Ordering decision (witness-pinned):** the observation collection is normalized order-INSENSITIVELY
 * (ordering authority is the server-assigned admitted sequence, not payload position) but never
 * de-duplicated — duplicate multiplicity stays digest-visible. Ordering inside an observation is
 * preserved.
 * @param {Object} batch
 * @returns {String} `sha256:<hex>`
 */
export function canonicalBatchDigest(batch) {
    const
        {
            batchId, sourceInstanceId, resourceFamily, adapterSchemaVersion, providerStateSchemaVersion,
            registrationEpoch, baseCheckpointVersion, baseInventoryHash, nextProviderState, nextInventoryHash,
            coverage, observations = []
        } = batch,
        orderedObservations = observations
            .map(observation => canonicalize(connectorPayloadOf(observation)))
            .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
        payload = canonicalize({
            adapterSchemaVersion,
            baseCheckpointVersion,
            baseInventoryHash,
            batchId,
            coverage,
            nextInventoryHash,
            nextProviderState,
            providerStateSchemaVersion,
            registrationEpoch,
            resourceFamily,
            schemaVersion: BATCH_SCHEMA_VERSION,
            sourceInstanceId
        });

    return `sha256:${crypto.createHash('sha256').update(`${payload}|[${orderedObservations.join(',')}]`).digest('hex')}`
}

/**
 * @summary Validates a batch against the v1 contract. Pure — no I/O, no tenant resolution.
 *
 * Structural + type validity of the complete v1 shape: authority checks (registration epoch currency,
 * tenant scoping, base checkpoint/inventory verification) belong to the admission service, which owns
 * the server-side state those decisions require. A reduced shape must NOT validate — minting a
 * versioned contract means the whole contract, or a loud refusal.
 * @param {Object} batch
 * @returns {{valid: Boolean, errors: String[]}}
 */
export function validateBatch(batch) {
    const errors = [];

    if (!batch || typeof batch !== 'object') {
        return {valid: false, errors: ['BATCH_NOT_AN_OBJECT']}
    }

    if (batch.schemaVersion !== BATCH_SCHEMA_VERSION) {
        errors.push('BATCH_SCHEMA_VERSION_UNSUPPORTED')
    }

    REQUIRED_BATCH_KEYS.forEach(key => {
        const present  = Object.prototype.hasOwnProperty.call(batch, key),
              nullable = NULLABLE_BATCH_KEYS.has(key);

        if (!present || (batch[key] === undefined) || (batch[key] === null && !nullable)) {
            errors.push(`BATCH_MISSING_${key.toUpperCase()}`)
        }
    });

    if (!Number.isInteger(batch.registrationEpoch) || batch.registrationEpoch < 1) {
        errors.push('BATCH_REGISTRATION_EPOCH_INVALID')
    }

    if (!Number.isInteger(batch.baseCheckpointVersion) || batch.baseCheckpointVersion < 0) {
        errors.push('BATCH_BASE_CHECKPOINT_VERSION_INVALID')
    }

    // nextProviderState is opaque but bounded, schema-versioned, and prose/secret-free.
    if (batch.nextProviderState !== undefined && batch.nextProviderState !== null) {
        let bytes = 0;
        try {
            bytes = Buffer.byteLength(JSON.stringify(batch.nextProviderState), 'utf8')
        } catch {
            errors.push('BATCH_NEXT_PROVIDER_STATE_NOT_SERIALIZABLE')
        }

        if (bytes > MAX_PROVIDER_STATE_BYTES) errors.push('BATCH_NEXT_PROVIDER_STATE_TOO_LARGE');

        if (batch.nextProviderState && typeof batch.nextProviderState === 'object') {
            Object.keys(batch.nextProviderState).forEach(key => {
                if (PROSE_KEYS.has(key)) errors.push(`BATCH_NEXT_PROVIDER_STATE_CARRIES_PROSE_${key.toUpperCase()}`)
            })
        }
    }

    const {coverage} = batch;

    if (coverage && typeof coverage === 'object') {
        REQUIRED_COVERAGE_KEYS.forEach(key => {
            if (coverage[key] === undefined || coverage[key] === null) errors.push(`COVERAGE_MISSING_${key.toUpperCase()}`)
        });

        if (typeof coverage.complete === 'boolean') {
            const gaps = coverage.gaps || [];

            if (!Array.isArray(gaps)) {
                errors.push('COVERAGE_GAPS_NOT_AN_ARRAY')
            } else if (coverage.complete && gaps.length) {
                // A window cannot be simultaneously complete and gapped — that is a dishonest
                // coverage claim, and honest gaps are the whole point of carrying them.
                errors.push('COVERAGE_COMPLETE_CONTRADICTS_GAPS')
            } else if (!coverage.complete && !gaps.length) {
                errors.push('COVERAGE_INCOMPLETE_WITHOUT_GAPS')
            }
        }
    }

    if (!Array.isArray(batch.observations)) {
        errors.push('BATCH_OBSERVATIONS_NOT_AN_ARRAY')
    } else {
        batch.observations.forEach((observation, index) => {
            if (!observation || typeof observation !== 'object') {
                errors.push(`OBSERVATION_${index}_NOT_AN_OBJECT`);
                return
            }

            REQUIRED_OBSERVATION_KEYS.forEach(key => {
                if (observation[key] === undefined || observation[key] === null) errors.push(`OBSERVATION_${index}_MISSING_${key.toUpperCase()}`)
            });

            Object.keys(observation).forEach(key => {
                if (PROSE_KEYS.has(key))         errors.push(`OBSERVATION_${index}_CARRIES_PROSE_${key.toUpperCase()}`);
                if (SERVER_POLICY_KEYS.has(key)) errors.push(`OBSERVATION_${index}_ASSERTS_SERVER_POLICY_${key.toUpperCase()}`)
            });

            if (observation.actorKind !== undefined && !ACTOR_KINDS.has(observation.actorKind)) {
                errors.push(`OBSERVATION_${index}_ACTOR_KIND_INVALID`)
            }

            OPTIONAL_OBSERVATION_STRING_KEYS.forEach(key => {
                const value = observation[key];

                if (value !== undefined && value !== null && (typeof value !== 'string' || !value.trim())) {
                    errors.push(`OBSERVATION_${index}_${key.toUpperCase()}_INVALID`)
                }
            });

            if (observation.absence !== undefined && !ABSENCE_DISPOSITIONS.has(observation.absence)) {
                errors.push(`OBSERVATION_${index}_ABSENCE_DISPOSITION_INVALID`)
            }

            // `deleted` is the one absence disposition that asserts a fact about provider state, so it
            // requires explicit provider evidence (a tombstone id / deletion timestamp+actor) — an
            // enum value alone can be a permission loss masquerading as a deletion.
            if (observation.absence === 'deleted' && (observation.deletionEvidence === undefined || observation.deletionEvidence === null)) {
                errors.push(`OBSERVATION_${index}_DELETED_WITHOUT_EVIDENCE`)
            }

            if (POPULARITY_KINDS.has(observation.occurrenceKind)) {
                errors.push(`OBSERVATION_${index}_POPULARITY_TELEMETRY_OUT_OF_SCOPE`)
            }
        })
    }

    return {valid: errors.length === 0, errors}
}
