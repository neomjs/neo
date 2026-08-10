import crypto from 'node:crypto';
import fs     from 'fs-extra';
import path   from 'path';

import {summarizeBundleIntegrity} from './bundleIntegrity.mjs';

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

// Config-contract bounds for the `maintenance.backup.offHostSync` subtree, living beside the
// validator that enforces them. See `validateOffHostSyncConfig` below for why the contract belongs
// to this layer rather than to the maintenance script that runs the sync.
const ANY_PLACEHOLDER     = /\{[^}]*\}/,
      ENV_NAME_PATTERN    = /^[A-Z_][A-Z0-9_]*$/,
      GRACE_MAX_MS        = 60000,
      PLACEHOLDER_PATTERN = /^\{(bundleDir|bundleName)\}$/,
      TIMEOUT_MAX_MS      = 30 * 60 * 1000,
      TIMEOUT_MIN_MS      = 1000;

/**
 * Stable classification of an off-host-sync config defect. Projected remotely INSTEAD of the
 * human-readable `error`, which interpolates the offending value.
 * @type {Object}
 */
export const OFFHOST_SYNC_ERROR_CODE = Object.freeze({
    ARGV_NOT_STRING_ARRAY   : 'KB_OFFHOST_SYNC_ARGV_NOT_STRING_ARRAY',
    ARGV_PLACEHOLDER_INVALID: 'KB_OFFHOST_SYNC_ARGV_PLACEHOLDER_INVALID',
    COMMAND_NOT_STRING      : 'KB_OFFHOST_SYNC_COMMAND_NOT_STRING',
    CONFIG_NOT_OBJECT       : 'KB_OFFHOST_SYNC_CONFIG_NOT_OBJECT',
    ENV_ALLOWLIST_INVALID   : 'KB_OFFHOST_SYNC_ENV_ALLOWLIST_INVALID',
    KILL_GRACE_OUT_OF_RANGE : 'KB_OFFHOST_SYNC_KILL_GRACE_OUT_OF_RANGE',
    NUL_BYTE                : 'KB_OFFHOST_SYNC_NUL_BYTE',
    TIMEOUT_OUT_OF_RANGE    : 'KB_OFFHOST_SYNC_TIMEOUT_OUT_OF_RANGE'
});

const now = () => new Date().toISOString();

/**
 * Validates the nested offHostSync config keys. The contract is owned here rather than by a leaf
 * because the keys are plain nested values inside the `maintenance.backup` object leaf, which
 * declares no per-key `leaf()` nodes and therefore binds no per-key env override or type parser.
 *
 * **Why this lives in the store rather than the maintenance script:** the off-host durability
 * posture on the deployment-state snapshot must answer "is this hook configured
 * and valid?", and the orchestrator's `DeploymentStateBridgeService` is a READ-ONLY projector that
 * deliberately never imports `ai/scripts/maintenance/offHostSync.mjs` — that script's module body is
 * CLI machinery and pulls `node:child_process` into the diagnostic path. Duplicating the predicate
 * for the bridge would have created two enablement resolvers able to disagree, so the single
 * implementation moved to this shared, side-effect-free layer that both consumers already import.
 * The script re-exports it, so its callers and its owning ticket's spec are unaffected.
 *
 * @param {Object} [config={}] The `AiConfig.maintenance.backup.offHostSync` subtree (may be undefined).
 * @returns {{enabled: Boolean, error: String|null, errorCode: String|null, value: Object}}
 * `error` is operator-facing prose that MAY interpolate the offending config value; `errorCode` is a
 * stable classification that never does. A caller writing to a remotely readable surface must carry
 * the code and drop the prose.
 */
export function validateOffHostSyncConfig(config = {}) {
    const {
        argv          = [],
        command       = '',
        envAllowlist  = [],
        killGraceMs   = 5000,
        timeoutMs     = 600000
    } = config ?? {};

    // `errorCode` is the ONLY half of a failure that is safe to project remotely. `error` carries
    // the operator-facing detail, which for the placeholder and NUL cases interpolates the offending
    // `argv` token verbatim — and an operator can put a credential in argv. A caller that projects
    // `error` into a remotely readable surface leaks it; the code says the same thing about the
    // DEFECT while saying nothing about the VALUE.
    const fail = (errorCode, error) => ({enabled: false, error, errorCode, value: null});

    // Validate EVERY key before the disabled early-return: a disabled hook with malformed keys is a
    // validation failure, not a silent pass.
    if (config === null || typeof config !== 'object' || Array.isArray(config)) return fail(OFFHOST_SYNC_ERROR_CODE.CONFIG_NOT_OBJECT, 'config must be an object');
    if (typeof command !== 'string') return fail(OFFHOST_SYNC_ERROR_CODE.COMMAND_NOT_STRING, 'command must be a string');
    // Array-shape before any traversal: null/object/number argv must return a validation outcome,
    // never a thrown TypeError.
    if (!Array.isArray(argv) || argv.some(token => typeof token !== 'string')) return fail(OFFHOST_SYNC_ERROR_CODE.ARGV_NOT_STRING_ARRAY, 'argv must be an array of strings');
    if (command.includes('\0') || argv.some(token => token.includes('\0'))) {
        return fail(OFFHOST_SYNC_ERROR_CODE.NUL_BYTE, 'command/argv must not contain NUL bytes')
    }

    for (const token of argv) {
        if (ANY_PLACEHOLDER.test(token) && !PLACEHOLDER_PATTERN.test(token)) {
            return fail(OFFHOST_SYNC_ERROR_CODE.ARGV_PLACEHOLDER_INVALID, `argv token must be a whole-token placeholder {bundleDir} or {bundleName}, got: ${token}`)
        }
    }

    if (!Array.isArray(envAllowlist) || envAllowlist.some(name => typeof name !== 'string' || !ENV_NAME_PATTERN.test(name))) {
        return fail(OFFHOST_SYNC_ERROR_CODE.ENV_ALLOWLIST_INVALID, 'envAllowlist entries must match /^[A-Z_][A-Z0-9_]*$/')
    }

    if (!Number.isInteger(timeoutMs) || timeoutMs < TIMEOUT_MIN_MS || timeoutMs > TIMEOUT_MAX_MS) {
        return fail(OFFHOST_SYNC_ERROR_CODE.TIMEOUT_OUT_OF_RANGE, `timeoutMs must be an integer between ${TIMEOUT_MIN_MS} and ${TIMEOUT_MAX_MS}`)
    }
    if (!Number.isInteger(killGraceMs) || killGraceMs < 0 || killGraceMs > GRACE_MAX_MS) {
        return fail(OFFHOST_SYNC_ERROR_CODE.KILL_GRACE_OUT_OF_RANGE, `killGraceMs must be an integer between 0 and ${GRACE_MAX_MS}`)
    }

    if (command.trim() === '') return {enabled: false, error: null, errorCode: null, value: null};

    return {
        enabled  : true,
        error    : null,
        errorCode: null,
        value    : {argv, command: command.trim(), envAllowlist, killGraceMs, timeoutMs}
    }
}

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
 * @param {Array<Object>} [options.integrity] `bundle-meta.integrity` checks, summarized into the
 * receipt so a receipt-only consumer cannot read `backup.status: 'success'` as "restorable".
 * `status` keeps its meaning — it reports that the local bundle completed, which is a real and
 * useful fact — it simply stops being the ONLY fact visible here. Additive by construction:
 * {@link readBackupReceipt} rejects any `schemaVersion` it does not recognise, so bumping the
 * version to carry this would make every receipt already on disk unreadable.
 * @returns {Object}
 */
export function buildBackupReceipt({backup, bundleName, bundleCompletedAt, finishedAt, integrity, offHostSync, syncStatus = 'disabled'}) {
    return {
        backup,
        bundleCompletedAt: bundleCompletedAt ?? null,
        integrity        : summarizeBundleIntegrity(integrity),
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

let writeCounter = 0;

/**
 * @summary Returns true only when the encoded temp owner is provably gone. A live process, an
 * indeterminate permission result, malformed metadata, or PID reuse all retain the temp: leaking a
 * bounded stale file is safer than unlinking a writer that still intends to rename it.
 * @param {Number} pid
 * @returns {Boolean}
 */
function isProcessProvablyDead(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;

    try {
        process.kill(pid, 0);
        return false
    } catch (error) {
        return error?.code === 'ESRCH'
    }
}

/**
 * Writes the receipt atomically: a per-write unique temp path (pid + timestamp + monotonic counter
 * + random suffix — two writes inside the same millisecond on the same pid never collide), fsync,
 * rename. A torn write leaves the previous receipt intact. The stale-temp sweep only removes an old
 * temp when its encoded owner PID is provably dead; age alone is never treated as liveness proof.
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
    // DELIBERATELY NOT the shared `writeFileAtomic` primitive. The scratch NAME is a contract between this writer
    // and the stale-temp reaper below: the reaper matches `${basename}.tmp-` and decodes the owner pid
    // out of the name to prove the owner is dead before removing it. The primitive owns its own scratch
    // naming and does not publish a matcher, so adopting it would leave every crash-leaked temp
    // permanently unreapable. Writer and reaper stay one unit until the primitive exports that
    // predicate — which would be new public API in service of a single caller.
    await fs.promises.rename(tempPath, filePath); // atomic-write-ok: the scratch NAME is a contract with the stale-temp reaper below

    // Stale-temp sweep: age makes a temp eligible, but only a provably dead encoded owner makes it
    // removable. PID reuse / EPERM / malformed metadata intentionally leak in the safe direction.
    try {
        const prefix = `${path.basename(filePath)}.tmp-`;
        for (const entry of await fs.promises.readdir(path.dirname(filePath))) {
            if (!entry.startsWith(prefix) || entry === tempName) continue;

            const
                [ownerPidToken, entryMsToken] = entry.slice(prefix.length).split('-'),
                ownerPid                      = Number(ownerPidToken),
                entryMs                       = Number(entryMsToken);

            if (Number.isFinite(entryMs) && entryMs < now - STALE_TEMP_HORIZON_MS && isProcessProvablyDead(ownerPid)) {
                await fs.promises.rm(path.join(path.dirname(filePath), entry), {force: true})
            }
        }
    } catch { /* best-effort */ }

    return {bytes, filePath}
}

/**
 * @summary Reads one already-opened file handle through ordinary short reads, returning only bytes
 * actually delivered before the measured length or EOF.
 * @param {Object} handle Open file handle exposing `read(buffer, offset, length, position)`.
 * @param {Number} size
 * @returns {Promise<Buffer>}
 */
async function readOpenedFile(handle, size) {
    const buffer = Buffer.alloc(size);
    let   offset = 0;

    while (offset < size) {
        const {bytesRead} = await handle.read(buffer, offset, size - offset, offset);

        if (bytesRead === 0) break;
        offset += bytesRead
    }

    return buffer.subarray(0, offset)
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
            raw = (await readOpenedFile(handle, stat.size)).toString('utf8')
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

export const __private__ = {MAX_RECEIPT_BYTES, MAX_TAIL_BYTES, isProcessProvablyDead, readOpenedFile};
