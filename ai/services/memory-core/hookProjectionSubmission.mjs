/**
 * @module ai/services/memory-core/hookProjectionSubmission
 * @summary The producer side of hook projections: a source submits its OWN typed channel, and the
 * store decides whether that submission may advance the channel.
 *
 * The asymmetry is the point. A producer knows one truth — its own envelope, watermark, and expiry —
 * and knows nothing about the other channels or the published resource. So a producer may never read or
 * write `current.json`, and never merges another producer's channel; it hands over one row and the
 * writer composes. Anything else lets a producer publish a picture it cannot see.
 *
 * Watermark discipline decides admission, and the three cases are genuinely different facts:
 *
 * - **A regressed watermark is rejected.** Sources retry and race; without monotonicity an in-flight
 *   older read could overwrite a newer one and silently move the projection backwards in time.
 * - **An equal watermark with an identical payload is idempotent.** Replay is normal — a retry after a
 *   timeout must not be an error, or every transient failure becomes a false conflict.
 * - **An equal watermark with a DIFFERENT payload is a source conflict.** Two payloads claiming the same
 *   point in time cannot both be true, and there is no basis for preferring either. Guessing would
 *   publish a coherent-looking lie, so the channel degrades and says why.
 *
 * That last case is why the channel carries a conflict reason: a degradation the reader cannot see is
 * not a degradation, it is a silent wrong answer.
 */

import {PROJECTION_CHANNEL_SCHEMAS} from './hookProjectionLease.mjs';

/**
 * @typedef {Object} SubmissionResult
 * @property {Boolean} accepted Whether the submission advanced the channel.
 * @property {String} outcome One of `advanced`, `replayed`, `regressed-watermark`, `source-conflict`,
 *   `target-not-admitted`, `foreign-producer`, `unknown-channel`, `schema-mismatch`.
 * @property {String} [reason] Human-readable detail when the submission did not advance.
 */

/**
 * @summary Brings an EXISTING store's channel table up to the current shape.
 *
 * `conflict_reason` is part of the table definition in {@link createHookProjectionTables}; this is the
 * idempotent migration for stores created before it existed. Keeping the column out of the DDL and
 * only in a migration was the original mistake: publish read a column its own schema did not define,
 * so the two halves disagreed about the table.
 *
 * A source conflict has to survive to the reader, and the channel row is the only thing the writer
 * reads at publish time — so a conflict that lived only in a return value would vanish the moment the
 * producer moved on, and the next publication would render the contested channel as though it were
 * clean.
 *
 * @param {Object} db An open better-sqlite3 handle.
 * @returns {void}
 */
export function addProjectionConflictColumn(db) {
    const columns = db.prepare(`PRAGMA table_info(HookProjectionChannels)`).all();

    if (!columns.some(column => column.name === 'conflict_reason')) {
        db.exec(`ALTER TABLE HookProjectionChannels ADD COLUMN conflict_reason TEXT`)
    }
}

/**
 * @summary Submits one producer's typed channel, enforcing target admission, producer identity, and
 * monotonic watermarks in a single serialized transaction.
 *
 * Serialized because the check and the write must not be separable: two producers retrying the same
 * channel could otherwise both read the same prior watermark and both believe they advanced it.
 *
 * @param {Object}   params
 * @param {Object}   params.db Open better-sqlite3 handle.
 * @param {String}   params.targetId Server-derived target id (never caller-supplied).
 * @param {String}   params.channel The producer's own channel name.
 * @param {Object}   params.envelope The typed, frozen producer envelope.
 * @param {String}   params.sourceWatermark Monotonic watermark for this channel.
 * @param {String}   params.capturedAt ISO stamp of the producer's read.
 * @param {String}   params.expiresAt ISO stamp after which this channel is stale.
 * @param {String}   params.now ISO stamp for the row's `updated_at` (injected — no hidden clock).
 * @param {Function} params.isTargetAdmitted `targetId => Boolean` — admission is the server's call.
 * @param {Function} params.mayProduceChannel `({targetId, channel}) => Boolean` — producer identity.
 * @returns {SubmissionResult}
 * @throws {TypeError} On a missing injection — a wiring bug is not a rejected submission.
 */
export function submitProjectionChannel({
    db,
    targetId,
    channel,
    envelope,
    sourceWatermark,
    capturedAt,
    expiresAt,
    now,
    isTargetAdmitted,
    mayProduceChannel
} = {}) {
    if (!db) {
        throw new TypeError('[hookProjectionSubmission] an open db handle is required')
    }
    if (typeof targetId !== 'string' || !targetId.length || typeof channel !== 'string' || !channel.length) {
        throw new TypeError('[hookProjectionSubmission] a server-derived targetId and a channel are required')
    }
    if (typeof sourceWatermark !== 'string' || !sourceWatermark.length) {
        throw new TypeError('[hookProjectionSubmission] a sourceWatermark is required — an unwatermarked channel cannot be ordered')
    }
    if (typeof isTargetAdmitted !== 'function' || typeof mayProduceChannel !== 'function') {
        throw new TypeError('[hookProjectionSubmission] isTargetAdmitted and mayProduceChannel must be injected')
    }
    // `typeof envelope === 'object'` alone admitted an array and any exotic object. A channel envelope
    // is a typed record with a schemaVersion; accepting anything object-shaped meant the store held
    // payloads no reader could bind to, discovered only at render time by the party least able to fix it.
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
        throw new TypeError('[hookProjectionSubmission] an envelope must be a plain object')
    }

    if (typeof envelope.schemaVersion !== 'string' || envelope.schemaVersion.length === 0) {
        throw new TypeError('[hookProjectionSubmission] an envelope must carry a schemaVersion — a reader binds to it')
    }

    // Capture/expiry were stored as opaque strings and never parsed, so an unparseable or inverted
    // window entered the store and only failed later, at a reader. A channel that expires before it was
    // captured was never valid for an instant.
    const captured = Date.parse(capturedAt),
          expires  = Date.parse(expiresAt);

    if (!Number.isFinite(captured)) {
        throw new TypeError(`[hookProjectionSubmission] capturedAt must be a parseable timestamp; got ${JSON.stringify(capturedAt)}`)
    }

    if (!Number.isFinite(expires)) {
        throw new TypeError(`[hookProjectionSubmission] expiresAt must be a parseable timestamp; got ${JSON.stringify(expiresAt)}`)
    }

    if (expires <= captured) {
        throw new TypeError(`[hookProjectionSubmission] expiresAt ${expiresAt} is not after capturedAt ${capturedAt}`)
    }

    // Admission and identity are decided OUTSIDE this primitive and enforced here: the store never
    // infers who a producer is from what it submitted.
    if (!isTargetAdmitted(targetId)) {
        return {accepted: false, outcome: 'target-not-admitted', reason: `target ${targetId} is not admitted`}
    }

    if (!mayProduceChannel({targetId, channel})) {
        return {accepted: false, outcome: 'foreign-producer', reason: `this producer may not write channel ${channel}`}
    }

    // Identity says a producer may write this channel; it says nothing about what it wrote. The schema
    // binding is checked after identity so an unauthorized producer is still reported as foreign rather
    // than as a schema problem — the coarser violation is the true one.
    if (!Object.hasOwn(PROJECTION_CHANNEL_SCHEMAS, channel)) {
        return {
            accepted: false,
            outcome : 'unknown-channel',
            reason  : `channel ${channel} has no pinned schema contract`
        }
    }

    const expectedSchema = PROJECTION_CHANNEL_SCHEMAS[channel];

    if (envelope.schemaVersion !== expectedSchema) {
        return {
            accepted: false,
            outcome : 'schema-mismatch',
            reason  : `channel ${channel} requires ${expectedSchema}; envelope carries ${envelope.schemaVersion}`
        }
    }

    const payload = JSON.stringify(envelope);

    const submit = db.transaction(() => {
        const row = db.prepare(`
            SELECT source_watermark, envelope_json FROM HookProjectionChannels
            WHERE target_id = ? AND channel = ?
        `).get(targetId, channel);

        if (row) {
            const previous = String(row.source_watermark);

            if (sourceWatermark < previous) {
                return {
                    accepted: false,
                    outcome : 'regressed-watermark',
                    reason  : `watermark ${sourceWatermark} is older than the stored ${previous}`
                }
            }

            if (sourceWatermark === previous) {
                // Replay is normal; a conflict is not. Only the payload distinguishes them.
                if (row.envelope_json === payload) {
                    return {accepted: true, outcome: 'replayed'}
                }

                const reason = `two payloads claim watermark ${sourceWatermark}`;

                // The prior payload is kept rather than overwritten — with no basis to prefer either,
                // replacing it would be an arbitrary choice dressed as an update. The conflict is
                // recorded so the publication renders this channel as contested.
                db.prepare(`
                    UPDATE HookProjectionChannels SET conflict_reason = ?, updated_at = ?
                    WHERE target_id = ? AND channel = ?
                `).run(reason, now, targetId, channel);

                return {accepted: false, outcome: 'source-conflict', reason}
            }
        }

        // A strictly newer watermark supersedes any earlier conflict: the source has moved on, and the
        // contested point in time is no longer what this channel describes.
        db.prepare(`
            INSERT INTO HookProjectionChannels
                (target_id, channel, source_watermark, envelope_json, captured_at, expires_at, updated_at, conflict_reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
            ON CONFLICT(target_id, channel) DO UPDATE SET
                source_watermark = excluded.source_watermark,
                envelope_json    = excluded.envelope_json,
                captured_at      = excluded.captured_at,
                expires_at       = excluded.expires_at,
                updated_at       = excluded.updated_at,
                conflict_reason  = NULL
        `).run(targetId, channel, sourceWatermark, payload, capturedAt, expiresAt, now);

        return {accepted: true, outcome: 'advanced'}
    });

    return submit.immediate()
}
