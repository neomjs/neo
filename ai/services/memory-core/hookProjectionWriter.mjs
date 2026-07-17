/**
 * @module ai/services/memory-core/hookProjectionWriter
 * @summary The production owner: the one place the projection primitives are bound to real edges.
 *
 * The lease, the submission gate and the transport are each hermetic and each testable alone — which is
 * exactly why nothing published. A pile of correct primitives with no owner is not a feature; it is
 * substrate that decays while looking finished. This module is the owner, and it exists so that
 * "publish a projection" is one call with no assembly required at the call site.
 *
 * It binds, in one place:
 *
 * - **the schema**, created once against the shared store, so `publish` never reads a table its own
 *   deployment never made;
 * - **target derivation**, server-side from the attested tuple, so a producer names a target it is
 *   entitled to rather than a path it chose;
 * - **the token source**, real randomness with a real digest, because the lease's whole safety argument
 *   assumes an unguessable token whose hash is what gets stored;
 * - **the broker clock**, read live at the mutation boundary, because a bounded lease that cannot
 *   observe time passing is not bounded;
 * - **the filesystem**, rooted at the Memory-Core-owned projection root from config.
 *
 * Every one of those is injected rather than imported. The owner is where policy meets the world, and a
 * seam that cannot be substituted cannot be tested against the failures that matter.
 */

import {createHash, randomBytes}                                               from 'crypto';
import {createHookProjectionTables, acquireProjectionLease, publishProjection} from './hookProjectionLease.mjs';
import {addProjectionConflictColumn, submitProjectionChannel}                  from './hookProjectionSubmission.mjs';
import {makeAtomicProjectionTransport}                                         from './hookProjectionTransport.mjs';

/**
 * @summary The attested tuple a target id is derived from, in a fixed order.
 *
 * Session id and raw paths are deliberately absent. A session is not an identity — the same agent across
 * two sessions must reach the same target, or every restart would orphan its own projection — and a raw
 * path would let a caller choose where its output lands.
 * @type {String[]}
 */
export const TARGET_TUPLE_FIELDS = Object.freeze([
    'schemaVersion',
    'capability',
    'agentId',
    'harnessType',
    'instanceKeyDigest',
    'workspaceKeyDigest',
    'projectionKind'
]);

/**
 * @summary Derives the server-side target id from an attested tuple.
 *
 * Every field is required: a tuple with a hole would collapse two distinct targets onto one id, and two
 * agents sharing a projection is the failure the whole never-foreign contract exists to prevent. The
 * digest is opaque and filesystem-safe by construction, so the transport's path check can stay a simple
 * token rule rather than a sanitizer.
 *
 * @param {Object} tuple The attested categorical tuple.
 * @returns {String} Hex target id.
 * @throws {TypeError} When any field is missing — a hole is not a target.
 */
export function deriveTargetId(tuple) {
    const missing = TARGET_TUPLE_FIELDS.filter(field => typeof tuple?.[field] !== 'string' || tuple[field].length === 0);

    if (missing.length > 0) {
        throw new TypeError(`[hookProjectionWriter] the attested target tuple is missing: ${missing.join(', ')}`)
    }

    // Field-separated so ('a','bc') and ('ab','c') cannot collide into one target.
    const canonical = TARGET_TUPLE_FIELDS.map(field => `${field}=${tuple[field]}`).join('\0');

    return createHash('sha256').update(canonical).digest('hex').slice(0, 32)
}

/**
 * @summary Binds the projection primitives to their real edges and returns the production surface.
 *
 * @param {Object}   params
 * @param {Function} params.getDb `() => sqliteDb` — resolved at call time, so a re-opened store is never
 *   written through a stale handle.
 * @param {Object}   params.config `{hookProjectionRoot, hookProjectionLeaseTtlMs}` from the Memory-Core
 *   boundary. Read here, at the edge, rather than threaded through the primitives.
 * @param {Object}   params.fs Node fs.
 * @param {Function} [params.clock] `() => epochMs` — the broker clock. Injected so a test can advance it.
 * @returns {{deriveTargetId: Function, submitChannel: Function, publish: Function, ensureSchema: Function}}
 * @throws {TypeError} When an injection or a config leaf is missing — a wiring bug must not degrade to a
 *   guessed root or an unbounded lease.
 */
export function makeHookProjectionWriter({getDb, config, fs, clock = () => Date.now()} = {}) {
    if (typeof getDb !== 'function') {
        throw new TypeError('[hookProjectionWriter] an injected getDb resolver is required')
    }
    if (typeof config?.hookProjectionRoot !== 'string' || config.hookProjectionRoot.length === 0) {
        throw new TypeError('[hookProjectionWriter] hookProjectionRoot is required from config — no local default')
    }
    if (!Number.isFinite(config?.hookProjectionLeaseTtlMs) || config.hookProjectionLeaseTtlMs <= 0) {
        throw new TypeError('[hookProjectionWriter] hookProjectionLeaseTtlMs is required from config — no local default')
    }

    const transport = makeAtomicProjectionTransport({
        fs,
        runtimeRoot : config.hookProjectionRoot,
        // Unique per attempt: a retry must never collide with an in-flight temp sibling.
        uniqueSuffix: () => randomBytes(8).toString('hex')
    });

    // The raw token is returned to the caller once and never persisted; only this digest is stored, so
    // reading the lease row can never let anyone impersonate its holder.
    const hashToken = raw => createHash('sha256').update(String(raw)).digest('hex'),
          mintToken = () => randomBytes(32).toString('hex');

    const requireDb = () => {
        const db = getDb();

        if (!db) {
            // Fail-closed: no store, no publication. A missing store is not an empty projection.
            throw new Error('[hookProjectionWriter] the Memory Core SQLite store is unavailable')
        }

        return db
    };

    /**
     * @summary Creates the projection tables on the shared store. Idempotent; safe to call at boot.
     * @returns {void}
     */
    const ensureSchema = () => {
        const db = requireDb();

        createHookProjectionTables(db);
        // Brings a store created before the conflict column up to the current shape.
        addProjectionConflictColumn(db)
    };

    /**
     * @summary Submits one producer's channel for an attested target.
     * @param {Object} params
     * @param {Object} params.tuple The attested target tuple.
     * @param {String} params.channel The producer's own channel.
     * @param {Object} params.envelope The typed producer envelope.
     * @param {String} params.sourceWatermark Monotonic watermark.
     * @param {String} params.capturedAt ISO capture stamp.
     * @param {String} params.expiresAt ISO expiry stamp.
     * @param {Function} params.isTargetAdmitted Admission gate — decided by the caller that owns it.
     * @param {Function} params.mayProduceChannel Producer-identity gate.
     * @returns {Object} The submission result.
     */
    const submitChannel = ({tuple, channel, envelope, sourceWatermark, capturedAt, expiresAt, isTargetAdmitted, mayProduceChannel}) =>
        submitProjectionChannel({
            db      : requireDb(),
            targetId: deriveTargetId(tuple),
            channel,
            envelope,
            sourceWatermark,
            capturedAt,
            expiresAt,
            now     : new Date(clock()).toISOString(),
            isTargetAdmitted,
            mayProduceChannel
        });

    /**
     * @summary Acquires, publishes, and reports — the whole bounded single publication.
     *
     * Contention is a NORMAL outcome, not an error: another holder is publishing the same target, and
     * the answer is to try later rather than to fail loudly. The lease releases itself on both paths
     * inside `publishProjection`, so there is no cleanup for a caller to forget.
     *
     * @param {Object} params
     * @param {Object} params.tuple The attested target tuple.
     * @param {Object} params.consumerBinding What a reader validates itself against.
     * @returns {Object} `{published, reason?, targetId, epoch?}`.
     */
    const publish = ({tuple, consumerBinding}) => {
        const db       = requireDb(),
              targetId = deriveTargetId(tuple);

        const lease = acquireProjectionLease({
            db,
            targetId,
            instanceDigest: tuple.instanceKeyDigest,
            now           : clock(),
            leaseTtlMs    : config.hookProjectionLeaseTtlMs,
            mintToken,
            hashToken
        });

        if (!lease.acquired) {
            return {published: false, reason: lease.state, retryAfterMs: lease.retryAfterMs, targetId}
        }

        // Sweeping is INJECTED, not performed here. Doing it at this call site gated it on
        // `lease.acquired` — a past-tense fact. A holder that acquired at epoch 1 and then stalled past
        // its TTL still passes this line, so it would sweep away epoch 2's live temp sibling and only
        // afterwards be told it was superseded, while epoch 2's rename failed ENOENT. The loser cannot
        // be allowed to damage the winner on its way out, so the sweep now runs inside
        // publishProjection's serialized transaction, past token+epoch+expiry revalidation.
        const result = publishProjection({
            db,
            targetId,
            token       : lease.token,
            epoch       : lease.epoch,
            clock,
            consumerBinding,
            hashToken,
            writeAtomic : transport.writeAtomic,
            sweepOrphans: transport.sweepOrphans
        });

        return {...result, targetId, epoch: lease.epoch}
    };

    return {deriveTargetId, ensureSchema, submitChannel, publish}
}
