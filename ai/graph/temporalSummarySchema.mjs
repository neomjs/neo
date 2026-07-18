import {slugifyIdPart} from './businessSchema.mjs';

/**
 * @summary Central schema definition for the temporal-pyramid summarization substrate
 * (ADR 0028 — ticket-ref-ok: the Accepted decision record is this module's source of authority;
 * the pointer is load-bearing, not archaeology — referred to below as "the pyramid contract").
 *
 * This module is the authoritative registry for the `temporal-summary` collection's metadata
 * contract and the `SUMMARY_*` node-label family — the storage vocabulary the durable aggregation
 * lane writes into and the dynamic synthesis path reads from. It carries schema only: no
 * aggregation logic, no collection handles, no clock.
 *
 * The load-bearing disciplines, all from the pyramid contract:
 *
 * - **Durable/dynamic tier split (§2.1/§2.2):** L1 (session) and L2 (daily) are precomputed,
 *   append-only durable facts; L3–L5 (weekly/monthly/quarterly) are synthesized on demand and
 *   NEVER durably written — no LLM-compression cascade above the daily tier can exist, so the
 *   photocopy-of-a-photocopy degradation is impossible by construction. The boundary is expressed
 *   as data here (`durable` flags) so consumers enforce it by lookup, never by re-derivation.
 * - **One collection, five-field metadata (§2.3):** a single `temporal-summary` collection inside
 *   the `unified` store carries `{level, partition, windowStart, windowEnd, version}` — never
 *   collection-per-level. The collection NAME is an `AiConfig.collections` leaf (the config
 *   provider is the SSOT for names); this module deliberately does not duplicate it.
 * - **Deterministic writes only (§2.3 anti-anchor):** `SUMMARY_*` labels are written exclusively
 *   by the deterministic aggregation lane. They are NOT part of `SemanticGraphExtractor.VALID_TYPES`
 *   and widening that prompt with summary labels is forbidden — summaries are aggregation output,
 *   not LLM extraction.
 * - **Per-agent + unified partitioning (§2.6):** every record names its track — one agent identity
 *   or the single unified track with attribution. Partition is identity, not annotation: a
 *   malformed partition fragments every downstream window query silently, so the validator
 *   fail-closes on anything outside the two sanctioned forms.
 * - **Material-contract versioning (§2.4 / OQ8):** document ids embed the `version` field. A
 *   same-window + same-track + same-version re-fold deterministically overwrites one id; only a
 *   material contract-version bump mints a new append-only id. Retention across versions is Leaf
 *   B's contract, not schema's.
 */

/**
 * @summary The temporal-pyramid levels (the pyramid contract §2.1/§2.2), keyed by their semantic level name.
 *
 * `durable: true` levels (L1/L2) are precomputed facts the deterministic aggregation lane persists;
 * `durable: false` levels (L3–L5) are reserved vocabulary for the on-demand synthesis path — their
 * labels exist so nothing re-derives ad-hoc names, but no write path may persist them.
 * @type {ReadonlyArray<Object>}
 */
export const TEMPORAL_SUMMARY_LEVELS = Object.freeze([
    Object.freeze({key: 'session',   tier: 'L1', label: 'SUMMARY_SESSION',   durable: true}),
    Object.freeze({key: 'daily',     tier: 'L2', label: 'SUMMARY_DAILY',     durable: true}),
    Object.freeze({key: 'weekly',    tier: 'L3', label: 'SUMMARY_WEEKLY',    durable: false}),
    Object.freeze({key: 'monthly',   tier: 'L4', label: 'SUMMARY_MONTHLY',   durable: false}),
    Object.freeze({key: 'quarterly', tier: 'L5', label: 'SUMMARY_QUARTERLY', durable: false})
]);

/**
 * @summary The level keys accepted in the `level` metadata field.
 * @type {ReadonlyArray<String>}
 */
export const TEMPORAL_SUMMARY_LEVEL_KEYS = Object.freeze(TEMPORAL_SUMMARY_LEVELS.map(level => level.key));

/**
 * @summary Node labels the durable aggregation lane may write — the temporal family's rows in
 * the Native Edge Graph node-type registry. ONLY the durable tiers appear here: a `SUMMARY_WEEKLY`
 * graph node existing at all would mean the durable/dynamic boundary was breached.
 * @type {ReadonlyArray<String>}
 */
export const DURABLE_SUMMARY_NODE_TYPES = Object.freeze(
    TEMPORAL_SUMMARY_LEVELS.filter(level => level.durable).map(level => level.label)
);

/**
 * @summary The five-field metadata contract every `temporal-summary` collection document carries
 * (the pyramid contract §2.3). Exactly these fields — a document that cannot name its window,
 * track, and version is invalid by construction.
 * @type {ReadonlyArray<String>}
 */
export const TEMPORAL_SUMMARY_METADATA_FIELDS = Object.freeze([
    'level', 'partition', 'windowStart', 'windowEnd', 'version'
]);

/**
 * @summary The single unified partition track (the pyramid contract §2.6). Per-agent tracks use
 * the agent's canonical `@<identity>` form.
 * @type {String}
 */
export const UNIFIED_PARTITION = 'unified';

/**
 * @summary Resolves a level key to its level record, or null for unknown keys.
 * @param {String} levelKey One of {@link TEMPORAL_SUMMARY_LEVEL_KEYS}
 * @returns {Object|null}
 */
export function getTemporalSummaryLevel(levelKey) {
    return TEMPORAL_SUMMARY_LEVELS.find(level => level.key === levelKey) ?? null
}

/**
 * @summary Validates one partition value against the §2.6 sanctioned forms: the unified track or
 * a per-agent `@<identity>` track.
 * @param {String} partition
 * @returns {Boolean}
 */
export function isValidPartition(partition) {
    if (typeof partition !== 'string' || partition.trim() === '') {
        return false
    }

    return partition === UNIFIED_PARTITION || (partition.startsWith('@') && partition.length > 1)
}

/**
 * @summary Validates the five-field metadata contract for one `temporal-summary` document
 * (the pyramid contract §2.3), fail-closed with every violation named.
 *
 * Window bounds are ISO 8601 UTC strings with `windowStart` strictly before `windowEnd`;
 * `version` is a positive integer (the material aggregation-contract version — a same-`version` re-fold
 * overwrites in place, a contract bump mints a new append-only version; retention within it is
 * Leaf B's contract). Unknown extra fields are rejected: the contract is exactly five fields, and
 * silently-carried extras become undocumented query surface.
 * @param {Object} metadata The candidate metadata object
 * @returns {{valid: Boolean, errors: String[]}}
 */
export function validateTemporalSummaryMetadata(metadata) {
    const errors = [];

    if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return {valid: false, errors: ['metadata must be a plain object carrying the five-field contract']}
    }

    for (const field of TEMPORAL_SUMMARY_METADATA_FIELDS) {
        if (!(field in metadata)) {
            errors.push(`missing required metadata field: ${field}`)
        }
    }

    for (const field of Object.keys(metadata)) {
        if (!TEMPORAL_SUMMARY_METADATA_FIELDS.includes(field)) {
            errors.push(`unknown metadata field: ${field} — the contract is exactly {${TEMPORAL_SUMMARY_METADATA_FIELDS.join(', ')}}`)
        }
    }

    if ('level' in metadata && !TEMPORAL_SUMMARY_LEVEL_KEYS.includes(metadata.level)) {
        errors.push(`unknown level: ${metadata.level} — expected one of {${TEMPORAL_SUMMARY_LEVEL_KEYS.join(', ')}}`)
    }

    if ('partition' in metadata && !isValidPartition(metadata.partition)) {
        errors.push(`invalid partition: ${JSON.stringify(metadata.partition)} — expected '${UNIFIED_PARTITION}' or a per-agent '@<identity>' track`)
    }

    for (const bound of ['windowStart', 'windowEnd']) {
        if (bound in metadata) {
            const value = metadata[bound];

            if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
                errors.push(`${bound} must be an ISO 8601 timestamp string, got: ${JSON.stringify(value)}`)
            }
        }
    }

    if (
        typeof metadata.windowStart === 'string' && typeof metadata.windowEnd === 'string' &&
        !Number.isNaN(Date.parse(metadata.windowStart)) && !Number.isNaN(Date.parse(metadata.windowEnd)) &&
        Date.parse(metadata.windowStart) >= Date.parse(metadata.windowEnd)
    ) {
        errors.push('windowStart must be strictly before windowEnd — empty or inverted windows are invalid')
    }

    if ('version' in metadata && (!Number.isInteger(metadata.version) || metadata.version < 1)) {
        errors.push(`version must be a positive integer, got: ${JSON.stringify(metadata.version)}`)
    }

    return {valid: errors.length === 0, errors}
}

/**
 * @summary Mints the deterministic `temporal-summary` document id for one validated metadata
 * record: same window + track + version → same id (idempotent re-runs), next version → a NEW id
 * (append-only history per the pyramid contract §2.4 — re-aggregation never rewrites prior documents).
 *
 * The partition is slug-normalized through the shared id vocabulary (`businessSchema.mjs` — one
 * slug convention across graph families, never a re-derived copy); the `@` identity marker is
 * dropped in the id, the metadata keeps the canonical form.
 * @param {Object} metadata A metadata object that passed {@link validateTemporalSummaryMetadata}
 * @returns {String}
 */
export function createTemporalSummaryDocId(metadata) {
    const {valid, errors} = validateTemporalSummaryMetadata(metadata);

    if (!valid) {
        throw new Error(`createTemporalSummaryDocId: invalid metadata — ${errors.join('; ')}`)
    }

    const partitionSlug = slugifyIdPart(metadata.partition.replace(/^@/, ''));
    const windowSlug    = metadata.windowStart.replace(/[:.]/g, '-');

    return `temporal-summary-${metadata.level}-${partitionSlug}-${windowSlug}-v${metadata.version}`
}
