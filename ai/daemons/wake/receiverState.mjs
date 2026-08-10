/**
 * @module ai/daemons/wake/receiverState
 * @summary Durable, graphless state for the signed host wake receiver.
 *
 * One file per stable event/source identity keeps acceptance atomic and retry-safe without
 * importing Memory Core, SQLite, or a second graph authority. `pending` is the only replayable
 * state. The receiver writes `dispatching` before invoking a non-idempotent local adapter; if the
 * process dies there, startup terminalizes the record as `unknown` rather than risking a second
 * GUI side effect. The mailbox remains the recovery authority for that ambiguity.
 */
import crypto from 'node:crypto';
import fs     from 'node:fs/promises';
import path   from 'node:path';

const RECORD_FILE_SUFFIX = '.json';
const REPLAYABLE_STATE   = 'pending';
const TERMINAL_STATES    = new Set(['delivered', 'skipped', 'failed', 'unknown']);

/**
 * @summary Builds a filesystem-safe stable key from the subscription plus canonical source ids.
 * @param {Object} options
 * @param {String} options.subscriptionId
 * @param {String} options.eventId
 * @param {String[]} [options.sourceEventIds=[]]
 * @returns {String}
 */
export function getWakeRecordKey({subscriptionId, eventId, sourceEventIds = []} = {}) {
    if (typeof subscriptionId !== 'string' || subscriptionId.length === 0) {
        throw new Error('getWakeRecordKey requires subscriptionId');
    }
    if (typeof eventId !== 'string' || eventId.length === 0) {
        throw new Error('getWakeRecordKey requires eventId');
    }

    const canonicalSources = sourceEventIds
        .filter(value => typeof value === 'string' && value.length > 0)
        .sort();
    const identity = canonicalSources.length > 0
        ? ['sources', subscriptionId, canonicalSources]
        : ['event', subscriptionId, eventId];

    return crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

/**
 * @summary Atomic 0600 JSON record store for receiver acceptance and dispatch transitions.
 */
export class WakeReceiverState {
    /**
     * @param {Object} options
     * @param {String} options.stateDir Absolute host-local state directory.
     */
    constructor({stateDir} = {}) {
        if (!path.isAbsolute(stateDir || '')) {
            throw new Error('WakeReceiverState requires an absolute stateDir');
        }

        this.stateDir  = stateDir;
        this.recordsDir = path.join(stateDir, 'records');
    }

    /**
     * @summary Creates and tightens the receiver state directories.
     * @returns {Promise<void>}
     */
    async init() {
        await fs.mkdir(this.recordsDir, {recursive: true, mode: 0o700});
        await fs.chmod(this.stateDir, 0o700);
        await fs.chmod(this.recordsDir, 0o700);
    }

    /**
     * @summary Durably accepts one signed event before the HTTP layer returns 2xx.
     *
     * A fully-synced temp file is atomically linked into the record namespace. `link()` never
     * overwrites an existing stable key, so concurrent webhook retries converge on one record.
     *
     * @param {Object} options
     * @param {String} options.subscriptionId
     * @param {String} options.eventId
     * @param {String[]} [options.sourceEventIds=[]]
     * @param {Object} options.envelope Parsed signed wake envelope.
     * @param {Object} options.route Graphless host route metadata (never the signing key).
     * @returns {Promise<Object>} Acceptance status (`accepted` or `duplicate`) plus the record.
     */
    async accept({subscriptionId, eventId, sourceEventIds = [], envelope, route} = {}) {
        const recordKey  = getWakeRecordKey({subscriptionId, eventId, sourceEventIds});
        const recordPath = this.getRecordPath(recordKey);
        const now        = new Date().toISOString();
        const record     = {
            recordKey,
            subscriptionId,
            eventId,
            sourceEventIds,
            state     : REPLAYABLE_STATE,
            acceptedAt: now,
            updatedAt : now,
            envelope,
            route
        };
        const tempPath = `${recordPath}.${process.pid}.${crypto.randomUUID()}.tmp`;

        await this._writeSynced(tempPath, record);

        try {
            await fs.link(tempPath, recordPath);
            await fs.chmod(recordPath, 0o600);
            await this._syncDirectory();
            return {status: 'accepted', record};
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
            return {status: 'duplicate', record: await this.read(recordKey)};
        } finally {
            await fs.unlink(tempPath).catch(() => {});
        }
    }

    /**
     * @summary Reads one record by stable key.
     * @param {String} recordKey
     * @returns {Promise<Object>}
     */
    async read(recordKey) {
        return JSON.parse(await fs.readFile(this.getRecordPath(recordKey), 'utf8'));
    }

    /**
     * @summary Lists records in acceptance order, optionally filtered by state.
     * @param {String|null} [state=null]
     * @returns {Promise<Object[]>}
     */
    async list(state = null) {
        const entries = await fs.readdir(this.recordsDir).catch(error => {
            if (error.code === 'ENOENT') return [];
            throw error;
        });
        const records = [];

        for (const entry of entries) {
            if (!entry.endsWith(RECORD_FILE_SUFFIX)) continue;

            try {
                const record = JSON.parse(await fs.readFile(path.join(this.recordsDir, entry), 'utf8'));
                if (state === null || record.state === state) records.push(record);
            } catch {
                // A malformed record is never guessed into a replayable state.
            }
        }

        return records.sort((left, right) => String(left.acceptedAt).localeCompare(String(right.acceptedAt)));
    }

    /**
     * @summary Atomically transitions a record when its current state matches the expected state.
     *
     * `dispatching → pending` is the context gate's deferral path: the gate runs after the
     * non-idempotency marker is taken, finds the target session over budget, and returns the record
     * to the only replayable state. A crash between defer and re-dispatch replays from `pending` —
     * never from `dispatching` — so the defer cannot duplicate a GUI side effect.
     *
     * @param {String} recordKey
     * @param {String} expectedState
     * @param {String} nextState
     * @param {Object} [details={}]
     * @returns {Promise<Object|null>} Updated record, or null when another actor already advanced it.
     */
    async transition(recordKey, expectedState, nextState, details = {}) {
        if (!['dispatching', REPLAYABLE_STATE].includes(nextState) && !TERMINAL_STATES.has(nextState)) {
            throw new Error(`Unsupported receiver state transition target '${nextState}'`);
        }

        const current = await this.read(recordKey);
        if (current.state !== expectedState) return null;

        const updated = {
            ...current,
            ...details,
            state    : nextState,
            updatedAt: new Date().toISOString()
        };

        await this._replace(recordKey, updated);
        return updated;
    }

    /**
     * @summary Converts crash-interrupted `dispatching` records into terminal `unknown`.
     *
     * @returns {Promise<Number>} Number of records terminalized.
     */
    async recoverInterrupted() {
        const interrupted = await this.list('dispatching');
        let   recovered   = 0;

        for (const record of interrupted) {
            const updated = await this.transition(record.recordKey, 'dispatching', 'unknown', {
                outcomeReason: 'receiver-restarted-during-non-idempotent-dispatch'
            });
            if (updated) recovered++;
        }

        return recovered;
    }

    /**
     * @summary Returns the canonical path for one hashed record key.
     * @param {String} recordKey
     * @returns {String}
     */
    getRecordPath(recordKey) {
        if (!/^[a-f0-9]{64}$/.test(recordKey || '')) {
            throw new Error('Invalid wake receiver record key');
        }
        return path.join(this.recordsDir, `${recordKey}${RECORD_FILE_SUFFIX}`);
    }

    /**
     * @summary Replaces one record through a synced 0600 temp file + atomic rename.
     * @param {String} recordKey
     * @param {Object} record
     * @returns {Promise<void>}
     * @private
     */
    async _replace(recordKey, record) {
        const recordPath = this.getRecordPath(recordKey);
        const tempPath   = `${recordPath}.${process.pid}.${crypto.randomUUID()}.tmp`;

        await this._writeSynced(tempPath, record);
        // _syncDirectory() below deliberately tolerates EINVAL/ENOTSUP/EPERM. The shared primitive's
        // fsync is STRICT by contract, so migrating would turn a tolerated platform degradation into a
        // hard failure on exactly the platforms that cannot fsync a directory.
        await fs.rename(tempPath, recordPath); // atomic-write-ok: strict primitive fsync vs this site's tolerated directory sync
        await fs.chmod(recordPath, 0o600);
        await this._syncDirectory();
    }

    /**
     * @summary Writes and fsyncs one 0600 JSON file.
     * @param {String} filePath
     * @param {Object} value
     * @returns {Promise<void>}
     * @private
     */
    async _writeSynced(filePath, value) {
        const handle = await fs.open(filePath, 'wx', 0o600);

        try {
            await handle.writeFile(JSON.stringify(value) + '\n', 'utf8');
            await handle.sync();
        } finally {
            await handle.close();
        }
    }

    /**
     * @summary Best-effort directory fsync for durable link/rename metadata.
     * @returns {Promise<void>}
     * @private
     */
    async _syncDirectory() {
        let handle;

        try {
            handle = await fs.open(this.recordsDir, 'r');
            await handle.sync();
        } catch (error) {
            if (!['EINVAL', 'ENOTSUP', 'EPERM'].includes(error.code)) throw error;
        } finally {
            await handle?.close();
        }
    }
}
