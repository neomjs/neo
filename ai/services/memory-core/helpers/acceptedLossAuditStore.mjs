import {appendFile, mkdir, readFile} from 'fs/promises';
import path                          from 'path';

/**
 * @module ai/services/memory-core/helpers/acceptedLossAuditStore
 * @summary Durable JSONL audit log for AUTONOMOUS accepted-loss settlements — the observability sink for
 * `decideAcceptedLossSettlement`'s `auto-settle` disposition. Append-only: every autonomous settlement
 * records its `auto-accepted-loss` audit entry (ids + reasons + the shared residue fingerprint) so an
 * operator, when one is present, can review the accepted losses asynchronously — but the system NEVER
 * blocks on a human and there is no ack. This is telemetry, not a gate. Mirrors the `recoveryRunStateStore`
 * JSONL shape: I/O at the edge only, deterministic content. The fingerprint is the auto-reopen key — a later
 * embedding-capability change re-opens the residue, so an audited loss is recorded-and-reversible, not silent.
 */

const AUDIT_FILE_NAME = 'auto-accepted-loss.jsonl';

/**
 * @summary The JSONL audit-log path within a state directory.
 * @param {String} dir
 * @returns {String}
 */
export function getAcceptedLossAuditFilePath(dir) {
    return path.join(dir, AUDIT_FILE_NAME);
}

/**
 * @summary Appends one `auto-accepted-loss` audit entry to the durable JSONL log (creating the dir if needed).
 * @param {Object} entry The `decideAcceptedLossSettlement` `auditRecord` (or any JSON-serializable record).
 * @param {Object} options
 * @param {String} options.dir The durable state directory.
 * @returns {Promise<String>} The audit-log file path written to.
 * @throws {TypeError} when `entry` is not an object or `dir` is missing/empty.
 */
export async function appendAutoAcceptedLoss(entry, {dir} = {}) {
    if (!entry || typeof entry !== 'object') {
        throw new TypeError('appendAutoAcceptedLoss: entry object is required');
    }
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('appendAutoAcceptedLoss: dir is required');
    }

    await mkdir(dir, {recursive: true});

    const filePath = getAcceptedLossAuditFilePath(dir);
    await appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');

    return filePath;
}

/**
 * @summary Reads all `auto-accepted-loss` audit entries from the durable JSONL log (oldest → newest).
 * A missing log returns `[]` (no settlements recorded yet) — never throws on absence.
 * @param {Object} options
 * @param {String} options.dir The durable state directory.
 * @returns {Promise<Object[]>} The parsed audit entries in append order.
 */
export async function readAutoAcceptedLossAudit({dir} = {}) {
    let text;

    try {
        text = await readFile(getAcceptedLossAuditFilePath(dir), 'utf8');
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return [];
        }
        throw error;
    }

    return text.split('\n').filter(Boolean).map(line => JSON.parse(line));
}
