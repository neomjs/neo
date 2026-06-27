import fs   from 'fs-extra';
import path from 'path';

export const DEPLOYMENT_STATE_BRIDGE_SCHEMA_VERSION = 1;

const DEFAULT_MAX_SNAPSHOT_BYTES = 256 * 1024;
const DEFAULT_STALE_AFTER_MS     = 2 * 60 * 1000;

/**
 * @summary Builds a bounded deployment-state snapshot envelope for KB/MC read tools.
 *
 * The bridge snapshot is a model-free file handoff. It deliberately contains only bounded,
 * allowlisted service state already collected by the internal orchestrator holder; KB/MC read
 * tools consume this file without receiving Docker/socket/shell authority.
 *
 * @param {Object} options
 * @param {Number} [options.generatedAt=Date.now()] Snapshot timestamp in epoch ms.
 * @param {String} [options.source='orchestrator-deployment-state-bridge'] Producer label.
 * @param {Object[]} [options.services=[]] Bounded per-service snapshots.
 * @param {Object|null} [options.recoveryRuns=null] Bounded recovery-run ledger snapshot.
 * @param {Object|null} [options.selfHeal=null] Bounded self-heal immune-system status (heal-ledger summary + recent events).
 * @returns {Object}
 */
export function createDeploymentStateSnapshot({
    generatedAt = Date.now(),
    source = 'orchestrator-deployment-state-bridge',
    services = [],
    recoveryRuns = null,
    selfHeal = null
} = {}) {
    if (!Number.isFinite(generatedAt)) {
        throw new TypeError('createDeploymentStateSnapshot: generatedAt must be finite');
    }

    if (!Array.isArray(services)) {
        throw new TypeError('createDeploymentStateSnapshot: services must be an array');
    }

    return {
        schemaVersion: DEPLOYMENT_STATE_BRIDGE_SCHEMA_VERSION,
        recordType   : 'deployment-state-snapshot',
        generatedAt,
        source,
        services,
        recoveryRuns,
        selfHeal
    };
}

/**
 * @summary Writes a deployment-state snapshot atomically.
 * @param {Object} options
 * @param {String} options.filePath Destination JSON file.
 * @param {Object} options.snapshot Snapshot payload.
 * @param {Number} [options.maxBytes=262144] Hard serialized-size cap.
 * @returns {Promise<{ok: Boolean, filePath: String, bytes: Number}>}
 */
export async function writeDeploymentStateSnapshot({
    filePath,
    snapshot,
    maxBytes = DEFAULT_MAX_SNAPSHOT_BYTES
} = {}) {
    assertFilePath(filePath, 'writeDeploymentStateSnapshot');

    const json  = `${JSON.stringify(snapshot, null, 2)}\n`,
          bytes = Buffer.byteLength(json, 'utf8');

    if (bytes > maxBytes) {
        throw new Error(`Deployment state snapshot exceeds ${maxBytes} bytes`);
    }

    await fs.ensureDir(path.dirname(filePath));

    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, json, 'utf8');
    await fs.rename(tempPath, filePath);

    return {ok: true, filePath, bytes};
}

/**
 * @summary Reads the latest deployment-state bridge snapshot.
 * @param {Object} options
 * @param {String} options.filePath Snapshot JSON file.
 * @param {Number} [options.now=Date.now()] Current time in epoch ms.
 * @param {Number} [options.staleAfterMs=120000] Freshness window; <=0 disables stale classification.
 * @param {Number} [options.maxBytes=262144] Hard read-size cap.
 * @returns {Promise<Object>}
 */
export async function readDeploymentStateSnapshot({
    filePath,
    now = Date.now(),
    staleAfterMs = DEFAULT_STALE_AFTER_MS,
    maxBytes = DEFAULT_MAX_SNAPSHOT_BYTES
} = {}) {
    if (!filePath) {
        return unavailable({reason: 'snapshot-path-unconfigured'});
    }

    try {
        const stat = await fs.stat(filePath);

        if (stat.size > maxBytes) {
            return unavailable({filePath, reason: 'snapshot-too-large', details: {size: stat.size, maxBytes}});
        }

        const snapshot = JSON.parse(await fs.readFile(filePath, 'utf8')),
              ageMs    = Number.isFinite(snapshot.generatedAt) ? Math.max(0, now - snapshot.generatedAt) : null,
              stale    = Number.isFinite(ageMs) && staleAfterMs > 0 && ageMs > staleAfterMs;

        return {
            ok    : !stale,
            status: stale ? 'stale' : 'available',
            filePath,
            ageMs,
            staleAfterMs,
            snapshot,
            reason: stale ? 'snapshot-stale' : null
        };
    } catch (error) {
        if (error.code === 'ENOENT') {
            return unavailable({filePath, reason: 'snapshot-missing'});
        }

        return unavailable({filePath, reason: 'snapshot-read-failed', details: {message: error.message}});
    }
}

/**
 * @summary Bounds a UTF-8 string to the last `maxBytes` bytes.
 * @param {String|null|undefined} value Text to bound.
 * @param {Number} maxBytes Byte cap.
 * @returns {{text: String, truncated: Boolean, maxBytes: Number}}
 */
export function boundUtf8Tail(value, maxBytes) {
    const text = value == null ? '' : String(value);

    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
        return {text: '', truncated: text.length > 0, maxBytes};
    }

    const buffer = Buffer.from(text, 'utf8');
    if (buffer.length <= maxBytes) {
        return {text, truncated: false, maxBytes};
    }

    return {
        text     : buffer.subarray(buffer.length - maxBytes).toString('utf8'),
        truncated: true,
        maxBytes
    };
}

function unavailable({filePath = null, reason, details = null}) {
    return {
        ok      : false,
        status  : 'unavailable',
        filePath,
        ageMs   : null,
        snapshot: null,
        reason,
        details
    };
}

function assertFilePath(filePath, callerName) {
    if (typeof filePath !== 'string' || filePath.length === 0) {
        throw new TypeError(`${callerName}: filePath is required`);
    }
}
