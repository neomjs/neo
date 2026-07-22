import crypto from 'node:crypto';
import fs     from 'fs-extra';
import path   from 'path';

/**
 * @module ai/services/memory-core/helpers/offHostSyncStore
 * @summary The deployment-global backup receipt store: envelope builder, atomic writer, and
 * validated reader for the off-host durability receipt (`AiConfig.backupPath/last-backup-receipt.json`).
 *
 * Ownership contract: the lease-owning CLI wrapper of `backup.mjs` writes; the orchestrator's
 * DeploymentStateBridgeService reads for snapshot projection. No Neo imports — pure Node.
 */

export const OFFHOST_SYNC_SCHEMA_VERSION = 1;

const MAX_RECEIPT_BYTES     = 64 * 1024,
      MAX_TAIL_BYTES        = 4 * 1024,
      STALE_TEMP_HORIZON_MS = 60_000;

const now = () => new Date().toISOString();

/**
 * Bounds a string to the LAST maxBytes bytes with UTF-8-safe output: partial lead sequences are
 * dropped until the re-encoded result fits the budget (replacement-char inflation can otherwise
 * exceed it). Tail-biased because the most recent error context lives at the end.
 * @param {*} value
 * @param {Number} maxBytes
 * @returns {String}
 */
export function utf8SafeTail(value, maxBytes) {
    const text = value == null ? '' : String(value);

    if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;

    let out = Buffer.from(text, 'utf8').subarray(-maxBytes).toString('utf8');

    while (Buffer.byteLength(out, 'utf8') > maxBytes && out.length > 0) {
        out = out.slice(1)
    }

    return out
}

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
let writeCounter = 0;

/**
 * Writes the receipt atomically: a per-write unique temp path (pid + timestamp + monotonic counter
 * + random suffix — two writes inside the same millisecond on the same pid never collide), fsync,
 * rename. A torn write leaves the previous receipt intact. The stale-temp sweep only removes temps
 * older than this write's own timestamp, so it can never delete another live writer's in-flight temp.
 * @param {Object} options
 * @param {String} options.filePath Receipt destination (inside `AiConfig.backupPath`).
 * @param {Object} options.receipt Envelope from {@link buildBackupReceipt}.
 * @param {Number} [options.now=Date.now()] Injectable clock (tests pin two writes into the same ms).
 * @returns {Promise<{filePath: String, bytes: Number}>}
 */
export async function writeBackupReceipt({filePath, receipt, now = Date.now()}) {
    const
        payload = JSON.stringify(receipt, null, 2),
        bytes   = Buffer.byteLength(payload, 'utf8');

    if (bytes > MAX_RECEIPT_BYTES) {
        throw new Error(`backup receipt exceeds the ${MAX_RECEIPT_BYTES}-byte cap (${bytes} bytes)`)
    }

    const
        counter  = ++writeCounter,
        suffix   = crypto.randomBytes(4).toString('hex'),
        tempName = `${path.basename(filePath)}.tmp-${process.pid}-${now}-${counter}-${suffix}`,
        tempPath = path.join(path.dirname(filePath), tempName);

    await fs.promises.mkdir(path.dirname(filePath), {recursive: true});
    const handle = await fs.promises.open(tempPath, 'w');
    try {
        await handle.write(payload, 0, 'utf8');
        await handle.sync(); // durable before the rename — a crash never yields a torn receipt
    } finally {
        await handle.close()
    }
    await fs.promises.rename(tempPath, filePath);

    // Stale-temp sweep: only temps older than the staleness HORIZON. A temp younger than the
    // horizon may belong to a live writer — even one that started before this write — so "older
    // than this write's start millisecond" is never the staleness criterion. Best-effort only.
    try {
        const prefix = `${path.basename(filePath)}.tmp-`;
        for (const entry of await fs.promises.readdir(path.dirname(filePath))) {
            if (!entry.startsWith(prefix) || entry === tempName) continue;

            const entryMs = Number(entry.slice(prefix.length).split('-')[1]);

            if (Number.isFinite(entryMs) && entryMs < now - STALE_TEMP_HORIZON_MS) {
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

    // The 64 KiB ceiling is enforced on ONE opened handle: open → fstat → read at most cap bytes
    // from that handle. A path replacement between stat and read cannot bypass the bound because
    // the handle pins the file it measured.
    try {
        const handle = await fs.promises.open(filePath, 'r');
        try {
            const stat = await handle.stat();
            if (stat.size > MAX_RECEIPT_BYTES) {
                return {finishedAt: null, kind: 'oversize', status: 'unreadable'}
            }
            const buffer = Buffer.alloc(stat.size);
            await handle.read(buffer, 0, stat.size, 0);
            raw = buffer.toString('utf8')
        } finally {
            await handle.close()
        }
    } catch (error) {
        if (error.code === 'ENOENT') return {status: 'missing'};
        return {finishedAt: null, kind: 'corrupt', status: 'unreadable'}
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

    const receipt = validateReceiptShape(parsed);

    if (!receipt) {
        return {finishedAt: typeof parsed?.finishedAt === 'string' ? parsed.finishedAt : null, kind: 'corrupt', status: 'unreadable'}
    }

    return {receipt, status: 'ok'}
}

const SYNC_STATUSES = new Set(['disabled', 'not-run-backup-failed', 'success', 'failed', 'timeout', 'validation-failed']);

/**
 * Projects a parsed receipt into the validated allowlisted shape — arbitrary schema-v1 JSON never
 * passes through. Returns null when required fields are missing or mistyped.
 * @param {Object} parsed
 * @returns {Object|null}
 */
export function validateReceiptShape(parsed) {
    if (!parsed || typeof parsed !== 'object') return null;

    const
        backup      = parsed.backup,
        offHostSync = parsed.offHostSync;

    if (!backup || typeof backup !== 'object') return null;
    if (backup.status !== 'success' && backup.status !== 'failed') return null;
    if (typeof backup.durationMs !== 'number') return null;
    if (!(backup.error === null || typeof backup.error === 'string')) return null;
    // Provenance is a basename, never an absolute/host path.
    if (parsed.bundleName !== null && (typeof parsed.bundleName !== 'string' ||
        parsed.bundleName.includes('/') || parsed.bundleName.includes('\\') || /^[A-Za-z]:/.test(parsed.bundleName))) return null;
    if (!(parsed.finishedAt === null || typeof parsed.finishedAt === 'string')) return null;
    if (!(parsed.bundleCompletedAt === null || typeof parsed.bundleCompletedAt === 'string')) return null;

    if (!offHostSync || typeof offHostSync !== 'object') return null;
    if (!SYNC_STATUSES.has(offHostSync.status)) return null;
    if (!(offHostSync.durationMs === null || typeof offHostSync.durationMs === 'number')) return null;
    if (!(offHostSync.exitCode === null || Number.isInteger(offHostSync.exitCode))) return null;
    if (!(offHostSync.signal === null || typeof offHostSync.signal === 'string')) return null;
    if (!(offHostSync.terminatedVia === null || ['exit', 'sigterm', 'sigkill'].includes(offHostSync.terminatedVia))) return null;
    if (offHostSync.completionScope !== 'direct-child') return null;
    if (offHostSync.descendants !== 'unknown') return null;
    if (typeof offHostSync.stderrTail !== 'string') return null;

    // Read-side bounds: a hostile or legacy writer's oversized diagnostics are sanitized at the
    // projection boundary, never projected wholesale.
    const boundError = backup.error === null ? null : utf8SafeTail(backup.error, MAX_TAIL_BYTES);

    return {
        backup           : {durationMs: backup.durationMs, error: boundError, status: backup.status},
        bundleCompletedAt: parsed.bundleCompletedAt,
        bundleName       : parsed.bundleName,
        finishedAt       : parsed.finishedAt,
        offHostSync      : {
            completionScope: offHostSync.completionScope,
            descendants    : offHostSync.descendants,
            durationMs     : offHostSync.durationMs,
            exitCode       : offHostSync.exitCode,
            signal         : offHostSync.signal,
            status         : offHostSync.status,
            stderrTail     : utf8SafeTail(offHostSync.stderrTail, MAX_TAIL_BYTES),
            terminatedVia  : offHostSync.terminatedVia
        },
        schemaVersion    : OFFHOST_SYNC_SCHEMA_VERSION
    }
}

export const __private__ = {MAX_RECEIPT_BYTES, MAX_TAIL_BYTES};
