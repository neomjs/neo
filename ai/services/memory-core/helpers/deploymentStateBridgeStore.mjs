import fs                from 'fs-extra';
import {writeFileAtomic} from '../../shared/atomicFileWrite.mjs';

export const DEPLOYMENT_STATE_BRIDGE_SCHEMA_VERSION = 1;

const DEFAULT_MAX_SNAPSHOT_BYTES = 256 * 1024;
const DEFAULT_STALE_AFTER_MS     = 2 * 60 * 1000;

const CURRENT_SNAPSHOT_SECTIONS = [
    'services',
    'bridgeDiagnostics',
    'recoveryRuns',
    'selfHeal',
    'tenantRepoSync',
    'maintenance',
    'heavyMaintenanceStarvation'
];

// Additive schema-compatible sections: produced when present, tolerated absent in older snapshots
// (a snapshot predating the section's introduction stays valid, never degraded for its absence).
const ADDITIVE_SNAPSHOT_SECTIONS = ['maintenance', 'heavyMaintenanceStarvation'];

const CURRENT_PRODUCER_METADATA = Object.freeze({
    name         : 'orchestrator-deployment-state-bridge',
    schemaVersion: DEPLOYMENT_STATE_BRIDGE_SCHEMA_VERSION,
    sections     : CURRENT_SNAPSHOT_SECTIONS
});

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
 * @param {Object|null} [options.bridgeDiagnostics=null] Bounded bridge-level runtime-access diagnosis.
 * @param {Object|null} [options.recoveryRuns=null] Bounded recovery-run ledger snapshot.
 * @param {Object|null} [options.selfHeal=null] Bounded self-heal immune-system status (heal-ledger summary + recent events).
 * @param {Object|null} [options.tenantRepoSync=null] Bounded tenant-repo-sync scheduler/task/config snapshot.
 * @param {Object|null} [options.heavyMaintenanceStarvation=null] Bounded heavy-maintenance starvation verdict
 * (four-posture receipt from the starvation watchdog: `posture`, `checkedAt`, `degradeAfterMs`, `waiterCount`,
 * `unreadableCount`, `leaseHolder`, `breaches[]`); additive/tolerated-absent, consumed by the Memory Core
 * aggregate-health fold, which degrades only on a FRESH `degraded` posture.
 * @param {Object} [options.producer=CURRENT_PRODUCER_METADATA] Bounded snapshot producer metadata.
 * @returns {Object}
 */
export function createDeploymentStateSnapshot({
    generatedAt = Date.now(),
    source = 'orchestrator-deployment-state-bridge',
    services = [],
    bridgeDiagnostics = null,
    recoveryRuns = null,
    selfHeal = null,
    tenantRepoSync = null,
    maintenance = null,
    heavyMaintenanceStarvation = null,
    producer = CURRENT_PRODUCER_METADATA
} = {}) {
    if (!Number.isFinite(generatedAt)) {
        throw new TypeError('createDeploymentStateSnapshot: generatedAt must be finite');
    }

    if (!Array.isArray(services)) {
        throw new TypeError('createDeploymentStateSnapshot: services must be an array');
    }

    const snapshot = {
        schemaVersion: DEPLOYMENT_STATE_BRIDGE_SCHEMA_VERSION,
        recordType   : 'deployment-state-snapshot',
        generatedAt,
        source,
        producer     : sanitizeProducerMetadata(producer),
        services,
        bridgeDiagnostics,
        recoveryRuns,
        selfHeal,
        tenantRepoSync
    };

    // Absent-before-first-run: the block is OMITTED (never fabricated as null); older consumers
    // tolerate the absence, and the schema inspector treats additive sections as tolerated-absent.
    if (maintenance !== null && maintenance !== undefined) {
        snapshot.maintenance = maintenance
    }

    // Same tolerated-absent contract: present only once the starvation watchdog has produced a
    // verdict, so a snapshot predating the lane (or a plane with the lane disabled and never run)
    // is indistinguishable from before this section existed.
    if (heavyMaintenanceStarvation !== null && heavyMaintenanceStarvation !== undefined) {
        snapshot.heavyMaintenanceStarvation = heavyMaintenanceStarvation
    }

    return snapshot
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

    // Was `${filePath}.${pid}.${Date.now()}.tmp` — `Date.now()` has millisecond resolution, so two
    // snapshots written inside one tick by the same process collided. The primitive's UUID does not.
    await writeFileAtomic(filePath, json);

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

        const snapshot          = JSON.parse(await fs.readFile(filePath, 'utf8')),
              ageMs             = Number.isFinite(snapshot.generatedAt) ? Math.max(0, now - snapshot.generatedAt) : null,
              stale             = Number.isFinite(ageMs) && staleAfterMs > 0 && ageMs > staleAfterMs,
              schemaDiagnostics = inspectSnapshotSchema(snapshot);

        if (stale) {
            return {
                ok    : false,
                status: 'stale',
                filePath,
                ageMs,
                staleAfterMs,
                snapshot,
                schemaDiagnostics,
                reason: 'snapshot-stale'
            };
        }

        if (schemaDiagnostics.status === 'degraded') {
            return {
                ok     : false,
                status : 'degraded',
                filePath,
                ageMs,
                staleAfterMs,
                snapshot,
                schemaDiagnostics,
                reason : schemaDiagnostics.reason,
                details: schemaDiagnostics
            };
        }

        return {
            ok    : true,
            status: 'available',
            filePath,
            ageMs,
            staleAfterMs,
            snapshot,
            schemaDiagnostics,
            reason: null
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

function inspectSnapshotSchema(snapshot) {
    const
        missingSections = CURRENT_SNAPSHOT_SECTIONS
            .filter(section => !ADDITIVE_SNAPSHOT_SECTIONS.includes(section))
            .filter(section => !Object.hasOwn(snapshot || {}, section)),
        producer        = sanitizeProducerMetadata(snapshot?.producer),
        producerMissing = !snapshot?.producer;

    let status = 'available',
        reason = null;

    if (missingSections.length > 0) {
        status = 'degraded';
        reason = 'snapshot-section-missing';
    } else if (producerMissing) {
        status = 'degraded';
        reason = 'snapshot-producer-metadata-missing';
    }

    return {
        schemaVersion          : DEPLOYMENT_STATE_BRIDGE_SCHEMA_VERSION,
        recordType             : 'deployment-state-schema-diagnostics',
        status,
        reason,
        expectedSections       : CURRENT_SNAPSHOT_SECTIONS,
        missingSections,
        producerMetadataPresent: !producerMissing,
        producer
    };
}

function sanitizeProducerMetadata(producer) {
    const source = producer && typeof producer === 'object' ? producer : CURRENT_PRODUCER_METADATA;

    return {
        name         : typeof source.name === 'string' ? source.name : CURRENT_PRODUCER_METADATA.name,
        schemaVersion: Number.isFinite(source.schemaVersion) ? source.schemaVersion : DEPLOYMENT_STATE_BRIDGE_SCHEMA_VERSION,
        sections     : Array.isArray(source.sections)
            ? source.sections.filter(section => CURRENT_SNAPSHOT_SECTIONS.includes(section))
            : [...CURRENT_SNAPSHOT_SECTIONS]
    };
}

function assertFilePath(filePath, callerName) {
    if (typeof filePath !== 'string' || filePath.length === 0) {
        throw new TypeError(`${callerName}: filePath is required`);
    }
}
