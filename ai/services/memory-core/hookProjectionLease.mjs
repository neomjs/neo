/**
 * @module ai/services/memory-core/hookProjectionLease
 * @summary The fenced single-writer lease behind hook projections: acquisition, resource-side
 * revalidation, and token+epoch-checked release.
 *
 * Several MCP and service processes can race one projection target. An atomic rename alone does not
 * make that safe — it prevents a torn read, but not a lost update, because two writers can both
 * complete a rename and the later one silently wins with older content. So the guarded resource is not
 * the file: it is the **serialized SQLite write transaction** that revalidates the holder's token and
 * epoch and then performs the rename without releasing. Nothing can commit a takeover in between.
 *
 * The consequences are worth stating plainly, because each one looks like an over-restriction until it
 * is the thing that saves a peer's next action:
 *
 * - **A fencing epoch carried in the payload is diagnostic, never a guard.** A reader can see it; it
 *   cannot stop a stale holder from mutating the resource. Only the transaction can.
 * - **Only the token HASH is stored.** A raw token in the table would let anyone who can read the
 *   lease row impersonate its holder — the row is the thing a competing writer reads.
 * - **Release is conditional on token AND epoch.** A stale holder that wakes after takeover must not be
 *   able to release, or overwrite, its successor.
 * - **The lease is bounded single-publication with no renewal.** A render that cannot finish inside its
 *   window aborts loudly rather than quietly holding a target. Adding renewal is an ADR revalidation,
 *   not an implementation convenience.
 *
 * Every failure here is fail-closed: a missing store, a busy timeout, or an unreadable schema yields no
 * projection update. A stale projection is recoverable; a wrong one is acted upon.
 */

/**
 * @summary Lease states carried in the table.
 * @type {Object}
 */
export const LEASE_STATES = Object.freeze({
    held    : 'held',
    released: 'released'
});

/**
 * @summary The published projection's contract version — what a reader binds to.
 * @type {String}
 */
export const PROJECTION_SCHEMA_VERSION = 'live-lane-awareness-projection.v1';

/**
 * @typedef {Object} LeaseAcquisition
 * @property {Boolean} acquired Whether this caller now holds the target.
 * @property {String} [token] The raw holder token — returned once, never persisted.
 * @property {Number} [epoch] The monotonic fencing epoch handed out on success.
 * @property {Number} [expiresAt] Epoch ms after which the lease is takeover-eligible.
 * @property {String} [state] The current state when acquisition was declined.
 * @property {Number} [retryAfterMs] How long until the held target frees itself.
 */

/**
 * @typedef {Object} PublishResult
 * @property {Boolean} published Whether the resource was mutated.
 * @property {String} [reason] Why publication was refused, when it was.
 * @property {Number} [channels] How many channel rows the payload carried.
 */

/**
 * @typedef {Object} ReleaseResult
 * @property {Boolean} released Whether this caller's lease was cleared.
 * @property {String} [reason] Why release was refused, when it was.
 */

/**
 * @summary Creates the two operational projection tables.
 *
 * These are operational rows in the shared store, deliberately NOT Native Edge Graph nodes: a
 * projection is transport state with an expiry, not knowledge, and giving it an ontology would invite
 * readers to treat a stale render as a fact about the organism.
 *
 * @param {Object} db An open better-sqlite3 handle.
 * @returns {void}
 */
export function createHookProjectionTables(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS HookProjectionChannels (
            target_id TEXT NOT NULL,
            channel TEXT NOT NULL,
            source_watermark TEXT NOT NULL,
            envelope_json TEXT NOT NULL,
            captured_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            conflict_reason TEXT,
            PRIMARY KEY (target_id, channel)
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS HookProjectionLeases (
            target_id TEXT PRIMARY KEY,
            fencing_epoch INTEGER NOT NULL,
            holder_token_hash TEXT,
            holder_instance_digest TEXT,
            acquired_at INTEGER,
            expires_at INTEGER,
            state TEXT NOT NULL CHECK(state IN ('held', 'released'))
        );
    `)
}

/**
 * @summary Acquires the target's lease, or reports the contention without writing.
 *
 * Runs as one serialized (IMMEDIATE) transaction: a deferred transaction upgrades to a write lock only
 * on first write, which is exactly the window in which two acquirers could both read "unheld" and both
 * believe they won. The epoch increments monotonically on every successful acquisition, so a takeover
 * is always distinguishable from the holder it displaced — including across a crash, where the previous
 * holder never released.
 *
 * @param {Object}   params
 * @param {Object}   params.db Open better-sqlite3 handle.
 * @param {String}   params.targetId Server-derived target id (never caller-supplied).
 * @param {String}   params.instanceDigest Attested holder instance digest.
 * @param {Number}   params.now Epoch ms (injected — no hidden clock).
 * @param {Number}   params.leaseTtlMs Required from the Memory-Core config boundary; no local default.
 * @param {Function} params.mintToken `() => rawToken` — the injected secret source.
 * @param {Function} params.hashToken `rawToken => hash` — only the hash is persisted.
 * @returns {LeaseAcquisition}
 * @throws {TypeError} On a missing injection — a wiring bug is not contention.
 */
export function acquireProjectionLease({db, targetId, instanceDigest, now, leaseTtlMs, mintToken, hashToken} = {}) {
    if (!db)                                    throw new TypeError('[hookProjectionLease] an open db handle is required');
    if (typeof targetId !== 'string' || !targetId.length) throw new TypeError('[hookProjectionLease] a server-derived targetId is required');
    if (!Number.isFinite(now))                  throw new TypeError('[hookProjectionLease] now (epoch ms) must be injected');
    if (!Number.isFinite(leaseTtlMs) || leaseTtlMs <= 0) {
        throw new TypeError('[hookProjectionLease] leaseTtlMs is required from config — this primitive has no default')
    }
    if (typeof mintToken !== 'function' || typeof hashToken !== 'function') {
        throw new TypeError('[hookProjectionLease] mintToken and hashToken must be injected')
    }

    const acquire = db.transaction(() => {
        const row = db.prepare('SELECT fencing_epoch, expires_at, state FROM HookProjectionLeases WHERE target_id = ?').get(targetId);

        // Expiry is what makes a crashed holder recoverable without an operator: it never released, so
        // only the clock can free the target.
        const held = row && row.state === LEASE_STATES.held && Number(row.expires_at) > now;

        if (held) {
            return {acquired: false, state: LEASE_STATES.held, retryAfterMs: Math.max(0, Number(row.expires_at) - now)}
        }

        const epoch     = (row ? Number(row.fencing_epoch) : 0) + 1,
              token     = mintToken(),
              expiresAt = now + leaseTtlMs;

        db.prepare(`
            INSERT INTO HookProjectionLeases
                (target_id, fencing_epoch, holder_token_hash, holder_instance_digest, acquired_at, expires_at, state)
            VALUES (?, ?, ?, ?, ?, ?, 'held')
            ON CONFLICT(target_id) DO UPDATE SET
                fencing_epoch          = excluded.fencing_epoch,
                holder_token_hash      = excluded.holder_token_hash,
                holder_instance_digest = excluded.holder_instance_digest,
                acquired_at            = excluded.acquired_at,
                expires_at             = excluded.expires_at,
                state                  = 'held'
        `).run(targetId, epoch, hashToken(token), instanceDigest ?? null, now, expiresAt);

        return {acquired: true, token, epoch, expiresAt}
    });

    return acquire.immediate()
}

/**
 * @summary Publishes the target's channels through the fencing gate.
 *
 * This is the load-bearing routine. Token+epoch revalidation, the channel read, and the resource
 * mutation all happen inside ONE serialized transaction, so a takeover cannot commit between the check
 * and the write. Revalidating first and renaming afterwards — the obvious shape — is precisely the bug:
 * it leaves a window in which a successor acquires the lease while the old holder is already past its
 * check and still about to write.
 *
 * The transport is injected and performed inside the transaction. It must be atomic from a reader's
 * point of view (unique temp sibling, flush, rename), so a concurrent reader sees old-complete or
 * new-complete and never a torn payload.
 *
 * @param {Object}   params
 * @param {Object}   params.db Open better-sqlite3 handle.
 * @param {String}   params.targetId Server-derived target id.
 * @param {String}   params.token The holder's raw token.
 * @param {Number}   params.epoch The epoch handed out at acquisition.
 * @param {Number}   params.now Epoch ms (injected).
 * @param {Function} params.hashToken `rawToken => hash`.
 * @param {Function} params.writeAtomic `({channels}) => void` — the atomic transport.
 * @returns {PublishResult}
 */
export function publishProjection({db, targetId, token, epoch, now, hashToken, writeAtomic} = {}) {
    if (!db) throw new TypeError('[hookProjectionLease] an open db handle is required');
    if (typeof writeAtomic !== 'function') throw new TypeError('[hookProjectionLease] writeAtomic must be injected');
    if (!Number.isFinite(now)) throw new TypeError('[hookProjectionLease] now (epoch ms) must be injected');

    const publish = db.transaction(() => {
        const row = db.prepare('SELECT fencing_epoch, holder_token_hash, expires_at, state FROM HookProjectionLeases WHERE target_id = ?').get(targetId);

        // Fail-closed, and each reason is distinct because they are distinct facts: a superseded holder
        // is a takeover, an expired one lost its window, a wrong token is not the holder at all.
        if (!row || row.state !== LEASE_STATES.held)   return {published: false, reason: 'not-held'};
        if (Number(row.fencing_epoch) !== Number(epoch)) return {published: false, reason: 'superseded-epoch'};
        if (row.holder_token_hash !== hashToken(token)) return {published: false, reason: 'foreign-token'};
        if (Number(row.expires_at) <= now)             return {published: false, reason: 'lease-expired'};

        const rows = db.prepare(`
            SELECT channel, source_watermark, envelope_json, captured_at, expires_at, conflict_reason
            FROM HookProjectionChannels WHERE target_id = ? ORDER BY channel
        `).all(targetId);

        // A contested channel must publish AS contested. The conflict is recorded on the row precisely
        // so it survives to the reader; reading the row and dropping the column would make the whole
        // conflict mechanism inert — the reader would see a clean channel over a disputed watermark.
        const channels = rows.map(row => ({
            channel        : row.channel,
            sourceWatermark: row.source_watermark,
            envelope       : JSON.parse(row.envelope_json),
            capturedAt     : row.captured_at,
            expiresAt      : row.expires_at,
            conflictReason : row.conflict_reason ?? null
        }));

        // Inside the transaction on purpose: the rename must not be reachable once a successor could
        // have committed. This is the fencing property — the epoch in the payload only describes it.
        //
        // `targetId` is passed because the transport derives the output path from it. Omitting it left
        // the two halves structurally unable to compose while both suites stayed green on their own
        // stubs.
        writeAtomic({
            targetId,
            publication: {
                schemaVersion   : PROJECTION_SCHEMA_VERSION,
                targetId,
                fencingEpoch    : Number(epoch),
                publishedAt     : now,
                sourceWatermarks: Object.fromEntries(channels.map(channel => [channel.channel, channel.sourceWatermark])),
                degradedChannels: channels.filter(channel => channel.conflictReason).map(channel => channel.channel),
                notAuthority    : true
            },
            channels
        });

        return {published: true, channels: channels.length}
    });

    return publish.immediate()
}

/**
 * @summary Releases the lease only for the current holder.
 *
 * Conditional on token AND epoch: a stale holder waking after a takeover must not release its
 * successor's lease. Both the success and failure paths of a publication route here, so an aborted
 * render frees the target rather than parking it until expiry.
 *
 * @param {Object}   params
 * @param {Object}   params.db Open better-sqlite3 handle.
 * @param {String}   params.targetId Server-derived target id.
 * @param {String}   params.token The holder's raw token.
 * @param {Number}   params.epoch The epoch handed out at acquisition.
 * @param {Function} params.hashToken `rawToken => hash`.
 * @returns {ReleaseResult}
 */
export function releaseProjectionLease({db, targetId, token, epoch, hashToken} = {}) {
    if (!db) throw new TypeError('[hookProjectionLease] an open db handle is required');

    const release = db.transaction(() => {
        const changes = db.prepare(`
            UPDATE HookProjectionLeases
            SET state = 'released', holder_token_hash = NULL, expires_at = 0
            WHERE target_id = ? AND fencing_epoch = ? AND holder_token_hash = ?
        `).run(targetId, epoch, hashToken(token)).changes;

        return changes > 0 ? {released: true} : {released: false, reason: 'not-current-holder'}
    });

    return release.immediate()
}
