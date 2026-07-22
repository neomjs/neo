import fs   from 'fs-extra';
import path from 'path';

/**
 * @module ai/services/memory-core/helpers/offHostSyncStore
 * @summary The deployment-global backup receipt store: envelope builder, atomic writer, and
 * validated reader for the off-host durability receipt (`AiConfig.backupPath/last-backup-receipt.json`).
 *
 * Ownership contract: the lease-owning CLI wrapper of `backup.mjs` writes; the orchestrator's
 * DeploymentStateBridgeService reads for snapshot projection. No Neo imports — pure Node.
 */

export const OFFHOST_SYNC_SCHEMA_VERSION = 1;

const MAX_RECEIPT_BYTES = 64 * 1024,
      MAX_TAIL_BYTES    = 4 * 1024;

const now = () => new Date().toISOString();

/**
 * Builds the deployment-global receipt envelope.
 * @param {Object} options
 * @param {Object} options.backup `{status: 'success'|'failed', durationMs, error}`
 * @param {String|null} options.bundleName
 * @param {String|null} options.bundleCompletedAt
 * @param {String|null} options.finishedAt
 * @param {Object|null} options.offHostSync Sync outcome or null when not run.
 * @param {String} [options.syncStatus='disabled'] Status when offHostSync is null.
 * @returns {Object}
 */
export function buildBackupReceipt({backup, bundleName, bundleCompletedAt, finishedAt, offHostSync, syncStatus = 'disabled'}) {
    return {
        backup,
        bundleCompletedAt: bundleCompletedAt ?? null,
        bundleName       : bundleName ?? null,
        finishedAt       : finishedAt ?? now(),
        offHostSync      : offHostSync ?? {
            completionScope: 'direct-child',
            descendants    : 'unknown',
            durationMs     : null,
            exitCode       : null,
            signal         : null,
            status         : syncStatus,
            stderrTail     : '',
            terminatedVia  : null
        },
        schemaVersion    : OFFHOST_SYNC_SCHEMA_VERSION
    }
}

/**
 * Writes the receipt atomically: unique temp path, write, rename. A torn write leaves the previous
 * receipt intact; a stale temp from a crashed writer is swept on the next write.
 * @param {Object} options
 * @param {String} options.filePath Receipt destination (inside `AiConfig.backupPath`).
 * @param {Object} options.receipt Envelope from {@link buildBackupReceipt}.
 * @returns {Promise<{filePath: String, bytes: Number}>}
 */
export async function writeBackupReceipt({filePath, receipt}) {
    const
        payload = JSON.stringify(receipt, null, 2),
        bytes   = Buffer.byteLength(payload, 'utf8');

    if (bytes > MAX_RECEIPT_BYTES) {
        throw new Error(`backup receipt exceeds the ${MAX_RECEIPT_BYTES}-byte cap (${bytes} bytes)`)
    }

    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;

    await fs.promises.mkdir(path.dirname(filePath), {recursive: true});
    await fs.promises.writeFile(tempPath, payload, 'utf8');
    await fs.promises.rename(tempPath, filePath);

    // Stale-temp sweep: best-effort, never blocks the receipt
    try {
        for (const entry of await fs.promises.readdir(path.dirname(filePath))) {
            if (entry.startsWith(`${path.basename(filePath)}.tmp-`)) {
                await fs.promises.rm(path.join(path.dirname(filePath), entry), {force: true})
            }
        }
    } catch { /* best-effort */ }

    return {bytes, filePath}
}

/**
 * Reads + validates the receipt store for snapshot projection. Never throws: every failure mode
 * resolves to a stable machine-consumable outcome.
 * @param {Object} options
 * @param {String} options.filePath
 * @returns {Promise<{status: 'ok', receipt: Object} | {status: 'missing'} | {status: 'unreadable', kind: String, finishedAt: String|null}>}
 */
export async function readBackupReceipt({filePath}) {
    let raw;

    try {
        raw = await fs.promises.readFile(filePath, 'utf8')
    } catch (error) {
        if (error.code === 'ENOENT') return {status: 'missing'};
        return {finishedAt: null, kind: 'corrupt', status: 'unreadable'}
    }

    if (Buffer.byteLength(raw, 'utf8') > MAX_RECEIPT_BYTES) {
        return {finishedAt: null, kind: 'oversize', status: 'unreadable'}
    }

    let parsed;
    try {
        parsed = JSON.parse(raw)
    } catch {
        return {finishedAt: null, kind: 'corrupt', status: 'unreadable'}
    }

    if (parsed?.schemaVersion !== OFFHOST_SYNC_SCHEMA_VERSION) {
        return {finishedAt: typeof parsed?.finishedAt === 'string' ? parsed.finishedAt : null, kind: 'unsupported-version', status: 'unreadable'}
    }

    return {receipt: parsed, status: 'ok'}
}

export const __private__ = {MAX_RECEIPT_BYTES, MAX_TAIL_BYTES};
