import fs   from 'fs/promises';
import path from 'path';

import {getWallClockMs} from './remRunStateStore.mjs';

export const RECOVERY_CLASSES = Object.freeze([
    'ambiguous',
    'config-drift',
    'contention',
    'crash',
    'data-integrity',
    'exhaustion',
    'external-load',
    'provider-role-residency'
]);

export const RECOVERY_RUN_RUNG_IDS = Object.freeze([
    'rung-0',
    'rung-1',
    'rung-2',
    'rung-3',
    'page'
]);

export const RECOVERY_RUN_STATUSES = Object.freeze([
    'actioned',
    'cooldown',
    'escalated',
    'failed',
    'no-action',
    'pending',
    'recorded',
    'recovered',
    'reobserve-requested'
]);

export const ACTIVE_RECOVERY_RUN_RETENTION_CLASS = 'active-effect-interlock';

export const RECOVERY_RUN_GRAPH_NODE_TYPES = Object.freeze({
    diagnosis       : 'RECOVERY_DIAGNOSIS',
    recoveryRun     : 'RECOVERY_RUN',
    recoveryRunState: 'RECOVERY_RUN_STATE',
    reobserveRequest: 'RECOVERY_REOBSERVE_REQUEST'
});

export const RECOVERY_TARGET_IDENTITY_KINDS = Object.freeze([
    'compose-service',
    'deploy-target',
    'supervised-task'
]);

/**
 * @summary Builds the gitignored file name used for one recovery-run state artifact.
 *
 * @param {String} recoveryRunId Stable recovery run id.
 * @returns {String} JSONL file name.
 */
export function getRecoveryRunStateFileName(recoveryRunId) {
    if (typeof recoveryRunId !== 'string' || recoveryRunId.length === 0) {
        throw new TypeError('getRecoveryRunStateFileName: recoveryRunId is required');
    }

    return `${recoveryRunId.replace(/[^a-zA-Z0-9_.-]/g, '_')}.jsonl`;
}

/**
 * @summary Builds the stable graph id for the latest recovery-run proof node.
 *
 * @param {String} recoveryRunId Stable recovery run id.
 * @returns {String} Graph node id.
 */
export function getRecoveryRunGraphNodeId(recoveryRunId) {
    validateStringId(recoveryRunId, 'recoveryRunId', 'getRecoveryRunGraphNodeId');

    return `recovery-run:${recoveryRunId}`;
}

/**
 * @summary Builds the stable graph id for one recovery-run state update.
 *
 * @param {String} recoveryRunId Stable recovery run id.
 * @param {Number} updatedAt Epoch milliseconds for the update.
 * @returns {String} Graph node id.
 */
export function getRecoveryRunStateGraphNodeId(recoveryRunId, updatedAt) {
    validateStringId(recoveryRunId, 'recoveryRunId', 'getRecoveryRunStateGraphNodeId');
    validateTimestamp(updatedAt, 'updatedAt', 'getRecoveryRunStateGraphNodeId');

    return `recovery-run-state:${recoveryRunId}:${updatedAt}`;
}

/**
 * @summary Builds the stable graph id for a recovery diagnosis proof node.
 *
 * @param {String} diagnosisId Stable diagnosis event id.
 * @returns {String} Graph node id.
 */
export function getRecoveryDiagnosisGraphNodeId(diagnosisId) {
    validateStringId(diagnosisId, 'diagnosisId', 'getRecoveryDiagnosisGraphNodeId');

    return `recovery-diagnosis:${diagnosisId}`;
}

/**
 * @summary Builds the stable graph id for a recovery reobserve request proof node.
 *
 * @param {String} recoveryRunId Stable recovery run id.
 * @param {Number} requestedAt Epoch milliseconds when the reobserve request was made.
 * @returns {String} Graph node id.
 */
export function getRecoveryReobserveGraphNodeId(recoveryRunId, requestedAt) {
    validateStringId(recoveryRunId, 'recoveryRunId', 'getRecoveryReobserveGraphNodeId');
    validateTimestamp(requestedAt, 'requestedAt', 'getRecoveryReobserveGraphNodeId');

    return `recovery-reobserve:${recoveryRunId}:${requestedAt}`;
}

/**
 * @summary Creates the typed recovery target identity used to route B0 vs external actuators.
 *
 * @param {Object} options
 * @param {String} options.kind supervised-task | compose-service | deploy-target.
 * @param {String} options.id Stable task/service/deploy target id.
 * @returns {Object} Typed target identity.
 */
export function createRecoveryTargetIdentity({kind, id} = {}) {
    validateEnum(kind, RECOVERY_TARGET_IDENTITY_KINDS, 'kind', 'createRecoveryTargetIdentity');

    if (typeof id !== 'string' || id.length === 0) {
        throw new TypeError('createRecoveryTargetIdentity: id is required');
    }

    return {kind, id};
}

/**
 * @summary Creates the diagnosis event handed from diagnostics to recovery.
 *
 * @param {Object} options
 * @param {String} options.diagnosisId Stable diagnosis event id.
 * @param {String} options.recoveryClass Recovery class enum.
 * @param {Number} options.confidence Diagnostic confidence in the inclusive 0..1 range.
 * @param {Object} options.targetIdentity Typed target identity.
 * @param {Object[]} [options.evidenceFacts=[]] Structured evidence facts.
 * @param {Number} options.observedAt Epoch milliseconds when diagnostics observed the fault.
 * @param {String} [options.source='diagnostics'] Event producer.
 * @param {Object} [options.details={}] Additional diagnostics-owned details.
 * @returns {Object} JSON-ready diagnosis event.
 */
export function createRecoveryDiagnosisEvent({
    diagnosisId,
    recoveryClass,
    confidence,
    targetIdentity,
    evidenceFacts = [],
    observedAt,
    source = 'diagnostics',
    details = {}
} = {}) {
    if (typeof diagnosisId !== 'string' || diagnosisId.length === 0) {
        throw new TypeError('createRecoveryDiagnosisEvent: diagnosisId is required');
    }
    validateEnum(recoveryClass, RECOVERY_CLASSES, 'recoveryClass', 'createRecoveryDiagnosisEvent');
    validateConfidence(confidence, 'createRecoveryDiagnosisEvent');
    validateTimestamp(observedAt, 'observedAt', 'createRecoveryDiagnosisEvent');
    validateArray(evidenceFacts, 'evidenceFacts', 'createRecoveryDiagnosisEvent');
    validateObject(details, 'details', 'createRecoveryDiagnosisEvent');

    return {
        schemaVersion : 1,
        type          : 'recovery-diagnosis',
        diagnosisId,
        recoveryClass,
        confidence,
        targetIdentity: createRecoveryTargetIdentity(targetIdentity),
        evidenceFacts,
        observedAt,
        source,
        details
    };
}

/**
 * @summary Creates the explicit cooldown-to-reobserve handshake owned by the recovery run.
 *
 * @param {Object} options
 * @param {String} options.recoveryRunId Stable recovery run id.
 * @param {Object} options.diagnosisEvent Typed diagnosis event.
 * @param {Number} options.requestedAt Epoch milliseconds for the request.
 * @param {Number} options.cooldownMs Non-negative cooldown before re-observation.
 * @param {Number} [options.healthyObservationThreshold=1] Required consecutive healthy observations.
 * @param {String} [options.reason='cooldown-expired'] Recovery-owned reason.
 * @returns {Object} JSON-ready reobserve request.
 */
export function createRecoveryReobserveRequest({
    recoveryRunId,
    diagnosisEvent,
    requestedAt,
    cooldownMs,
    healthyObservationThreshold = 1,
    reason = 'cooldown-expired'
} = {}) {
    if (typeof recoveryRunId !== 'string' || recoveryRunId.length === 0) {
        throw new TypeError('createRecoveryReobserveRequest: recoveryRunId is required');
    }
    validateDiagnosisEvent(diagnosisEvent, 'createRecoveryReobserveRequest');
    validateTimestamp(requestedAt, 'requestedAt', 'createRecoveryReobserveRequest');
    validateNonNegativeNumber(cooldownMs, 'cooldownMs', 'createRecoveryReobserveRequest');

    if (!Number.isInteger(healthyObservationThreshold) || healthyObservationThreshold < 1) {
        throw new TypeError('createRecoveryReobserveRequest: healthyObservationThreshold must be a positive integer');
    }

    return {
        schemaVersion        : 1,
        type                 : 'recovery-reobserve-request',
        recoveryRunId,
        diagnosisId          : diagnosisEvent.diagnosisId,
        recoveryClass        : diagnosisEvent.recoveryClass,
        targetIdentity       : diagnosisEvent.targetIdentity,
        requestedAt,
        cooldownMs,
        earliestObservationAt: requestedAt + cooldownMs,
        healthyObservationThreshold,
        reason
    };
}

/**
 * @summary Creates one durable recovery-run ledger entry.
 *
 * @param {Object} options
 * @param {String} options.recoveryRunId Stable recovery run id.
 * @param {Object} options.diagnosisEvent Typed diagnosis event.
 * @param {String} options.rung Recovery rung id.
 * @param {Number} options.attempt Positive attempt number for this target/rung.
 * @param {String} options.status Recovery run status.
 * @param {Number} options.startedAt Epoch milliseconds for the run/rung start.
 * @param {Number} options.updatedAt Epoch milliseconds for this ledger update.
 * @param {Number|null} [options.completedAt=null] Epoch milliseconds for terminal entries.
 * @param {Number|null} [options.backoffUntil=null] Epoch milliseconds for persisted anti-thrash.
 * @param {Object|null} [options.reobserveRequest=null] Optional reobserve request.
 * @param {Object} [options.details={}] Additional recovery-owned details.
 * @returns {Object} JSONL-ready recovery run state entry.
 */
export function createRecoveryRunStateEntry({
    recoveryRunId,
    diagnosisEvent,
    rung,
    attempt,
    status,
    startedAt,
    updatedAt,
    completedAt = null,
    backoffUntil = null,
    reobserveRequest = null,
    details = {}
} = {}) {
    if (typeof recoveryRunId !== 'string' || recoveryRunId.length === 0) {
        throw new TypeError('createRecoveryRunStateEntry: recoveryRunId is required');
    }
    validateDiagnosisEvent(diagnosisEvent, 'createRecoveryRunStateEntry');
    validateEnum(rung, RECOVERY_RUN_RUNG_IDS, 'rung', 'createRecoveryRunStateEntry');
    validateEnum(status, RECOVERY_RUN_STATUSES, 'status', 'createRecoveryRunStateEntry');
    validateTimestamp(startedAt, 'startedAt', 'createRecoveryRunStateEntry');
    validateTimestamp(updatedAt, 'updatedAt', 'createRecoveryRunStateEntry');
    validateObject(details, 'details', 'createRecoveryRunStateEntry');

    if (!Number.isInteger(attempt) || attempt < 1) {
        throw new TypeError('createRecoveryRunStateEntry: attempt must be a positive integer');
    }
    if (completedAt !== null) {
        validateTimestamp(completedAt, 'completedAt', 'createRecoveryRunStateEntry');
    }
    if (backoffUntil !== null) {
        validateTimestamp(backoffUntil, 'backoffUntil', 'createRecoveryRunStateEntry');
    }
    if (reobserveRequest !== null) {
        validateReobserveRequest(reobserveRequest, recoveryRunId, 'createRecoveryRunStateEntry');
    }

    return {
        schemaVersion : 1,
        type          : 'recovery-run-state',
        recoveryRunId,
        diagnosisId   : diagnosisEvent.diagnosisId,
        recoveryClass : diagnosisEvent.recoveryClass,
        targetIdentity: diagnosisEvent.targetIdentity,
        rung,
        attempt,
        status,
        startedAt,
        updatedAt,
        completedAt,
        wallClockMs   : completedAt === null ? null : getWallClockMs(startedAt, completedAt),
        backoffUntil,
        reobserveRequest,
        details
    };
}

/**
 * @summary Projects one recovery-run ledger entry into deterministic Memory Core graph nodes.
 *
 * @param {Object} entry JSONL-ready recovery run state entry.
 * @returns {Object[]} GraphService.upsertNode specs.
 */
export function createRecoveryRunGraphNodes(entry) {
    validateRecoveryRunStateEntry(entry, 'createRecoveryRunGraphNodes');

    const
        runNodeId        = getRecoveryRunGraphNodeId(entry.recoveryRunId),
        stateNodeId      = getRecoveryRunStateGraphNodeId(entry.recoveryRunId, entry.updatedAt),
        diagnosisNodeId  = getRecoveryDiagnosisGraphNodeId(entry.diagnosisId),
        commonProperties = createRecoveryRunGraphProperties(entry, {runNodeId, stateNodeId, diagnosisNodeId}),
        nodes            = [{
            id         : runNodeId,
            type       : RECOVERY_RUN_GRAPH_NODE_TYPES.recoveryRun,
            name       : `Recovery run ${entry.recoveryRunId}`,
            description: `Latest recovery state for ${entry.targetIdentity.kind}:${entry.targetIdentity.id}`,
            state      : entry.status,
            updatedAt  : entry.updatedAt,
            properties : {
                ...commonProperties,
                graphNodeType    : RECOVERY_RUN_GRAPH_NODE_TYPES.recoveryRun,
                latestStateNodeId: stateNodeId,
                recordType       : 'recovery-run'
            }
        }, {
            id         : stateNodeId,
            type       : RECOVERY_RUN_GRAPH_NODE_TYPES.recoveryRunState,
            name       : `Recovery run state ${entry.recoveryRunId}`,
            description: `Recovery ${entry.rung} update for ${entry.targetIdentity.kind}:${entry.targetIdentity.id}`,
            state      : entry.status,
            updatedAt  : entry.updatedAt,
            properties : {
                ...commonProperties,
                graphNodeType: RECOVERY_RUN_GRAPH_NODE_TYPES.recoveryRunState,
                recordType   : 'recovery-run-state'
            }
        }, {
            id         : diagnosisNodeId,
            type       : RECOVERY_RUN_GRAPH_NODE_TYPES.diagnosis,
            name       : `Recovery diagnosis ${entry.diagnosisId}`,
            description: `${entry.recoveryClass} diagnosis for ${entry.targetIdentity.kind}:${entry.targetIdentity.id}`,
            state      : entry.recoveryClass,
            updatedAt  : entry.updatedAt,
            properties : {
                graphNodeType         : RECOVERY_RUN_GRAPH_NODE_TYPES.diagnosis,
                recordType            : 'recovery-diagnosis',
                schemaVersion         : 1,
                recoveryRunId         : entry.recoveryRunId,
                recoveryRunNodeId     : runNodeId,
                recoveryRunStateNodeId: stateNodeId,
                diagnosisId           : entry.diagnosisId,
                recoveryClass         : entry.recoveryClass,
                targetIdentity        : entry.targetIdentity,
                targetIdentityKind    : entry.targetIdentity.kind,
                targetIdentityId      : entry.targetIdentity.id,
                sourceEntryUpdatedAt  : entry.updatedAt
            }
        }];

    if (entry.reobserveRequest) {
        const
            request       = entry.reobserveRequest,
            reobserveNode = getRecoveryReobserveGraphNodeId(entry.recoveryRunId, request.requestedAt);

        nodes.push({
            id         : reobserveNode,
            type       : RECOVERY_RUN_GRAPH_NODE_TYPES.reobserveRequest,
            name       : `Recovery reobserve ${entry.recoveryRunId}`,
            description: `Reobserve request for ${entry.targetIdentity.kind}:${entry.targetIdentity.id}`,
            state      : 'pending',
            updatedAt  : request.requestedAt,
            properties : {
                ...request,
                graphNodeType         : RECOVERY_RUN_GRAPH_NODE_TYPES.reobserveRequest,
                recordType            : 'recovery-reobserve-request',
                recoveryRunNodeId     : runNodeId,
                recoveryRunStateNodeId: stateNodeId,
                diagnosisNodeId,
                targetIdentityKind    : request.targetIdentity.kind,
                targetIdentityId      : request.targetIdentity.id
            }
        });
    }

    return nodes;
}

/**
 * @summary Publishes one recovery-run ledger entry into Memory Core graph proof nodes.
 *
 * @param {Object} entry JSONL-ready recovery run state entry.
 * @param {Object} options
 * @param {Object} options.graphService GraphService-like writer with upsertNode().
 * @returns {Promise<Object>} Publication summary.
 */
export async function publishRecoveryRunStateToGraph(entry, {graphService} = {}) {
    if (!graphService || typeof graphService.upsertNode !== 'function') {
        throw new TypeError('publishRecoveryRunStateToGraph: graphService.upsertNode is required');
    }

    const nodes = createRecoveryRunGraphNodes(entry);

    for (const node of nodes) {
        await graphService.upsertNode(node);
    }

    return {
        publishedCount: nodes.length,
        nodeIds       : nodes.map(node => node.id)
    };
}

/**
 * @summary Selects remotely-readable recovery proof records from graph node records.
 *
 * @param {Object[]} records Graph node records or upsert specs.
 * @param {Object} [filters={}]
 * @param {Object} [filters.targetIdentity] Optional target identity filter.
 * @param {String|String[]} [filters.recoveryClass] Optional recovery class filter.
 * @param {String|String[]} [filters.status] Optional status filter.
 * @param {Number} [filters.limit] Optional maximum count.
 * @returns {Object[]} Recovery-run state proof records, newest first.
 */
export function selectRecoveryRunGraphRecords(records, {
    targetIdentity = null,
    recoveryClass  = null,
    status         = null,
    limit          = null
} = {}) {
    validateArray(records, 'records', 'selectRecoveryRunGraphRecords');

    return records
        .map(normalizeRecoveryRunGraphRecord)
        .filter(record => record !== null)
        .filter(record => matchesTargetIdentity(record, targetIdentity))
        .filter(record => matchesFilter(record.recoveryClass, recoveryClass))
        .filter(record => matchesFilter(record.status, status))
        .sort((a, b) => getEntrySortTime(b) - getEntrySortTime(a))
        .slice(0, Number.isFinite(limit) && limit > 0 ? limit : undefined);
}

/**
 * @summary Prunes the recovery-run state directory to the newest retained artifacts.
 *
 * @param {Object} options
 * @param {String} options.dir Directory for per-run state files.
 * @param {Number} options.retentionLimit Maximum artifacts to retain.
 * @returns {Promise<Number>} Count of artifacts removed.
 */
export async function pruneRecoveryRunStates({dir, retentionLimit} = {}) {
    if (!dir || !Number.isFinite(retentionLimit) || retentionLimit <= 0) {
        return 0;
    }

    let names;
    try {
        names = await fs.readdir(dir);
    } catch (e) {
        if (e?.code === 'ENOENT') return 0;
        throw e;
    }

    const jsonlNames = names.filter(name => name.endsWith('.jsonl'));
    if (jsonlNames.length <= retentionLimit) {
        return 0;
    }

    const files = await Promise.all(jsonlNames.map(async name => {
        const filePath            = path.join(dir, name);
        const [stat, latestEntry] = await Promise.all([
            fs.stat(filePath),
            readLatestValidRecoveryRunState(filePath)
        ]);

        return {filePath, mtimeMs: stat.mtimeMs, latestEntry};
    }));

    // An unresolved effect is not audit history yet: it is a live, fail-safe dispatch interlock.
    // Count only ordinary/settled files against the audit retention window. A terminal append to
    // the same JSONL omits the retention class and automatically makes the artifact prunable again.
    const ordinaryFiles = files.filter(file =>
              file.latestEntry?.details?.retentionClass !== ACTIVE_RECOVERY_RUN_RETENTION_CLASS
          ),
          toRemove = ordinaryFiles
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(retentionLimit);

    await Promise.all(toRemove.map(file => fs.rm(file.filePath, {force: true})));

    return toRemove.length;
}

/**
 * @summary Appends one recovery-run ledger entry and applies optional write-side retention.
 *
 * @param {Object} entry JSONL-ready recovery run state entry.
 * @param {Object} options
 * @param {String} options.dir Directory for per-run state files.
 * @param {Number} [options.retentionLimit] Maximum artifacts to retain.
 * @param {Object|null} [options.graphService=null] Optional GraphService-like writer for synchronous proof publication.
 * @param {Object|null} [options.graphPublicationSummary=null] Mutable summary counters for publication attempts.
 * @param {Function|null} [options.onGraphPublicationError=null] Optional callback invoked after graph publication fails.
 * @param {Function|null} [options.writeLog=null] Optional logger for graph publication failures.
 * @param {Function|null} [options.isAuthorityHeld=null] Live authority oracle sampled after directory setup and
 * immediately before the source append. When omitted, the legacy unstamped append contract is preserved.
 * @param {Boolean} [options.preserveOnAuthorityLoss=false] Preserve a dispatched-effect audit after authority loss,
 * stamped `heldAtWrite: false`; non-dispatched records refuse instead.
 * @returns {Promise<String>} Written file path.
 */
export async function appendRecoveryRunState(entry, {
    dir,
    graphPublicationSummary = null,
    graphService            = null,
    onGraphPublicationError = null,
    retentionLimit,
    writeLog                = null,
    isAuthorityHeld         = null,
    preserveOnAuthorityLoss = false
} = {}) {
    if (!dir) {
        throw new TypeError('appendRecoveryRunState: dir is required');
    }
    if (!entry || typeof entry.recoveryRunId !== 'string' || entry.recoveryRunId.length === 0) {
        throw new TypeError('appendRecoveryRunState: entry.recoveryRunId is required');
    }

    await fs.mkdir(dir, {recursive: true});

    const filePath = path.join(dir, getRecoveryRunStateFileName(entry.recoveryRunId));

    // SAMPLED HERE, with no await between the sample and the write. `mkdir` above is awaited, so a
    // caller that verified authority before calling has already yielded — and the store is the only
    // place a check can sit adjacent to this append, for the same reason the overlay writer checks
    // its own commit.
    //
    // Sampled and STAMPED rather than only gating, because the record must stay truthful in both
    // directions. A recovery-run entry is owner-authoritative — it reads as "the current holder did
    // this" — so one written after a takeover has to say so on its own face, not merely be absent
    // or present.
    const heldAtWrite = typeof isAuthorityHeld === 'function' ? isAuthorityHeld() === true : null;

    // A displaced holder must not attribute an action nobody took. `preserveOnAuthorityLoss` is the
    // caller's assertion that an effect genuinely dispatched, and erasing that is strictly worse
    // than recording it late: the alternative is a restart that may have landed leaving no trace.
    if (heldAtWrite === false && !preserveOnAuthorityLoss) {
        const error = new Error('Authority moved before the recovery-run append; refusing.');

        error.reason = 'runtime-authority-lost';

        throw error;
    }

    const stamped = heldAtWrite === null ? entry : {...entry, heldAtWrite};

    await fs.appendFile(filePath, `${JSON.stringify(stamped)}\n`, 'utf8');

    if (graphService) {
        // Source and projection are ONE accepted operation. Publish the exact record that reached
        // JSONL — including its store-adjacent authority sample — rather than the caller's earlier
        // unstamped object. Re-sampling after the append would create a second authority decision;
        // publishing `entry` loses the decision the source already made.
        await publishRecoveryRunStateToGraphWithSurface(stamped, {
            graphPublicationSummary,
            graphService,
            onGraphPublicationError,
            writeLog
        });
    }

    if (Number.isFinite(retentionLimit) && retentionLimit > 0) {
        await pruneRecoveryRunStates({dir, retentionLimit});
    }

    return filePath;
}

/**
 * @summary Reads the most recent recovery-run ledger entries from the JSONL store.
 *
 * @param {Object} options
 * @param {String} options.dir Directory for per-run state files.
 * @param {Number} options.limit Maximum entries to return.
 * @returns {Promise<Object[]>} Most recent state entries, newest first.
 */
export async function readRecentRecoveryRunStates({dir, limit} = {}) {
    if (!dir || !Number.isFinite(limit) || limit <= 0) {
        return [];
    }

    let names;
    try {
        names = await fs.readdir(dir);
    } catch (e) {
        if (e?.code === 'ENOENT') return [];
        throw e;
    }

    const files = await Promise.all(names
        .filter(name => name.endsWith('.jsonl'))
        .map(async name => {
            const filePath = path.join(dir, name);
            const stat     = await fs.stat(filePath);
            return {filePath, mtimeMs: stat.mtimeMs};
        }));

    const entries = [];

    for (const file of files.sort((a, b) => b.mtimeMs - a.mtimeMs)) {
        if (entries.length >= limit) break;

        const entry = await readLatestValidRecoveryRunState(file.filePath);

        if (entry) entries.push(entry);
    }

    return entries
        .sort((a, b) => getEntrySortTime(b) - getEntrySortTime(a))
        .slice(0, limit);
}

/**
 * @summary Reads every active recovery-run interlock independently of the ordinary recency window.
 *
 * Active effect interlocks are retention-exempt until a terminal row supersedes them in the same
 * JSONL file. Reading the complete directory is deliberate: admission safety cannot depend on the
 * volume of unrelated recovery audit traffic.
 *
 * @param {Object} options
 * @param {String} options.dir Directory for per-run state files.
 * @param {String} [options.retentionClass=ACTIVE_RECOVERY_RUN_RETENTION_CLASS] Active class to read.
 * @returns {Promise<Object[]>} Active latest entries, newest first.
 */
export async function readActiveRecoveryRunStates({
    dir,
    retentionClass = ACTIVE_RECOVERY_RUN_RETENTION_CLASS
} = {}) {
    if (!dir || typeof retentionClass !== 'string' || retentionClass.length === 0) {
        return [];
    }

    let names;
    try {
        names = await fs.readdir(dir);
    } catch (error) {
        if (error?.code === 'ENOENT') return [];
        throw error;
    }

    const entries = await Promise.all(names
        .filter(name => name.endsWith('.jsonl'))
        .map(name => readLatestValidRecoveryRunState(path.join(dir, name))));

    return entries
        .filter(entry => entry?.details?.retentionClass === retentionClass)
        .sort((left, right) => getEntrySortTime(right) - getEntrySortTime(left));
}

/**
 * @summary Reads the newest valid JSONL row, falling back across a torn final append.
 * @param {String} filePath Recovery-run JSONL path.
 * @returns {Promise<Object|null>} Latest valid object row, or null.
 * @private
 */
async function readLatestValidRecoveryRunState(filePath) {
    let text;
    try {
        text = await fs.readFile(filePath, 'utf8');
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
    }

    const lines = text.split('\n');

    for (let index = lines.length - 1; index >= 0; index--) {
        const line = lines[index].trim();

        if (!line) continue;

        try {
            const entry = JSON.parse(line);

            if (entry && typeof entry === 'object' && !Array.isArray(entry)) return entry;
        } catch (error) {
            // A torn final append cannot erase the preceding durable interlock.
        }
    }

    return null;
}

function getEntrySortTime(entry) {
    if (Number.isFinite(entry.updatedAt)) return entry.updatedAt;
    if (Number.isFinite(entry.completedAt)) return entry.completedAt;
    if (Number.isFinite(entry.startedAt)) return entry.startedAt;
    return 0;
}

/**
 * @summary Projects one accepted recovery-run source record into the properties shared by its graph proof nodes.
 *
 * `heldAtWrite` is copied from the accepted source record. It is never inferred from the earlier
 * `details.heldAtAppend` sample, and absence stays explicit as `null` on the raw graph surface.
 * @param {Object} entry Accepted recovery-run source record.
 * @param {Object} ids Stable graph node ids.
 * @returns {Object} Graph properties shared by the run and state proof nodes.
 * @private
 */
function createRecoveryRunGraphProperties(entry, {runNodeId, stateNodeId, diagnosisNodeId}) {
    return {
        schemaVersion         : 1,
        graphProjectionVersion: 1,
        graphNodeType         : RECOVERY_RUN_GRAPH_NODE_TYPES.recoveryRunState,
        recordType            : entry.type,
        proofSurface          : 'recovery-run-graph-ssot',
        recoveryRunId         : entry.recoveryRunId,
        recoveryRunNodeId     : runNodeId,
        recoveryRunStateNodeId: stateNodeId,
        diagnosisId           : entry.diagnosisId,
        diagnosisNodeId,
        recoveryClass         : entry.recoveryClass,
        targetIdentity        : entry.targetIdentity,
        targetIdentityKind    : entry.targetIdentity.kind,
        targetIdentityId      : entry.targetIdentity.id,
        rung                  : entry.rung,
        attempt               : entry.attempt,
        status                : entry.status,
        startedAt             : entry.startedAt,
        updatedAt             : entry.updatedAt,
        completedAt           : entry.completedAt,
        wallClockMs           : entry.wallClockMs,
        backoffUntil          : entry.backoffUntil,
        hasReobserveRequest   : entry.reobserveRequest !== null,
        heldAtWrite           : normalizeHeldAtWrite(entry.heldAtWrite, null),
        details               : entry.details
    };
}

function matchesFilter(value, filter) {
    if (filter === null || filter === undefined) {
        return true;
    }

    return Array.isArray(filter) ? filter.includes(value) : value === filter;
}

function matchesTargetIdentity(record, targetIdentity) {
    if (targetIdentity === null || targetIdentity === undefined) {
        return true;
    }

    return record.targetIdentityKind === targetIdentity.kind && record.targetIdentityId === targetIdentity.id;
}

function normalizeRecoveryRunGraphRecord(record) {
    if (!record || typeof record !== 'object') {
        return null;
    }

    const
        properties = record.properties && typeof record.properties === 'object' ? record.properties : record,
        nodeType   = record.type || record.label || properties.graphNodeType;

    if (nodeType !== RECOVERY_RUN_GRAPH_NODE_TYPES.recoveryRunState) {
        return null;
    }

    return {
        id: record.id || properties.recoveryRunStateNodeId,
        ...properties,
        // Legacy graph nodes predate the store-adjacent sample. Surface that ignorance instead of
        // allowing an earlier `details.heldAtAppend` Boolean to masquerade as write-time authority.
        heldAtWrite: normalizeHeldAtWrite(properties.heldAtWrite, 'unknown')
    };
}

/**
 * @summary Normalizes write-time authority without coercing legacy or malformed provenance.
 * @param {*} value Candidate `heldAtWrite` value.
 * @param {Boolean|String|null} unknownValue Explicit fallback for the target surface.
 * @returns {Boolean|String|null} `true`, `false`, or the caller's unknown sentinel.
 * @private
 */
function normalizeHeldAtWrite(value, unknownValue) {
    return value === true || value === false ? value : unknownValue;
}

async function publishRecoveryRunStateToGraphWithSurface(entry, {
    graphPublicationSummary,
    graphService,
    onGraphPublicationError,
    writeLog
}) {
    incrementGraphPublicationSummary(graphPublicationSummary, 'attempted', 1);

    try {
        const publication = await publishRecoveryRunStateToGraph(entry, {graphService});
        incrementGraphPublicationSummary(graphPublicationSummary, 'published', publication.publishedCount);
    } catch (error) {
        incrementGraphPublicationSummary(graphPublicationSummary, 'failed', 1);
        recordGraphPublicationError(graphPublicationSummary, entry, error);

        onGraphPublicationError?.({entry, error});
        writeLog?.(`[RecoveryRunStateStore] Graph publication failed for ${entry.recoveryRunId}: ${error.message}`);
    }
}

function incrementGraphPublicationSummary(summary, key, amount) {
    if (!summary) {
        return;
    }

    summary[key] = (summary[key] || 0) + amount;
}

function recordGraphPublicationError(summary, entry, error) {
    if (!summary) {
        return;
    }

    summary.errors ??= [];
    summary.errors.push({
        recoveryRunId: entry.recoveryRunId,
        message      : error.message
    });
}

function validateArray(value, name, callerName) {
    if (!Array.isArray(value)) {
        throw new TypeError(`${callerName}: ${name} must be an array`);
    }
}

function validateConfidence(value, callerName) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new TypeError(`${callerName}: confidence must be a finite number between 0 and 1`);
    }
}

function validateDiagnosisEvent(value, callerName) {
    validateObject(value, 'diagnosisEvent', callerName);

    if (value.type !== 'recovery-diagnosis') {
        throw new TypeError(`${callerName}: diagnosisEvent.type must be 'recovery-diagnosis'`);
    }

    createRecoveryDiagnosisEvent(value);
}

function validateEnum(value, allowed, name, callerName) {
    if (!allowed.includes(value)) {
        throw new TypeError(`${callerName}: invalid ${name} '${value}'`);
    }
}

function validateNonNegativeNumber(value, name, callerName) {
    if (!Number.isFinite(value) || value < 0) {
        throw new TypeError(`${callerName}: ${name} must be a non-negative number`);
    }
}

function validateObject(value, name, callerName) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${callerName}: ${name} must be an object`);
    }
}

function validateReobserveRequest(value, recoveryRunId, callerName) {
    validateObject(value, 'reobserveRequest', callerName);

    if (value.type !== 'recovery-reobserve-request') {
        throw new TypeError(`${callerName}: reobserveRequest.type must be 'recovery-reobserve-request'`);
    }
    if (value.recoveryRunId !== recoveryRunId) {
        throw new TypeError(`${callerName}: reobserveRequest.recoveryRunId must match recoveryRunId`);
    }
}

function validateRecoveryRunStateEntry(value, callerName) {
    validateObject(value, 'entry', callerName);

    if (value.type !== 'recovery-run-state') {
        throw new TypeError(`${callerName}: entry.type must be 'recovery-run-state'`);
    }

    validateStringId(value.recoveryRunId, 'recoveryRunId', callerName);
    validateStringId(value.diagnosisId, 'diagnosisId', callerName);
    validateEnum(value.recoveryClass, RECOVERY_CLASSES, 'recoveryClass', callerName);
    createRecoveryTargetIdentity(value.targetIdentity);
    validateEnum(value.rung, RECOVERY_RUN_RUNG_IDS, 'rung', callerName);
    validateEnum(value.status, RECOVERY_RUN_STATUSES, 'status', callerName);
    validateTimestamp(value.startedAt, 'startedAt', callerName);
    validateTimestamp(value.updatedAt, 'updatedAt', callerName);
    validateObject(value.details, 'details', callerName);

    if (!Number.isInteger(value.attempt) || value.attempt < 1) {
        throw new TypeError(`${callerName}: attempt must be a positive integer`);
    }
    if (value.completedAt !== null) {
        validateTimestamp(value.completedAt, 'completedAt', callerName);
    }
    if (value.wallClockMs !== null && (!Number.isFinite(value.wallClockMs) || value.wallClockMs < 0)) {
        throw new TypeError(`${callerName}: wallClockMs must be null or a non-negative number`);
    }
    if (value.backoffUntil !== null) {
        validateTimestamp(value.backoffUntil, 'backoffUntil', callerName);
    }
    if (value.reobserveRequest !== null) {
        validateReobserveRequest(value.reobserveRequest, value.recoveryRunId, callerName);
    }
}

function validateStringId(value, name, callerName) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(`${callerName}: ${name} is required`);
    }
}

function validateTimestamp(value, name, callerName) {
    if (!Number.isFinite(value)) {
        throw new TypeError(`${callerName}: ${name} must be a finite number`);
    }
}
