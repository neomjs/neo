import fs   from 'fs/promises';
import path from 'path';

/**
 * @module ai/services/memory-core/helpers/acceptedLossAckStore
 * @summary Durable persistence for operator accepted-loss acknowledgements — the store half that closes
 * the produce → store → classify loop. It persists the typed `accepted-loss-ack` record (built by the ack
 * constructor) keyed by its residue `fingerprint`, and retrieves the most-recent ack for a given
 * fingerprint, so the residue classifier can find the durable acknowledgement that lets a genuinely
 * unembeddable, operator-acknowledged residue settle as accepted-loss instead of paging "repair failed"
 * forever — without ever letting an unacknowledged or stale loss settle silently.
 *
 * One JSONL ledger per fingerprint (`<fingerprint>.jsonl`): a re-acknowledgement appends a fresh line and
 * retrieval reads the last (most-recent) line, so a later ack supersedes an earlier one for the same
 * residue+policy identity. The fingerprint is the shared residue-fingerprint hex digest, so a residue /
 * strategy / provider / terminality-policy change produces a different fingerprint → a different ledger →
 * a stale ack can never be found for changed loss. I/O lives only at the edge; no time/randomness.
 */

const ACK_FILE_SUFFIX = '.jsonl';

/**
 * @summary The per-fingerprint ledger file name.
 *
 * The fingerprint is a sha256 hex digest (already filename-safe); it is sanitized defensively so a
 * malformed fingerprint can never escape the store directory or collide with path separators.
 *
 * @param {String} fingerprint The residue fingerprint hex digest.
 * @returns {String}
 */
export function getAcceptedLossAckFileName(fingerprint) {
    return `${String(fingerprint).replace(/[^a-zA-Z0-9_.-]/g, '_')}${ACK_FILE_SUFFIX}`;
}

/**
 * @summary Persists one accepted-loss acknowledgement record, keyed by its residue fingerprint.
 *
 * Appends the record as a JSONL line to the per-fingerprint ledger; re-acknowledging the same
 * residue+policy identity appends a fresh line that supersedes the earlier one on read.
 *
 * @param {Object} options
 * @param {Object} options.entry A typed `accepted-loss-ack` record; must carry a non-empty `fingerprint`.
 * @param {String} options.dir Directory for the per-fingerprint ack ledgers.
 * @returns {Promise<String>} The written file path.
 * @throws {TypeError} when `dir` is missing or `entry.fingerprint` is absent/empty.
 */
export async function appendAcceptedLossAck({entry, dir} = {}) {
    if (!dir) {
        throw new TypeError('appendAcceptedLossAck: dir is required');
    }
    if (!entry || typeof entry.fingerprint !== 'string' || entry.fingerprint.length === 0) {
        throw new TypeError('appendAcceptedLossAck: entry.fingerprint is required');
    }

    await fs.mkdir(dir, {recursive: true});

    const filePath = path.join(dir, getAcceptedLossAckFileName(entry.fingerprint));
    await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');

    return filePath;
}

/**
 * @summary Retrieves the most-recent durable accepted-loss ack for a residue fingerprint, or null.
 *
 * Reads the per-fingerprint ledger and returns its last (newest) record. A missing ledger (no ack ever
 * stored for this fingerprint), an empty ledger, or a corrupt trailing line returns null — an
 * unacknowledged or unreadable residue must escalate, never silently settle as accepted-loss. The
 * returned record's own `fingerprint` is re-checked against the key, so a sanitized-name collision can
 * never surface an ack for a different residue.
 *
 * @param {Object} options
 * @param {String} options.fingerprint The residue fingerprint to look up.
 * @param {String} options.dir Directory for the per-fingerprint ack ledgers.
 * @returns {Promise<Object|null>} The most-recent matching ack record, or null when none is durably stored.
 */
export async function readAcceptedLossAckByFingerprint({fingerprint, dir} = {}) {
    if (!dir || typeof fingerprint !== 'string' || fingerprint.length === 0) {
        return null;
    }

    const filePath = path.join(dir, getAcceptedLossAckFileName(fingerprint));

    let text;
    try {
        text = await fs.readFile(filePath, 'utf8');
    } catch (e) {
        if (e?.code === 'ENOENT') return null;
        throw e;
    }

    const lines = text.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return null;

    try {
        const record = JSON.parse(lines[lines.length - 1]);
        return record && record.fingerprint === fingerprint ? record : null;
    } catch (e) {
        return null;
    }
}
