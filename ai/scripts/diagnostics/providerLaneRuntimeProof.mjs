import {Command}                      from 'commander';
import {execFile, spawn}              from 'node:child_process';
import {createHash, randomBytes}      from 'node:crypto';
import {readFile, realpath, stat}     from 'node:fs/promises';
import path                           from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {
    PROVIDER_LANE_ELECTION_REPORT_SCHEMA_VERSION,
    validateProviderLaneElectionReport
} from '../benchmark/provider-lane-election.mjs';

const
    __filename   = fileURLToPath(import.meta.url),
    __dirname    = path.dirname(__filename),
    PROJECT_ROOT = path.resolve(__dirname, '../../..'),

    BASE_COMPOSE_FILE = 'ai/deploy/docker-compose.yml',
    LANE_COMPOSE_FILE = 'ai/deploy/docker-compose.provider-lanes.yml',

    REVISION_PATTERN       = /^[0-9a-f]{40}$/,
    DIGEST_PATTERN         = /^sha256:[0-9a-f]{64}$/,

    PROVIDER_SERVICES = Object.freeze({chat: 'chat-model', embedding: 'embedding-model'}),
    OBSERVER_SERVICE  = 'provider-lane-proof-observer',

    STARTUP_TIMEOUT_MS       = 45 * 60 * 1000,
    HEALTH_TIMEOUT_MS        = STARTUP_TIMEOUT_MS,
    COMMAND_TIMEOUT_MS       = 10 * 60 * 1000,
    ADMISSION_TIMEOUT_MS     = 20 * 1000,
    IDLE_TIMEOUT_MS          = 30 * 1000,
    CALLER_SETTLE_TIMEOUT_MS = 10 * 1000,
    COMMAND_SETTLE_TIMEOUT_MS = 10 * 1000,
    CLEANUP_VERIFY_ATTEMPTS  = 3,
    CLEANUP_VERIFY_DELAY_MS  = 250,
    POLL_INTERVAL_MS         = 100,
    REQUIRED_IDLE_SAMPLES    = 2,
    EMBEDDING_PROBE_INPUTS   = 4,
    EMBEDDING_PROBE_REPEATS  = 24,
    SLOT_OBSERVATION_BURST   = 2;

export const PROVIDER_LANE_RUNTIME_PROOF_SCHEMA_VERSION = 'provider-lane-runtime-proof.v1';

/**
 * @module ai/scripts/diagnostics/providerLaneRuntimeProof
 * @summary Binds one authoritative provider-lane election report to a fresh canonical runtime.
 *
 * The actor consumes the complete selected `provider-lane-composition.v1` receipt embedded by the
 * election report, validates it with the canonical composition authority, and creates one unique local
 * Compose project from Neo's canonical base and provider-lane files. It cannot accept an endpoint,
 * credential, Compose file, Docker project, or external-plane coordinate from its caller.
 *
 * Runtime proof is deliberately narrower than election: it observes exact container/image/model
 * identities, witnesses an admitted embedding request through `/slots`, disconnects the concrete
 * project-owned observer caller, waits for stable all-slot idle, and restarts each lane while proving the
 * opposite lane did not move. Cleanup removes only the project minted by this actor.
 *
 * @see https://github.com/neomjs/neo/issues/17022
 * @see ai/scripts/diagnostics/providerLaneComposition.mjs
 */

class RuntimeProofError extends Error {
    constructor(code, verdict='FAIL') {
        super(code);
        this.code    = code;
        this.verdict = verdict
    }
}

function stableSerialize(value) {
    const normalize = item => {
        if (Array.isArray(item)) return item.map(normalize);
        if (item && typeof item === 'object') {
            return Object.fromEntries(Object.keys(item).sort().map(key => [key, normalize(item[key])]))
        }
        return item
    };

    return JSON.stringify(normalize(value))
}

/**
 * @summary Returns the stable semantic digest used to bind the embedded selected composition.
 * @param {*} value JSON-compatible value.
 * @returns {String}
 */
export function digestProviderLaneRuntimeValue(value) {
    return `sha256:${createHash('sha256').update(stableSerialize(value)).digest('hex')}`
}

function sameValue(left, right) {
    return stableSerialize(left) === stableSerialize(right)
}

function hasExactKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

    const actual = Object.keys(value).sort();
    return sameValue(actual, [...expected].sort())
}

function safeProjectNonce(value) {
    return typeof value === 'string' && /^[a-f0-9]{16}$/.test(value) ? value : null
}

function localDockerSocketPath(value) {
    assertRuntime(typeof value === 'string' && value.length > 0,
        'DOCKER_ENDPOINT_UNAVAILABLE');

    let parsed;

    try {
        parsed = new URL(value)
    } catch {
        parsed = null
    }

    assertRuntime(parsed?.protocol === 'unix:' && !parsed.hostname && !parsed.username && !parsed.password &&
        !parsed.search && !parsed.hash && parsed.pathname.startsWith('/'),
    'REMOTE_DOCKER_ENGINE_REFUSED');

    return fileURLToPath(new URL(`file://${parsed.pathname}`))
}

function errorRow(code, pathName) {
    return {code, path: pathName}
}

/**
 * @summary Validates the closed elected-receipt handoff before constructing any Docker capability.
 *
 * The election report must be authoritative and `ELECTED`, must carry the complete selected
 * composition receipt plus its canonical digest, and must expose the exact deployment inputs from
 * that same receipt. A projected subset or opaque digest cannot recover role, endpoint, or model
 * identity and is therefore refused.
 *
 * @param {*} report Candidate authoritative election report.
 * @returns {{valid: Boolean, errors: Object[], report: Object|null, selectedReceipt: Object|null}}
 */
export function validateProviderLaneRuntimeProofInput(report) {
    try {
        const validated = validateProviderLaneElectionReport(report);

        if (validated.schemaVersion !== PROVIDER_LANE_ELECTION_REPORT_SCHEMA_VERSION) {
            throw new TypeError('provider-lane election schema drift')
        }

        return {
            valid          : true,
            errors         : [],
            report         : validated,
            selectedReceipt: validated.selectedReceipt
        }
    } catch {
        return {
            valid          : false,
            errors         : [errorRow('election-report-invalid', 'report')],
            report         : null,
            selectedReceipt: null
        }
    }
}

function boundedErrorReceipt({code, verdict, report, projectName, partial, cleanupState}) {
    return {
        schemaVersion: PROVIDER_LANE_RUNTIME_PROOF_SCHEMA_VERSION,
        verdict,
        source       : {
            head             : REVISION_PATTERN.test(report?.repositoryHead || '') ? report.repositoryHead : null,
            compositionDigest: DIGEST_PATTERN.test(report?.selectedReceiptDigest || '')
                ? report.selectedReceiptDigest
                : null
        },
        project: {
            name           : projectName || null,
            composeFiles   : [BASE_COMPOSE_FILE, LANE_COMPOSE_FILE],
            dockerAuthority: null,
            observer       : partial?.observer || null
        },
        lanes           : partial?.lanes || null,
        containment     : partial?.containment || null,
        restartIsolation: partial?.restartIsolation || null,
        cleanup         : {state: cleanupState},
        errors          : [{code}]
    }
}

function assertRuntime(condition, code, verdict='FAIL') {
    if (!condition) throw new RuntimeProofError(code, verdict)
}

function parseJson(text, code) {
    try {
        return JSON.parse(String(text))
    } catch {
        throw new RuntimeProofError(code, 'NOT_PROVEN')
    }
}

function parseCurlReceipt(output, code) {
    const marker = '\nNEO_PROVIDER_REMOTE_IP:';
    const text   = String(output || '');
    const index  = text.lastIndexOf(marker);

    assertRuntime(index >= 0, `${code}_REMOTE_IP_MISSING`, 'NOT_PROVEN');

    const body     = text.slice(0, index),
          remoteIp = text.slice(index + marker.length).trim();

    assertRuntime(remoteIp.length > 0 && remoteIp.length < 128,
        `${code}_REMOTE_IP_INVALID`, 'NOT_PROVEN');

    return {body: parseJson(body, `${code}_JSON_INVALID`), remoteIp}
}

function projectNetworks(row) {
    return Object.entries(row?.NetworkSettings?.Networks || {})
        .map(([name, network]) => ({
            id: network?.NetworkID,
            ip: network?.IPAddress,
            name
        }))
        .filter(network => network.id && network.ip)
        .sort((left, right) => left.name.localeCompare(right.name))
}

function projectStoppedNetworks(row) {
    return Object.entries(row?.NetworkSettings?.Networks || {})
        .map(([name, network]) => ({
            id: network?.NetworkID,
            name
        }))
        .filter(network => network.id && network.name)
        .sort((left, right) => left.name.localeCompare(right.name))
}

function stoppedNetworkIdentity(networks) {
    return Array.isArray(networks)
        ? networks.map(({id, name}) => ({id, name}))
        : null
}

function projectContainerIdentity(container) {
    return {
        containerId    : container.containerId,
        configuredImage: container.configuredImage,
        health         : container.health,
        imageId        : container.imageId,
        networks       : container.networks,
        projectLabel   : container.projectLabel,
        restartCount   : container.restartCount,
        serviceLabel   : container.serviceLabel,
        startedAt      : container.startedAt
    }
}

function projectSlotTopology(slots) {
    return Array.isArray(slots)
        ? slots.map(({id, nCtx}) => ({id, nCtx}))
        : null
}

function projectLaneIdentity(lane) {
    return {
        container   : projectContainerIdentity(lane.container),
        endpoint    : lane.endpoint,
        model       : lane.model,
        slotTopology: projectSlotTopology(lane.slots)
    }
}

function projectStoppedContainer(container) {
    return {
        configuredImage: container.configuredImage,
        containerId    : container.containerId,
        imageId        : container.imageId,
        networks       : container.networks,
        projectLabel   : container.projectLabel,
        restartCount   : container.restartCount,
        serviceLabel   : container.serviceLabel,
        startedAt      : container.startedAt,
        state          : container.state
    }
}

function unchangedIdentity(before, after) {
    return sameValue(projectLaneIdentity(before), projectLaneIdentity(after))
}

function restartedContainer(before, after) {
    return before.container.containerId === after.container.containerId &&
        before.container.configuredImage === after.container.configuredImage &&
        before.container.imageId === after.container.imageId &&
        sameValue(before.container.networks, after.container.networks) &&
        before.container.projectLabel === after.container.projectLabel &&
        before.container.serviceLabel === after.container.serviceLabel &&
        Number.isInteger(before.container.restartCount) &&
        after.container.restartCount === before.container.restartCount &&
        Date.parse(after.container.startedAt) > Date.parse(before.container.startedAt)
}

function restartedLaneIdentity(before, after) {
    return restartedContainer(before, after) && sameValue(before.endpoint, after.endpoint) &&
        sameValue(before.model, after.model) && sameValue(before.slotTopology, after.slotTopology)
}

function slotsProjection(rows, lane) {
    assertRuntime(Array.isArray(rows), 'SLOTS_NOT_ARRAY', 'NOT_PROVEN');
    assertRuntime(rows.length === lane.parallelSlots, 'SLOT_COUNT_MISMATCH', 'NOT_PROVEN');

    const projected = rows.map(row => ({
        id          : row?.[lane.endpoints.slotContext.slotIdField],
        idTask      : row?.id_task ?? null,
        isProcessing: row?.[lane.endpoints.slotContext.processingField],
        nCtx        : row?.[lane.endpoints.slotContext.contextTokensField]
    })).sort((left, right) => left.id - right.id);

    assertRuntime(projected.every(row => Number.isInteger(row.id) &&
        (row.idTask === null || Number.isInteger(row.idTask)) &&
        typeof row.isProcessing === 'boolean' && Number.isInteger(row.nCtx) &&
        row.nCtx >= lane.contextTokensPerSlotRequired), 'SLOT_CONTRACT_MISMATCH', 'NOT_PROVEN');
    assertRuntime(new Set(projected.map(row => row.id)).size === projected.length,
        'SLOT_ID_DUPLICATE', 'NOT_PROVEN');

    return projected
}

function allSlotsIdle(rows) {
    return rows.length > 0 && rows.every(row => row.isProcessing === false)
}

function acceptedSlotIds(rows, expectedIds) {
    return sameValue(rows.map(row => row.id).sort((a, b) => a - b), [...expectedIds].sort((a, b) => a - b))
}

function isObservedContainer(value) {
    return hasExactKeys(value, [
        'configuredImage',
        'containerId',
        'health',
        'imageId',
        'networks',
        'projectLabel',
        'restartCount',
        'serviceLabel',
        'startedAt'
    ]) && /^[a-f0-9]{64}$/.test(value.containerId || '') &&
        typeof value.configuredImage === 'string' && /@sha256:[a-f0-9]{64}$/.test(value.configuredImage) &&
        value.health === 'healthy' && DIGEST_PATTERN.test(value.imageId) &&
        Array.isArray(value.networks) && value.networks.length > 0 &&
        value.networks.every(network => hasExactKeys(network, ['id', 'ip', 'name']) &&
            typeof network.id === 'string' && network.id.length > 0 &&
            typeof network.ip === 'string' && network.ip.length > 0 &&
            typeof network.name === 'string' && network.name.length > 0) &&
        typeof value.projectLabel === 'string' && value.projectLabel.length > 0 &&
        Number.isInteger(value.restartCount) && value.restartCount >= 0 &&
        typeof value.serviceLabel === 'string' && value.serviceLabel.length > 0 &&
        Number.isFinite(Date.parse(value.startedAt))
}

function isObservedObserver(value) {
    return hasExactKeys(value, [
        'configuredImage',
        'containerId',
        'imageId',
        'networks',
        'projectLabel',
        'serviceLabel',
        'startedAt',
        'state'
    ]) && /^[a-f0-9]{64}$/.test(value.containerId || '') &&
        typeof value.configuredImage === 'string' && /@sha256:[a-f0-9]{64}$/.test(value.configuredImage) &&
        DIGEST_PATTERN.test(value.imageId) && value.state === 'running' &&
        Array.isArray(value.networks) && value.networks.length === 1 &&
        value.networks.every(network => hasExactKeys(network, ['id', 'ip', 'name']) &&
            typeof network.id === 'string' && network.id.length > 0 &&
            typeof network.ip === 'string' && network.ip.length > 0 &&
            typeof network.name === 'string' && network.name.length > 0) &&
        typeof value.projectLabel === 'string' && value.projectLabel.length > 0 &&
        value.serviceLabel === OBSERVER_SERVICE && Number.isFinite(Date.parse(value.startedAt))
}

function isStoppedContainer(value, before) {
    return hasExactKeys(value, [
        'configuredImage',
        'containerId',
        'imageId',
        'networks',
        'projectLabel',
        'restartCount',
        'serviceLabel',
        'startedAt',
        'state'
    ]) && value.state === 'exited' && before &&
        value.configuredImage === before.container.configuredImage &&
        value.containerId === before.container.containerId && value.imageId === before.container.imageId &&
        sameValue(value.networks, stoppedNetworkIdentity(before.container.networks)) &&
        value.networks.every(network => hasExactKeys(network, ['id', 'name']) &&
            typeof network.id === 'string' && network.id.length > 0 &&
            typeof network.name === 'string' && network.name.length > 0) &&
        value.projectLabel === before.container.projectLabel &&
        value.restartCount === before.container.restartCount && value.serviceLabel === before.container.serviceLabel &&
        value.startedAt === before.container.startedAt
}

function isObservedLane(value, {embedding=false} = {}) {
    const expectedKeys = embedding ? ['container', 'endpoint', 'model', 'slots'] : ['container', 'endpoint', 'model'];

    return hasExactKeys(value, expectedKeys) && isObservedContainer(value.container) &&
        hasExactKeys(value.endpoint, ['remoteIp', 'url']) && typeof value.endpoint.remoteIp === 'string' &&
        value.container.networks.some(network => network.ip === value.endpoint.remoteIp) &&
        typeof value.endpoint.url === 'string' && value.endpoint.url.startsWith('http://') &&
        (embedding
            ? hasExactKeys(value.model, ['id']) && typeof value.model.id === 'string' &&
                Array.isArray(value.slots) && value.slots.length > 0 &&
                value.slots.every(row => hasExactKeys(row, ['id', 'idTask', 'isProcessing', 'nCtx']) &&
                    Number.isInteger(row.id) && (row.idTask === null || Number.isInteger(row.idTask)) &&
                    row.isProcessing === false && Number.isInteger(row.nCtx) && row.nCtx > 0)
            : hasExactKeys(value.model, ['contextTokens', 'id']) && typeof value.model.id === 'string' &&
                Number.isInteger(value.model.contextTokens) && value.model.contextTokens > 0)
}

function isProjectedLaneIdentity(value, {embedding=false} = {}) {
    return hasExactKeys(value, ['container', 'endpoint', 'model', 'slotTopology']) &&
        isObservedContainer(value.container) &&
        hasExactKeys(value.endpoint, ['remoteIp', 'url']) &&
        typeof value.endpoint.remoteIp === 'string' && typeof value.endpoint.url === 'string' &&
        value.container.networks.some(network => network.ip === value.endpoint.remoteIp) &&
        (embedding
            ? hasExactKeys(value.model, ['id']) && typeof value.model.id === 'string' &&
                Array.isArray(value.slotTopology) && value.slotTopology.length > 0 &&
                value.slotTopology.every(row => hasExactKeys(row, ['id', 'nCtx']) &&
                    Number.isInteger(row.id) && Number.isInteger(row.nCtx) && row.nCtx > 0)
            : hasExactKeys(value.model, ['contextTokens', 'id']) && typeof value.model.id === 'string' &&
                Number.isInteger(value.model.contextTokens) && value.model.contextTokens > 0 &&
                value.slotTopology === null)
}

function isSlotSample(value, expectedRemoteIp) {
    return hasExactKeys(value, ['atMs', 'remoteIp', 'slots']) &&
        Number.isFinite(value.atMs) && value.remoteIp === expectedRemoteIp &&
        Array.isArray(value.slots) && value.slots.length > 0 &&
        value.slots.every(row => hasExactKeys(row, ['id', 'idTask', 'isProcessing', 'nCtx']) &&
            Number.isInteger(row.id) && (row.idTask === null || Number.isInteger(row.idTask)) &&
            typeof row.isProcessing === 'boolean' && Number.isInteger(row.nCtx) && row.nCtx > 0)
}

function observedLaneMatchesComposition(observed, declared, {embedding=false} = {}) {
    if (!isObservedLane(observed, {embedding}) || !declared) return false;

    const expectedImage = `${declared.image?.reference}@${declared.image?.digest}`,
          expectedUrl   = embedding ? declared.endpoints?.models?.url : declared.endpoints?.modelContext?.url;

    if (observed.container.configuredImage !== expectedImage ||
        observed.container.serviceLabel !== declared.serviceKey ||
        observed.endpoint.url !== expectedUrl || observed.model.id !== declared.model?.id) {
        return false
    }

    if (!embedding) return observed.model.contextTokens === declared.totalContextTokens;

    const expectedPerSlot = declared.totalContextTokens / declared.parallelSlots;

    return Number.isInteger(expectedPerSlot) && observed.slots.length === declared.parallelSlots &&
        observed.slots.every(slot => slot.nCtx === expectedPerSlot)
}

/**
 * @summary Refuses PASS receipts with any missing arm, identity, cleanup, or terminal evidence.
 * @param {*} receipt Candidate runtime-proof receipt.
 * @param {Object} [options]
 * @param {'PASS'|'PENDING'} [options.cleanupState='PASS'] Expected cleanup phase.
 * @param {Object|null} [options.report=null] Authoritative input used to bind source and declared roles.
 * @returns {{valid: Boolean, errors: Object[]}}
 */
export function validateProviderLaneRuntimeProofReceipt(receipt, {cleanupState='PASS', report=null} = {}) {
    const errors = [];
    const fail   = (condition, code, pathName) => {
        if (!condition) errors.push(errorRow(code, pathName))
    };

    const inputValidation = validateProviderLaneRuntimeProofInput(report);

    fail(inputValidation.valid, 'report-authority', 'report');
    fail(hasExactKeys(receipt, [
        'cleanup',
        'containment',
        'errors',
        'lanes',
        'project',
        'restartIsolation',
        'schemaVersion',
        'source',
        'verdict'
    ]), 'receipt-field-set', '$');
    fail(receipt?.schemaVersion === PROVIDER_LANE_RUNTIME_PROOF_SCHEMA_VERSION,
        'receipt-schema', 'schemaVersion');
    fail(receipt?.verdict === 'PASS', 'receipt-verdict', 'verdict');
    fail(sameValue(receipt?.errors, []), 'receipt-errors', 'errors');
    fail(hasExactKeys(receipt?.source, ['compositionDigest', 'head']) &&
        REVISION_PATTERN.test(receipt?.source?.head || '') &&
        DIGEST_PATTERN.test(receipt?.source?.compositionDigest || ''), 'source-binding', 'source');
    fail(hasExactKeys(receipt?.project, ['composeFiles', 'dockerAuthority', 'name', 'observer']) &&
        /^neo-provider-proof-\d+-[a-f0-9]{16}$/.test(receipt?.project?.name || '') &&
        sameValue(receipt?.project?.composeFiles, [BASE_COMPOSE_FILE, LANE_COMPOSE_FILE]) &&
        hasExactKeys(receipt?.project?.dockerAuthority, ['contextName', 'endpointClass', 'socketPathDigest']) &&
        typeof receipt?.project?.dockerAuthority?.contextName === 'string' &&
        receipt.project.dockerAuthority.contextName.length > 0 &&
        receipt?.project?.dockerAuthority?.endpointClass === 'local-unix' &&
        DIGEST_PATTERN.test(receipt?.project?.dockerAuthority?.socketPathDigest || '') &&
        isObservedObserver(receipt?.project?.observer),
    'project-binding', 'project');
    fail(hasExactKeys(receipt?.lanes, ['chat', 'declaredRoles', 'embedding']), 'lane-field-set', 'lanes');
    fail(isObservedLane(receipt?.lanes?.chat), 'chat-runtime-evidence', 'lanes.chat');
    fail(isObservedLane(receipt?.lanes?.embedding, {embedding: true}),
        'embedding-runtime-evidence', 'lanes.embedding');
    fail(receipt?.project?.observer?.configuredImage === receipt?.lanes?.embedding?.container?.configuredImage &&
        receipt?.project?.observer?.imageId === receipt?.lanes?.embedding?.container?.imageId &&
        receipt?.project?.observer?.projectLabel === receipt?.project?.name &&
        receipt?.project?.observer?.networks?.some(observerNetwork =>
            receipt?.lanes?.embedding?.container?.networks?.some(providerNetwork =>
                observerNetwork.id === providerNetwork.id && observerNetwork.name === providerNetwork.name)),
    'observer-runtime-binding', 'project.observer');
    fail(receipt?.lanes?.declaredRoles && typeof receipt.lanes.declaredRoles === 'object' &&
        !Array.isArray(receipt.lanes.declaredRoles), 'role-map-evidence', 'lanes.declaredRoles');
    const runtimeContainers = [
        receipt?.project?.observer,
        receipt?.lanes?.chat?.container,
        receipt?.lanes?.embedding?.container
    ],
          runtimeContainerIds = runtimeContainers.map(container => container?.containerId),
          commonNetworks = receipt?.project?.observer?.networks?.filter(observerNetwork =>
              receipt?.lanes?.chat?.container?.networks?.some(chatNetwork =>
                  observerNetwork.id === chatNetwork.id && observerNetwork.name === chatNetwork.name) &&
              receipt?.lanes?.embedding?.container?.networks?.some(embeddingNetwork =>
                  observerNetwork.id === embeddingNetwork.id && observerNetwork.name === embeddingNetwork.name));
    fail(runtimeContainers.every(container => container?.projectLabel === receipt?.project?.name) &&
        new Set(runtimeContainerIds).size === runtimeContainerIds.length &&
        runtimeContainerIds.every(value => /^[a-f0-9]{64}$/.test(value || '')) &&
        commonNetworks?.length === 1,
    'runtime-project-identity', 'project');
    if (inputValidation.valid) {
        const selectedReceipt = inputValidation.selectedReceipt;

        fail(receipt?.source?.head === report.repositoryHead &&
            receipt?.source?.compositionDigest === report.selectedReceiptDigest,
        'source-report-drift', 'source');
        fail(sameValue(receipt?.lanes?.declaredRoles, selectedReceipt.roles),
            'declared-role-drift', 'lanes.declaredRoles');
        fail(observedLaneMatchesComposition(receipt?.lanes?.chat, selectedReceipt.lanes.chat),
            'chat-selected-composition-drift', 'lanes.chat');
        fail(observedLaneMatchesComposition(receipt?.lanes?.embedding, selectedReceipt.lanes.embedding, {
            embedding: true
        }), 'embedding-selected-composition-drift', 'lanes.embedding')
    }

    const containment  = receipt?.containment,
          expectedPeer = receipt?.lanes?.embedding?.endpoint?.remoteIp;
    fail(hasExactKeys(containment, [
        'admission',
        'disconnect',
        'idle',
        'payload',
        'postControl',
        'slotSequence',
        'state'
    ]), 'containment-field-set', 'containment');
    fail(containment?.state === 'PASS', 'containment-state', 'containment.state');
    fail(hasExactKeys(containment?.payload, ['byteLength', 'digest', 'inputCount', 'shape']) &&
        DIGEST_PATTERN.test(containment?.payload?.digest || '') &&
        Number.isInteger(containment?.payload?.byteLength) && containment.payload.byteLength > 0 &&
        containment?.payload?.inputCount === EMBEDDING_PROBE_INPUTS &&
        containment?.payload?.shape === 'bounded-string-array',
    'payload-evidence', 'containment.payload');
    fail(hasExactKeys(containment?.admission, [
        'admittedAtMs', 'idTask', 'observed', 'revalidatedAtMs', 'revalidatedIdTask',
        'revalidatedSlotId', 'slotId'
    ]) &&
        containment?.admission?.observed === true && Number.isInteger(containment?.admission?.slotId) &&
        Number.isInteger(containment?.admission?.idTask) &&
        Number.isFinite(containment?.admission?.admittedAtMs) &&
        Number.isInteger(containment?.admission?.revalidatedIdTask) &&
        Number.isInteger(containment?.admission?.revalidatedSlotId) &&
        Number.isFinite(containment?.admission?.revalidatedAtMs) &&
        containment.admission.revalidatedAtMs > containment.admission.admittedAtMs,
    'admission-evidence', 'containment.admission');
    fail(hasExactKeys(containment?.disconnect, [
        'atMs',
        'callerPid',
        'callerRemoteIp',
        'callerSettled',
        'confirmedAtMs',
        'exitCode',
        'method',
        'preKillProcessingCount',
        'preKillRemoteIp',
        'signal',
        'socketCount',
        'startTime'
    ]) && containment?.disconnect?.method === 'in-container-sigterm' &&
        Number.isInteger(containment?.disconnect?.callerPid) && containment.disconnect.callerPid > 0 &&
        containment?.disconnect?.callerRemoteIp === expectedPeer &&
        containment?.disconnect?.callerSettled === true && containment?.disconnect?.exitCode === 143 &&
        Number.isInteger(containment?.disconnect?.preKillProcessingCount) &&
        containment.disconnect.preKillProcessingCount > 0 &&
        containment.disconnect.preKillProcessingCount <= receipt?.lanes?.embedding?.slots?.length &&
        containment?.disconnect?.preKillRemoteIp === expectedPeer &&
        containment?.disconnect?.signal === null && Number.isInteger(containment?.disconnect?.socketCount) &&
        containment.disconnect.socketCount > 0 && /^\d+$/.test(containment?.disconnect?.startTime || '') &&
        Number.isFinite(containment?.disconnect?.atMs) &&
        Number.isFinite(containment?.disconnect?.confirmedAtMs) &&
        containment.disconnect.atMs >= containment?.admission?.revalidatedAtMs &&
        containment.disconnect.confirmedAtMs >= containment.disconnect.atMs,
    'disconnect-evidence', 'containment.disconnect');
    fail(hasExactKeys(containment?.idle, [
        'boundMs',
        'consecutiveIdleSamples',
        'firstAllIdleAtMs',
        'settleMs',
        'stableAllIdleAtMs'
    ]) && Number.isFinite(containment?.idle?.firstAllIdleAtMs) &&
        Number.isFinite(containment?.idle?.stableAllIdleAtMs) &&
        containment.idle.firstAllIdleAtMs >= containment?.disconnect?.confirmedAtMs &&
        containment.idle.stableAllIdleAtMs >= containment.idle.firstAllIdleAtMs &&
        containment?.idle?.consecutiveIdleSamples >= REQUIRED_IDLE_SAMPLES &&
        Number.isInteger(containment?.idle?.boundMs) && containment.idle.boundMs > 0 &&
        containment?.idle?.settleMs ===
            containment?.idle?.stableAllIdleAtMs - containment?.disconnect?.confirmedAtMs &&
        containment.idle.settleMs >= 0 && containment.idle.settleMs <= containment.idle.boundMs,
    'idle-evidence', 'containment.idle');

    const samples              = Array.isArray(containment?.slotSequence) ? containment.slotSequence : [],
          baselineSlotTopology = projectSlotTopology(receipt?.lanes?.embedding?.slots);
    fail(samples.length >= 3 && samples.every((sample, index) =>
        isSlotSample(sample, expectedPeer) && (index === 0 || sample.atMs >= samples[index - 1].atMs) &&
        sameValue(projectSlotTopology(sample.slots), baselineSlotTopology)),
    'slot-sequence-evidence', 'containment.slotSequence');
    const admissionSample = samples.find(sample => sample.atMs === containment?.admission?.admittedAtMs &&
        sample.slots.some(row => row.isProcessing) &&
        sample.slots.some(row => row.isProcessing && row.id === containment?.admission?.slotId &&
            row.idTask === containment?.admission?.idTask)),
          revalidationSample = samples.find(sample =>
              sample.atMs === containment?.admission?.revalidatedAtMs &&
              sample.slots.some(row => row.isProcessing) &&
              sample.slots.some(row => row.isProcessing &&
                  row.id === containment?.admission?.revalidatedSlotId &&
                  row.idTask === containment?.admission?.revalidatedIdTask)),
          stableIdleIndex = samples.findIndex(sample =>
              sample.atMs === containment?.idle?.stableAllIdleAtMs && allSlotsIdle(sample.slots));
    fail(Boolean(admissionSample), 'admission-sequence-mismatch', 'containment.slotSequence');
    fail(Boolean(revalidationSample), 'admission-revalidation-mismatch', 'containment.slotSequence');
    fail(stableIdleIndex >= REQUIRED_IDLE_SAMPLES - 1 &&
        samples.slice(stableIdleIndex - REQUIRED_IDLE_SAMPLES + 1, stableIdleIndex + 1)
            .every(sample => sample.atMs >= containment?.disconnect?.confirmedAtMs && allSlotsIdle(sample.slots)),
    'stable-idle-sequence-mismatch', 'containment.slotSequence');
    fail(hasExactKeys(containment?.postControl, ['remoteIp', 'state']) &&
        containment?.postControl?.state === 'PASS' && containment?.postControl?.remoteIp === expectedPeer,
    'post-control-evidence', 'containment.postControl');

    const isolation = receipt?.restartIsolation;
    fail(hasExactKeys(isolation, ['chat', 'embedding', 'state']) && isolation?.state === 'PASS',
        'restart-field-set', 'restartIsolation');
    const chatArm           = isolation?.chat,
          embeddingArm      = isolation?.embedding,
          baselineChat      = receipt?.lanes?.chat ? projectLaneIdentity(receipt.lanes.chat) : null,
          baselineEmbedding = receipt?.lanes?.embedding ? projectLaneIdentity(receipt.lanes.embedding) : null;
    fail(hasExactKeys(chatArm, ['after', 'before', 'during']) &&
        isProjectedLaneIdentity(chatArm?.before) && sameValue(chatArm.before, baselineChat) &&
        hasExactKeys(chatArm?.during, ['opposite', 'target']) &&
        isStoppedContainer(chatArm?.during?.target, chatArm?.before) &&
        isProjectedLaneIdentity(chatArm?.during?.opposite, {embedding: true}) &&
        sameValue(chatArm.during.opposite, baselineEmbedding) &&
        hasExactKeys(chatArm?.after, ['opposite', 'target']) &&
        isProjectedLaneIdentity(chatArm?.after?.target) &&
        isProjectedLaneIdentity(chatArm?.after?.opposite, {embedding: true}) &&
        restartedLaneIdentity(chatArm.before, chatArm.after.target) &&
        sameValue(chatArm.after.opposite, baselineEmbedding),
    'restart-arm-evidence', 'restartIsolation.chat');
    fail(hasExactKeys(embeddingArm, ['after', 'before', 'during']) &&
        isProjectedLaneIdentity(embeddingArm?.before, {embedding: true}) &&
        sameValue(embeddingArm.before, chatArm?.after?.opposite) &&
        hasExactKeys(embeddingArm?.during, ['opposite', 'target']) &&
        isStoppedContainer(embeddingArm?.during?.target, embeddingArm?.before) &&
        isProjectedLaneIdentity(embeddingArm?.during?.opposite) &&
        sameValue(embeddingArm.during.opposite, chatArm?.after?.target) &&
        hasExactKeys(embeddingArm?.after, ['opposite', 'target']) &&
        isProjectedLaneIdentity(embeddingArm?.after?.target, {embedding: true}) &&
        isProjectedLaneIdentity(embeddingArm?.after?.opposite) &&
        restartedLaneIdentity(embeddingArm.before, embeddingArm.after.target) &&
        sameValue(embeddingArm.after.opposite, chatArm?.after?.target),
    'restart-arm-evidence', 'restartIsolation.embedding');

    fail(hasExactKeys(receipt?.cleanup, ['state']) && receipt?.cleanup?.state === cleanupState,
        'cleanup-evidence', 'cleanup');

    return {valid: errors.length === 0, errors}
}

/**
 * @summary Runs the exact selected composition through the producer-owned disposable actor.
 * @param {Object} report Authoritative provider-lane election report.
 * @param {Object} [dependencies] Low-level test seams only.
 * @returns {Promise<Object>} Secret-free runtime proof receipt.
 */
export async function proveProviderLaneRuntime(report, dependencies = {}) {
    const input = validateProviderLaneRuntimeProofInput(report);

    if (!input.valid) {
        return boundedErrorReceipt({
            code        : input.errors[0]?.code || 'INPUT_INVALID',
            verdict     : 'FAIL',
            report      : null,
            projectName : null,
            partial     : null,
            cleanupState: 'NOT_STARTED'
        })
    }

    let actor;
    let outcome;
    const validatedReport = input.report;

    try {
        actor = new ProviderLaneRuntimeProofActor({
            ...dependencies,
            report : validatedReport,
            receipt: input.selectedReceipt
        });
        outcome = await actor.run()
    } catch (error) {
        outcome = boundedErrorReceipt({
            code        : error?.code || 'RUNTIME_PROOF_FAILED',
            verdict     : error?.verdict === 'NOT_PROVEN' ? 'NOT_PROVEN' : 'FAIL',
            report      : validatedReport,
            projectName : actor?.projectName,
            partial     : actor?.partial,
            cleanupState: actor ? 'PENDING' : 'NOT_STARTED'
        })
    }

    try {
        await actor?.close()
    } catch {
        return boundedErrorReceipt({
            code        : 'CLEANUP_UNRESOLVED',
            verdict     : 'FAIL',
            report      : validatedReport,
            projectName : actor?.projectName,
            partial     : actor?.partial,
            cleanupState: 'FAIL'
        })
    }

    if (actor?.interrupted) {
        return boundedErrorReceipt({
            code        : actor.interrupted.code,
            verdict     : 'FAIL',
            report      : validatedReport,
            projectName : actor.projectName,
            partial     : actor.partial,
            cleanupState: 'PASS'
        })
    }

    const finalReceipt = {
        ...outcome,
        cleanup: {state: actor ? 'PASS' : outcome.cleanup.state}
    };

    if (finalReceipt.verdict === 'PASS' && !validateProviderLaneRuntimeProofReceipt(finalReceipt, {
        report: validatedReport
    }).valid) {
        return boundedErrorReceipt({
            code        : 'RUNTIME_RECEIPT_INCOMPLETE',
            verdict     : 'FAIL',
            report      : validatedReport,
            projectName : actor?.projectName,
            partial     : actor?.partial,
            cleanupState: actor ? 'PASS' : finalReceipt.cleanup.state
        })
    }

    return finalReceipt
}

/**
 * @summary Side-effect owner for one local canonical provider-lane runtime proof.
 *
 * Constructor dependencies are low-level process/time primitives. The actor itself derives every
 * service, endpoint, project, identity comparison, and verdict from the validated receipt.
 */
export class ProviderLaneRuntimeProofActor {
    constructor({
        report,
        receipt,
        sourceRoot = PROJECT_ROOT,
        execFileFn = execFile,
        spawnFn = spawn,
        env = process.env,
        now = () => Date.now(),
        delayFn = ms => new Promise(resolve => setTimeout(resolve, ms)),
        nonceFn = () => randomBytes(8).toString('hex'),
        realpathFn = realpath,
        statFn = stat,
        signalTarget = process,
        commandSettleTimeoutMs = COMMAND_SETTLE_TIMEOUT_MS,
        registerSignalHandlers = true
    } = {}) {
        const nonce = safeProjectNonce(nonceFn());

        if (!nonce) throw new TypeError('runtime proof nonce must contain exactly 16 lowercase hex characters');

        this.report        = report;
        this.receipt       = receipt;
        this.sourceRoot    = sourceRoot;
        this.execFileFn    = execFileFn;
        this.spawnFn       = spawnFn;
        this.env           = env;
        this.now           = now;
        this.delayFn       = delayFn;
        this.realpathFn    = realpathFn;
        this.statFn        = statFn;
        this.signalTarget  = signalTarget;
        this.commandSettleTimeoutMs = commandSettleTimeoutMs;
        this.projectName   = `neo-provider-proof-${process.pid}-${nonce}`;
        this.probeNonce    = nonce;
        this.composeFiles  = [BASE_COMPOSE_FILE, LANE_COMPOSE_FILE].map(file => path.join(sourceRoot, file));
        this.composeAttempted = false;
        this.closed           = false;
        this.closePromise     = null;
        this.signalPromise    = null;
        this.signalDisposers  = [];
        this.activeCommands   = new Set();
        this.interrupted      = null;
        this.activeCaller     = null;
        this.observer          = null;
        this.observerId        = null;
        this.observerName      = `${this.projectName}-observer`;
        this.partial          = {observer: null, lanes: null, containment: null, restartIsolation: null};
        this.composeEnv       = this.createComposeEnv();
        this.dockerAuthority  = null;

        if (registerSignalHandlers) this.installSignalHandlers()
    }

    /**
     * @summary Executes the full identity, disconnect, and restart-isolation proof.
     * @returns {Promise<Object>}
     */
    async run() {
        const head = await this.assertSourceBinding();

        this.dockerAuthority = await this.assertLocalDockerAuthority();

        this.composeAttempted = true;
        await this.runDocker(
            ['up', '--detach', '--no-build', PROVIDER_SERVICES.chat, PROVIDER_SERVICES.embedding],
            'start provider proof project',
            STARTUP_TIMEOUT_MS
        );
        await this.waitForHealthy(PROVIDER_SERVICES.chat);
        await this.waitForHealthy(PROVIDER_SERVICES.embedding);

        this.observer = await this.startObserver();
        this.partial.observer = this.observer;

        const baseline = await this.capturePlane({warmChat: true});
        this.partial.lanes = baseline;

        const containment = await this.proveEmbeddingDisconnect(baseline.embedding);
        this.partial.containment = containment;

        const restartIsolation = await this.proveRestartIsolation(baseline);
        this.partial.restartIsolation = restartIsolation;
        this.throwIfInterrupted();

        const result = {
            schemaVersion: PROVIDER_LANE_RUNTIME_PROOF_SCHEMA_VERSION,
            verdict      : 'PASS',
            source       : {
                head,
                compositionDigest: this.report.selectedReceiptDigest
            },
            project: {
                name           : this.projectName,
                composeFiles   : [BASE_COMPOSE_FILE, LANE_COMPOSE_FILE],
                dockerAuthority: this.dockerAuthority,
                observer       : this.observer
            },
            lanes  : baseline,
            containment,
            restartIsolation,
            cleanup: {state: 'PENDING'},
            errors : []
        };

        assertRuntime(validateProviderLaneRuntimeProofReceipt(result, {
            cleanupState: 'PENDING',
            report      : this.report
        }).valid,
            'RUNTIME_RECEIPT_INCOMPLETE');

        return result
    }

    /**
     * @summary Retains only Docker connectivity plus exact selected deployment inputs.
     * @returns {Object}
     */
    createComposeEnv() {
        const out     = {};
        const allowed = /^(?:PATH|HOME|USER|LOGNAME|LANG|LC_ALL|TMPDIR|XDG_.+|HTTP_PROXY|HTTPS_PROXY|NO_PROXY)$/;

        for (const key of Object.keys(this.env || {})) {
            if (/^DOCKER_(?:CERT_PATH|CONFIG|CONTEXT|HOST|TLS_VERIFY)$/.test(key)) {
                throw new RuntimeProofError('DOCKER_AUTHORITY_OVERRIDE_REFUSED')
            }
        }

        for (const [key, value] of Object.entries(this.env || {})) {
            if (allowed.test(key) && typeof value === 'string') out[key] = value
        }

        for (const input of Object.values(this.receipt.deploymentInputs)) {
            out[input.env] = String(input.value)
        }

        out.NEO_DEPLOY_PROJECT_NAME = this.projectName;
        out.NEO_REVISION            = this.report.repositoryHead;

        return out
    }

    /**
     * @summary Refuses a remote Docker engine before the first Compose mutation.
     * @returns {Promise<{contextName: String, endpointClass: 'local-unix', socketPathDigest: String}>}
     */
    async assertLocalDockerAuthority() {
        const contextName = (await this.runExec('docker', ['context', 'show'],
                  'read local Docker context')).trim(),
              endpointRaw = (await this.runExec('docker', [
                  'context', 'inspect', contextName, '--format', '{{json .Endpoints.docker.Host}}'
              ], 'inspect local Docker context')).trim(),
              endpoint = parseJson(endpointRaw, 'DOCKER_CONTEXT_ENDPOINT_INVALID'),
              socketPath = localDockerSocketPath(endpoint),
              canonicalSocket = await this.realpathFn(socketPath),
              metadata = await this.statFn(canonicalSocket);

        assertRuntime(typeof contextName === 'string' && contextName.length > 0,
            'DOCKER_CONTEXT_NAME_INVALID');
        assertRuntime(path.isAbsolute(canonicalSocket) && metadata.isSocket(),
            'DOCKER_ENDPOINT_NOT_LOCAL_SOCKET');

        return {
            contextName,
            endpointClass   : 'local-unix',
            socketPathDigest: digestProviderLaneRuntimeValue(canonicalSocket)
        }
    }

    /**
     * @summary Installs process-signal cleanup before any Docker mutation.
     */
    installSignalHandlers() {
        for (const signal of ['SIGINT', 'SIGTERM']) {
            const handler = () => {
                if (this.signalPromise) return;

                this.interrupted = new RuntimeProofError(`INTERRUPTED_${signal}`);
                this.signalPromise = this.cancelActiveWork()
            };

            this.signalTarget.once(signal, handler);
            this.signalDisposers.push(() => this.signalTarget.removeListener(signal, handler))
        }
    }

    /**
     * @summary Removes only this actor's process-signal listeners.
     */
    disposeSignalHandlers() {
        this.signalDisposers.splice(0).forEach(dispose => dispose())
    }

    /**
     * @summary Refuses every new non-cleanup action after a process interruption.
     */
    throwIfInterrupted() {
        if (this.interrupted) throw this.interrupted
    }

    /**
     * @summary Terminates and awaits active non-cleanup children before project cleanup can start.
     * @returns {Promise<Boolean>}
     */
    async cancelActiveWork() {
        const commands = [...this.activeCommands];

        for (const command of commands) command.child?.kill?.('SIGTERM');
        if (this.activeCaller && !this.activeCaller.settled) this.activeCaller.child?.kill?.('SIGTERM');

        let settled = await this.waitForCommandBarrier(commands);

        if (!settled) {
            for (const command of commands.filter(item => !item.settled)) command.child?.kill?.('SIGKILL');
            settled = await this.waitForCommandBarrier(commands);
            if (!settled) {
                for (const command of commands.filter(item => !item.settled)) {
                    command.rejectInterruption?.()
                }
            }
        }

        if (this.activeCaller && !this.activeCaller.settled) {
            try {
                await this.waitForCallerSettlement(this.activeCaller)
            } catch {
                this.activeCaller.child?.kill?.('SIGKILL')
            }
        }

        return settled && (!this.activeCaller || this.activeCaller.settled)
    }

    /**
     * @summary Waits a bounded interval for a fixed set of tracked command callbacks.
     */
    waitForCommandBarrier(commands) {
        if (commands.every(command => command.settled)) return Promise.resolve(true);

        return Promise.race([
            Promise.all(commands.map(command => command.settledPromise)).then(() => true),
            new Promise(resolve => setTimeout(() => resolve(false), this.commandSettleTimeoutMs))
        ])
    }

    /**
     * @summary Binds a clean exact checkout to the authoritative election report before Docker.
     * @returns {Promise<String>}
     */
    async assertSourceBinding() {
        const [headRaw, status] = await Promise.all([
            this.runExec('git', ['-C', this.sourceRoot, 'rev-parse', 'HEAD'], 'read runtime proof head'),
            this.runExec('git', ['-C', this.sourceRoot, 'status', '--porcelain=v1', '--untracked-files=all'],
                'inspect runtime proof checkout')
        ]);
        const head = headRaw.trim();

        assertRuntime(!status.trim(), 'SOURCE_WORKTREE_DIRTY');
        assertRuntime(head === this.report.repositoryHead, 'SOURCE_REVISION_MISMATCH');

        return head
    }

    /**
     * @summary Starts one project-owned, provider-image-pinned observer on the exact provider network.
     * @returns {Promise<Object>}
     */
    async startObserver() {
        const [chat, embedding] = await Promise.all([
            this.inspectService(PROVIDER_SERVICES.chat, this.receipt.lanes.chat),
            this.inspectService(PROVIDER_SERVICES.embedding, this.receipt.lanes.embedding)
        ]),
              sharedNetworks = embedding.networks.filter(embeddingNetwork =>
                  chat.networks.some(chatNetwork => chatNetwork.id === embeddingNetwork.id &&
                      chatNetwork.name === embeddingNetwork.name));

        assertRuntime(sharedNetworks.length === 1, 'PROVIDER_NETWORK_AUTHORITY_AMBIGUOUS');

        const network = sharedNetworks[0],
              command = 'trap "exit 0" INT TERM; while :; do sleep 3600 & wait $!; done',
              output  = await this.runExec('docker', [
                  'run', '--detach', '--pull', 'never',
                  '--name', this.observerName,
                  '--label', `com.docker.compose.project=${this.projectName}`,
                  '--label', `com.docker.compose.service=${OBSERVER_SERVICE}`,
                  '--network', network.name,
                  '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                  '--entrypoint', '/bin/sh',
                  embedding.configuredImage,
                  '-ec', command
              ], 'start provider proof observer'),
              id = output.trim();

        assertRuntime(/^[a-f0-9]{64}$/.test(id), 'OBSERVER_CONTAINER_ID_INVALID');
        this.observerId = id;

        return this.inspectObserver({embedding, network})
    }

    /**
     * @summary Validates the observer's image, ownership labels, running state, and exact network.
     * @param {Object} authority Provider-image and network authority.
     * @returns {Promise<Object>}
     */
    async inspectObserver({embedding, network}) {
        const rows = parseJson(await this.runExec('docker', ['inspect', this.observerId],
                  'inspect provider proof observer'), 'OBSERVER_INSPECT_INVALID'),
              row = Array.isArray(rows) ? rows[0] : null,
              networks = projectNetworks(row),
              labels = row?.Config?.Labels || {};

        assertRuntime(row?.Id === this.observerId, 'OBSERVER_ID_DRIFT');
        assertRuntime(row?.Config?.Image === embedding.configuredImage && row?.Image === embedding.imageId,
            'OBSERVER_IMAGE_IDENTITY_MISMATCH');
        assertRuntime(row?.State?.Running === true && row?.State?.Status === 'running',
            'OBSERVER_NOT_RUNNING');
        assertRuntime(labels['com.docker.compose.project'] === this.projectName &&
            labels['com.docker.compose.service'] === OBSERVER_SERVICE,
        'OBSERVER_OWNERSHIP_MISMATCH');
        assertRuntime(networks.length === 1 && networks[0].id === network.id && networks[0].name === network.name,
            'OBSERVER_NETWORK_IDENTITY_MISMATCH');

        return {
            configuredImage: row.Config.Image,
            containerId    : row.Id,
            imageId        : row.Image,
            networks,
            projectLabel   : labels['com.docker.compose.project'],
            serviceLabel   : labels['com.docker.compose.service'],
            startedAt      : row.State.StartedAt,
            state          : row.State.Status
        }
    }

    /**
     * @summary Captures both observed lane identities from the same running project.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async capturePlane({warmChat}) {
        const chatContainer      = await this.inspectService(PROVIDER_SERVICES.chat, this.receipt.lanes.chat),
              embeddingContainer = await this.inspectService(PROVIDER_SERVICES.embedding, this.receipt.lanes.embedding),
              chat               = await this.observeChatLane(chatContainer, {warm: warmChat}),
              embedding          = await this.observeEmbeddingLane(embeddingContainer, {requireIdle: true});

        return {chat, declaredRoles: structuredClone(this.receipt.roles), embedding}
    }

    /**
     * @summary Observes exact chat container, route peer, loaded model, and runtime context.
     */
    async observeChatLane(container, {warm}) {
        const lane     = this.receipt.lanes.chat;
        let   warmPeer = null;

        if (warm) {
            const warmed = await this.curlJson({
                url   : lane.endpoints.workload.url,
                method: lane.endpoints.workload.method,
                body  : {
                    model   : lane.model.id,
                    messages: [{role: 'user', content: 'Reply with OK.'}],
                    stream  : false,
                    options : {num_predict: 1}
                },
                label: 'warm chat lane'
            });

            assertRuntime(container.networks.some(network => network.ip === warmed.remoteIp),
                'CHAT_WORKLOAD_ROUTE_PEER_MISMATCH');
            warmPeer = warmed.remoteIp
        }

        const observed = await this.curlJson({
            url   : lane.endpoints.modelContext.url,
            method: lane.endpoints.modelContext.method,
            label : 'observe chat model context'
        });
        const rows  = observed.body?.models,
              model = Array.isArray(rows)
                  ? rows.find(row => row?.[lane.endpoints.modelContext.modelIdField] === lane.model.id)
                  : null;

        assertRuntime(Boolean(model), 'CHAT_MODEL_IDENTITY_MISSING');
        assertRuntime(Number.isInteger(model[lane.endpoints.modelContext.contextTokensField]) &&
            model[lane.endpoints.modelContext.contextTokensField] >= lane.contextTokensPerSlotRequired,
        'CHAT_CONTEXT_MISMATCH');
        assertRuntime(container.networks.some(network => network.ip === observed.remoteIp),
            'CHAT_ROUTE_PEER_MISMATCH');
        assertRuntime(warmPeer === null || warmPeer === observed.remoteIp,
            'CHAT_WORKLOAD_ROUTE_PEER_MISMATCH');

        return {
            container: projectContainerIdentity(container),
            endpoint : {url: lane.endpoints.modelContext.url, remoteIp: observed.remoteIp},
            model    : {
                id           : model[lane.endpoints.modelContext.modelIdField],
                contextTokens: model[lane.endpoints.modelContext.contextTokensField]
            }
        }
    }

    /**
     * @summary Observes exact embedding container, network peer, model, and slot roster.
     */
    async observeEmbeddingLane(container, {requireIdle}) {
        const lane                       = this.receipt.lanes.embedding;
        const [health, models, rawSlots] = await Promise.all([
            this.curlJson({url: lane.endpoints.readiness.url, method: 'GET', label: 'observe embedding health'}),
            this.curlJson({url: lane.endpoints.models.url, method: 'GET', label: 'observe embedding models'}),
            this.curlJson({url: lane.endpoints.slotContext.url, method: 'GET', label: 'observe embedding slots'})
        ]);
        const modelRows = models.body?.data,
              model     = Array.isArray(modelRows) ? modelRows.find(row => row?.id === lane.model.id) : null,
              slots     = slotsProjection(rawSlots.body, lane);

        assertRuntime(Boolean(model), 'EMBEDDING_MODEL_IDENTITY_MISSING');
        assertRuntime(container.networks.some(network => network.ip === health.remoteIp) &&
            health.remoteIp === models.remoteIp && health.remoteIp === rawSlots.remoteIp,
        'EMBEDDING_ROUTE_PEER_MISMATCH');
        if (requireIdle) assertRuntime(allSlotsIdle(slots), 'EMBEDDING_BASELINE_NOT_IDLE', 'NOT_PROVEN');

        return {
            container: projectContainerIdentity(container),
            endpoint : {url: lane.endpoints.models.url, remoteIp: models.remoteIp},
            model    : {id: model.id},
            slots
        }
    }

    /**
     * @summary Proves admitted work becomes stably idle after the concrete caller is disconnected.
     */
    async proveEmbeddingDisconnect(baseline) {
        const lane          = this.receipt.lanes.embedding,
              baselineIds   = baseline.slots.map(row => row.id),
              payload       = this.createEmbeddingProbePayload(),
              payloadDigest = digestProviderLaneRuntimeValue(payload),
              caller        = await this.startEmbeddingCaller(payload);
        this.activeCaller = caller;

        let admitted;
        let   admittedAtMs       = null;
        const admittedAtDeadline = this.now() + ADMISSION_TIMEOUT_MS;
        const slotSequence       = [];

        while (this.now() <= admittedAtDeadline) {
            if (caller.settled) break;

            const burst = await this.readSlotBurst(baseline.endpoint.remoteIp, admittedAtDeadline);
            for (const observed of burst) {
                slotSequence.push({atMs: this.now(), ...observed});
                assertRuntime(acceptedSlotIds(observed.slots, baselineIds), 'SLOT_ROSTER_DRIFT', 'NOT_PROVEN');
                const processing = observed.slots.filter(row => row.isProcessing === true);

                if (processing[0] && !admitted) {
                    admitted = processing[0];
                    assertRuntime(Number.isInteger(admitted.idTask), 'ADMISSION_TASK_ID_MISSING', 'NOT_PROVEN');
                    admittedAtMs = slotSequence.at(-1).atMs
                }
            }
            if (admitted) break;
            await this.delayFn(POLL_INTERVAL_MS)
        }

        assertRuntime(Boolean(admitted), 'ADMISSION_NOT_OBSERVED', 'NOT_PROVEN');
        assertRuntime(caller.remoteIp === baseline.endpoint.remoteIp,
            'CALLER_ROUTE_PEER_MISMATCH', 'NOT_PROVEN');

        await this.delayFn(POLL_INTERVAL_MS);
        const revalidationDeadline = this.now() + ADMISSION_TIMEOUT_MS,
              revalidationBurst    = await this.readSlotBurst(baseline.endpoint.remoteIp, revalidationDeadline);
        let revalidated     = null,
            revalidatedAtMs = null;
        for (const observed of revalidationBurst) {
            const atMs = this.now();
            slotSequence.push({atMs, ...observed});
            assertRuntime(acceptedSlotIds(observed.slots, baselineIds), 'SLOT_ROSTER_DRIFT', 'NOT_PROVEN');
            const processing = observed.slots.filter(row => row.isProcessing === true);
            if (processing[0]) {
                revalidated     = processing[0];
                revalidatedAtMs = atMs
            }
        }
        assertRuntime(!caller.settled && revalidated &&
            Number.isInteger(revalidated.idTask), 'ADMISSION_NOT_STABLE', 'NOT_PROVEN');

        const disconnectAt          = this.now(),
              disconnectWitness     = await this.disconnectCaller(caller),
              disconnectConfirmedAt = this.now(),
              settlement            = await this.waitForCallerSettlement(caller);

        assertRuntime(settlement.code === 143 && settlement.signal === null,
            'CALLER_COMPLETED_NATURALLY', 'NOT_PROVEN');
        await this.verifyCallerGone(caller, disconnectWitness.startTime);

        let consecutiveIdle = 0,
            firstAllIdleAt  = null,
            stableAllIdleAt = null;
        const idleDeadline = disconnectConfirmedAt + IDLE_TIMEOUT_MS;

        while (this.now() <= idleDeadline) {
            const observed = await this.readSlots(baseline.endpoint.remoteIp, idleDeadline);
            const atMs     = this.now();
            slotSequence.push({atMs, ...observed});
            assertRuntime(acceptedSlotIds(observed.slots, baselineIds), 'SLOT_ROSTER_DRIFT', 'NOT_PROVEN');

            if (allSlotsIdle(observed.slots)) {
                consecutiveIdle++;
                firstAllIdleAt ??= atMs;
                if (consecutiveIdle >= REQUIRED_IDLE_SAMPLES) {
                    stableAllIdleAt = atMs;
                    break
                }
            } else {
                consecutiveIdle = 0;
                firstAllIdleAt  = null
            }

            await this.delayFn(POLL_INTERVAL_MS)
        }

        assertRuntime(stableAllIdleAt !== null, 'POST_DISCONNECT_WORK_DID_NOT_SETTLE');

        const control = await this.curlJson({
            url   : lane.endpoints.workload.url,
            method: lane.endpoints.workload.method,
            body  : {model: lane.model.id, input: 'post-disconnect lane usability control'},
            label : 'run post-disconnect embedding control'
        });

        assertRuntime(Array.isArray(control.body?.data) && control.body.data.length === 1,
            'POST_DISCONNECT_CONTROL_FAILED');
        assertRuntime(control.remoteIp === baseline.endpoint.remoteIp,
            'POST_DISCONNECT_CONTROL_PEER_MISMATCH');

        this.activeCaller = null;

        return {
            state  : 'PASS',
            payload: {
                digest    : payloadDigest,
                byteLength: Buffer.byteLength(JSON.stringify(payload.input)),
                inputCount: payload.input.length,
                shape     : 'bounded-string-array'
            },
            admission: {
                observed         : true,
                slotId           : admitted.id,
                idTask           : admitted.idTask,
                admittedAtMs,
                revalidatedAtMs,
                revalidatedIdTask: revalidated.idTask,
                revalidatedSlotId: revalidated.id
            },
            disconnect: {
                method                : 'in-container-sigterm',
                atMs                  : disconnectAt,
                confirmedAtMs         : disconnectConfirmedAt,
                callerPid             : caller.pid,
                callerRemoteIp        : caller.remoteIp,
                callerSettled         : true,
                exitCode              : settlement.code,
                signal                : settlement.signal,
                socketCount           : disconnectWitness.socketCount,
                preKillProcessingCount: disconnectWitness.preKillProcessingCount,
                preKillRemoteIp       : disconnectWitness.preKillRemoteIp,
                startTime             : disconnectWitness.startTime
            },
            idle: {
                boundMs               : IDLE_TIMEOUT_MS,
                firstAllIdleAtMs      : firstAllIdleAt,
                stableAllIdleAtMs     : stableAllIdleAt,
                settleMs              : stableAllIdleAt - disconnectConfirmedAt,
                consecutiveIdleSamples: consecutiveIdle
            },
            slotSequence,
            postControl: {state: 'PASS', remoteIp: control.remoteIp}
        }
    }

    /**
     * @summary Stops and starts each exact provider ID while observing the opposite lane during downtime.
     */
    async proveRestartIsolation(baseline) {
        const chatBefore = projectLaneIdentity(baseline.chat);

        await this.stopExactProvider(baseline.chat.container.containerId, 'chat');
        const stoppedChat = await this.inspectStoppedService(
                  baseline.chat.container.containerId, this.receipt.lanes.chat, PROVIDER_SERVICES.chat
              ),
              duringChatEmbedding = await this.observeEmbeddingLane(
                  await this.inspectService(PROVIDER_SERVICES.embedding, this.receipt.lanes.embedding),
                  {requireIdle: true}
              );

        assertRuntime(unchangedIdentity(baseline.embedding, duringChatEmbedding),
            'CHAT_RESTART_MOVED_EMBEDDING');
        await this.startExactProvider(baseline.chat.container.containerId, 'chat');
        await this.waitForHealthy(PROVIDER_SERVICES.chat, baseline.chat.container.containerId);
        const afterChat = await this.capturePlane({warmChat: true});

        assertRuntime(restartedLaneIdentity(chatBefore, projectLaneIdentity(afterChat.chat)),
            'CHAT_RESTART_NOT_OBSERVED');
        assertRuntime(unchangedIdentity(baseline.embedding, afterChat.embedding),
            'CHAT_RESTART_MOVED_EMBEDDING');

        const embeddingBefore = projectLaneIdentity(afterChat.embedding);

        await this.stopExactProvider(afterChat.embedding.container.containerId, 'embedding');
        const stoppedEmbedding = await this.inspectStoppedService(
                  afterChat.embedding.container.containerId,
                  this.receipt.lanes.embedding,
                  PROVIDER_SERVICES.embedding
              ),
              duringEmbeddingChat = await this.observeChatLane(
                  await this.inspectService(PROVIDER_SERVICES.chat, this.receipt.lanes.chat),
                  {warm: false}
              );

        assertRuntime(unchangedIdentity(afterChat.chat, duringEmbeddingChat),
            'EMBEDDING_RESTART_MOVED_CHAT');
        await this.startExactProvider(afterChat.embedding.container.containerId, 'embedding');
        await this.waitForHealthy(PROVIDER_SERVICES.embedding, afterChat.embedding.container.containerId);
        const afterEmbedding = await this.capturePlane({warmChat: false});

        assertRuntime(restartedLaneIdentity(embeddingBefore, projectLaneIdentity(afterEmbedding.embedding)),
            'EMBEDDING_RESTART_NOT_OBSERVED');
        assertRuntime(unchangedIdentity(afterChat.chat, afterEmbedding.chat),
            'EMBEDDING_RESTART_MOVED_CHAT');

        return {
            state: 'PASS',
            chat : {
                before: chatBefore,
                during: {
                    target  : projectStoppedContainer(stoppedChat),
                    opposite: projectLaneIdentity(duringChatEmbedding)
                },
                after: {
                    target  : projectLaneIdentity(afterChat.chat),
                    opposite: projectLaneIdentity(afterChat.embedding)
                }
            },
            embedding: {
                before: embeddingBefore,
                during: {
                    target  : projectStoppedContainer(stoppedEmbedding),
                    opposite: projectLaneIdentity(duringEmbeddingChat)
                },
                after: {
                    target  : projectLaneIdentity(afterEmbedding.embedding),
                    opposite: projectLaneIdentity(afterEmbedding.chat)
                }
            }
        }
    }

    /**
     * @summary Stops one exact project-owned provider container without Compose dependency effects.
     */
    async stopExactProvider(id, laneName) {
        const stopped = (await this.runExec('docker', ['stop', '--time', '30', id],
            `stop exact ${laneName} provider`)).trim();

        assertRuntime(stopped === id || id.startsWith(stopped),
            `${laneName.toUpperCase()}_STOP_TARGET_DRIFT`)
    }

    /**
     * @summary Starts one exact stopped provider container without recreating its opposite lane.
     */
    async startExactProvider(id, laneName) {
        const started = (await this.runExec('docker', ['start', id],
            `start exact ${laneName} provider`)).trim();

        assertRuntime(started === id || id.startsWith(started),
            `${laneName.toUpperCase()}_START_TARGET_DRIFT`)
    }

    /**
     * @summary Creates one bounded multi-input request to improve fail-closed slot observability.
     */
    createEmbeddingProbePayload() {
        return {
            model: this.receipt.lanes.embedding.model.id,
            input: Array.from({length: EMBEDDING_PROBE_INPUTS}, (_, index) =>
                `Neo provider lane disconnect containment witness ${index}. `.repeat(EMBEDDING_PROBE_REPEATS))
        }
    }

    /**
     * @summary Starts a concrete curl caller in the project-owned observer and returns its PID controller.
     */
    startEmbeddingCaller(payload) {
        this.throwIfInterrupted();

        const lane        = this.receipt.lanes.embedding,
              curlCommand = [
                  'curl --silent --show-error --fail-with-body --no-buffer',
                  '--verbose',
                  '--header "Content-Type: application/json"',
                  '--header "Connection: close"',
                  '--header "X-Neo-Probe-Id: $NEO_PROVIDER_PROBE_NONCE"',
                  '--data-binary "$NEO_PROVIDER_PROBE_PAYLOAD"',
                  `"${lane.endpoints.workload.url}" >/dev/null`
              ].join(' '),
              command = [
                  `${curlCommand} &`,
                  'caller_pid=$!',
                  'printf "NEO_PROVIDER_CALLER:%s:%s\\n" "$NEO_PROVIDER_PROBE_NONCE" "$caller_pid"',
                  'wait "$caller_pid"'
              ].join('\n'),
              args = [
                  'exec',
                  '-e', `NEO_PROVIDER_PROBE_NONCE=${this.probeNonce}`,
                  '-e', `NEO_PROVIDER_PROBE_PAYLOAD=${JSON.stringify(payload)}`,
                  this.observerId,
                  'sh', '-ec', command
              ],
              child = this.spawnFn('docker', args, {
                  cwd  : this.sourceRoot,
                  env  : this.composeEnv,
                  stdio: ['ignore', 'pipe', 'pipe']
              });

        return new Promise((resolve, reject) => {
            const caller = {
                child,
                pid     : null,
                remoteIp: null,
                settled : false,
                result  : null
            };
            this.activeCaller = caller;
            let stdoutBuffer = '',
                stderrBuffer = '';
            let   resolved          = false;
            const failBeforeResolve = code => {
                if (resolved) return;
                resolved = true;
                clearTimeout(timer);
                child.kill('SIGTERM');
                reject(new RuntimeProofError(code, 'NOT_PROVEN'))
            };
            const timer = setTimeout(() => failBeforeResolve(
                caller.pid ? 'CALLER_PEER_NOT_OBSERVED' : 'CALLER_PID_NOT_OBSERVED'
            ), CALLER_SETTLE_TIMEOUT_MS);
            const maybeResolve = () => {
                if (!resolved && caller.pid && caller.remoteIp) {
                    resolved = true;
                    clearTimeout(timer);
                    resolve(caller)
                }
            };

            const settle = (code, signal) => {
                caller.settled = true;
                caller.result  = {code, signal};
                if (!resolved) {
                    failBeforeResolve(caller.pid
                        ? 'CALLER_SETTLED_BEFORE_PEER'
                        : 'CALLER_SETTLED_BEFORE_PID')
                }
            };

            child.once('exit', settle);
            child.once('error', () => failBeforeResolve('CALLER_START_FAILED'));
            child.stdout?.on('data', chunk => {
                stdoutBuffer += String(chunk);
                const match = stdoutBuffer.match(new RegExp(`NEO_PROVIDER_CALLER:${this.probeNonce}:(\\d+)`));

                if (match && !caller.pid) {
                    caller.pid = Number(match[1]);
                    maybeResolve()
                }
            });
            child.stderr?.on('data', chunk => {
                stderrBuffer += String(chunk);
                const match = stderrBuffer.match(/Connected to [^\s]+ \(([^)]+)\) port \d+/);

                if (match && !caller.remoteIp) {
                    caller.remoteIp = match[1];
                    maybeResolve()
                }
            })
        })
    }

    /**
     * @summary Atomically verifies and terminates the exact connected observer curl process.
     */
    async disconnectCaller(caller) {
        const lane     = this.receipt.lanes.embedding,
              endpoint = new URL(lane.endpoints.workload.url),
              port     = Number(endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80)),
              script   = [
                  'pid="$NEO_PROVIDER_CALLER_PID"',
                  'test -r "/proc/$pid/stat"',
                  'start_time="$(awk \'{print $22}\' "/proc/$pid/stat")"',
                  'cmdline="$(tr "\\000" " " < "/proc/$pid/cmdline")"',
                  'case "$cmdline" in *curl*"$NEO_PROVIDER_PROBE_NONCE"*"$NEO_PROVIDER_PROBE_URL"*) ;; *) exit 42 ;; esac',
                  'slot_receipt="$(curl --silent --show-error --fail-with-body --connect-timeout 10 --max-time 30 --write-out \'\\nNEO_PROVIDER_REMOTE_IP:%{remote_ip}\' "$NEO_PROVIDER_SLOT_URL")"',
                  'slot_peer="$(printf "%s\\n" "$slot_receipt" | tail -n 1 | sed \'s/^NEO_PROVIDER_REMOTE_IP://\')"',
                  'test "$slot_peer" = "$NEO_PROVIDER_CALLER_REMOTE_IP"',
                  'slot_body="$(printf "%s\\n" "$slot_receipt" | sed \'$d\' | tr -d \'[:space:]\')"',
                  'busy_count="$(printf "%s" "$slot_body" | awk \'{s=$0; n=0; needle="\\\"is_processing\\\":true"; while ((i=index(s, needle)) > 0) {n++; s=substr(s, i + length(needle))} print n}\')"',
                  'test "$busy_count" -ge 1',
                  'peer_hex="$(printf "%s\\n" "$NEO_PROVIDER_CALLER_REMOTE_IP" | awk -F. \'NF == 4 {printf "%02X%02X%02X%02X", $4, $3, $2, $1}\')"',
                  'test -n "$peer_hex"',
                  'peer_port_hex="$(printf "%04X" "$NEO_PROVIDER_CALLER_REMOTE_PORT")"',
                  'socket_count=0',
                  'for fd in /proc/$pid/fd/*; do',
                  '  target="$(readlink "$fd" 2>/dev/null || true)"',
                  '  case "$target" in',
                  '    socket:\\[*\\])',
                  '      inode="$(printf "%s" "$target" | tr -cd "0-9")"',
                  '      if awk -v inode="$inode" -v remote="$peer_hex:$peer_port_hex" \'NR > 1 && toupper($3) == remote && $4 == "01" && $10 == inode {found = 1} END {exit found ? 0 : 1}\' /proc/net/tcp; then',
                  '        socket_count=$((socket_count + 1))',
                  '      fi',
                  '      ;;',
                  '  esac',
                  'done',
                  'test "$socket_count" -ge 1',
                  'kill -TERM "$pid"',
                  'printf "NEO_PROVIDER_DISCONNECT:%s:%s:%s:%s:%s\\n" "$pid" "$start_time" "$socket_count" "$busy_count" "$slot_peer"'
              ].join('\n'),
              args = [
                  'exec',
                  '-e', `NEO_PROVIDER_CALLER_PID=${caller.pid}`,
                  '-e', `NEO_PROVIDER_PROBE_NONCE=${this.probeNonce}`,
                  '-e', `NEO_PROVIDER_PROBE_URL=${lane.endpoints.workload.url}`,
                  '-e', `NEO_PROVIDER_CALLER_REMOTE_IP=${caller.remoteIp}`,
                  '-e', `NEO_PROVIDER_CALLER_REMOTE_PORT=${port}`,
                  '-e', `NEO_PROVIDER_SLOT_URL=${lane.endpoints.slotContext.url}`,
                  this.observerId,
                  'sh', '-ec', script
              ];
        let output;

        try {
            output = await this.runExec('docker', args, 'disconnect admitted embedding caller')
        } catch {
            throw new RuntimeProofError('CALLER_DISCONNECT_NOT_OBSERVED', 'NOT_PROVEN')
        }

        const match = output.match(new RegExp(
            `NEO_PROVIDER_DISCONNECT:${caller.pid}:(\\d+):(\\d+):(\\d+):([^\\s]+)`
        ));

        assertRuntime(Boolean(match), 'CALLER_DISCONNECT_WITNESS_MISSING', 'NOT_PROVEN');

        return {
            startTime             : match[1],
            socketCount           : Number(match[2]),
            preKillProcessingCount: Number(match[3]),
            preKillRemoteIp       : match[4]
        }
    }

    /**
     * @summary Proves the terminated PID/start-time pair no longer names the caller process.
     */
    async verifyCallerGone(caller, startTime) {
        const script = [
            'pid="$NEO_PROVIDER_CALLER_PID"',
            'if test -r "/proc/$pid/stat"; then',
            '  current="$(awk \'{print $22}\' "/proc/$pid/stat")"',
            '  test "$current" != "$NEO_PROVIDER_CALLER_START_TIME"',
            'fi'
        ].join('\n');

        try {
            await this.runExec('docker', [
                'exec',
                '-e', `NEO_PROVIDER_CALLER_PID=${caller.pid}`,
                '-e', `NEO_PROVIDER_CALLER_START_TIME=${startTime}`,
                this.observerId,
                'sh', '-ec', script
            ], 'verify embedding caller exited')
        } catch {
            throw new RuntimeProofError('CALLER_DISCONNECT_NOT_CONFIRMED', 'NOT_PROVEN')
        }
    }

    /**
     * @summary Waits for the owning compose-exec child to settle after caller termination.
     */
    async waitForCallerSettlement(caller) {
        if (caller.settled) return caller.result;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(
                new RuntimeProofError('CALLER_DID_NOT_SETTLE', 'NOT_PROVEN')
            ), CALLER_SETTLE_TIMEOUT_MS);

            caller.child.once('exit', (code, signal) => {
                clearTimeout(timer);
                caller.settled = true;
                caller.result  = {code, signal};
                resolve(caller.result)
            })
        })
    }

    /**
     * @summary Reads and validates the current exact embedding slot roster.
     */
    async readSlots(expectedRemoteIp, deadlineMs) {
        const lane = this.receipt.lanes.embedding;
        let observed;
        const remainingMs = Math.max(1, deadlineMs - this.now());

        try {
            observed = await this.curlJson({
                url      : lane.endpoints.slotContext.url,
                method   : lane.endpoints.slotContext.method,
                label    : 'poll embedding slots',
                timeoutMs: remainingMs
            })
        } catch {
            throw new RuntimeProofError('SLOT_OBSERVATION_UNAVAILABLE', 'NOT_PROVEN')
        }

        assertRuntime(observed.remoteIp === expectedRemoteIp,
            'SLOT_OBSERVER_PEER_MISMATCH', 'NOT_PROVEN');

        return {remoteIp: observed.remoteIp, slots: slotsProjection(observed.body, lane)}
    }

    /**
     * @summary Starts a small concurrent observer burst without upgrading a missed edge to failure.
     */
    readSlotBurst(expectedRemoteIp, deadlineMs) {
        return Promise.all(Array.from({length: SLOT_OBSERVATION_BURST}, () =>
            this.readSlots(expectedRemoteIp, deadlineMs)))
    }

    /**
     * @summary Executes one receipt-bound HTTP request from the embedding service namespace.
     */
    async curlJson({url, method='GET', body, label, timeoutMs=COMMAND_TIMEOUT_MS}) {
        const curlTimeout    = Math.max(0.001, timeoutMs / 1000).toFixed(3),
              connectTimeout = Math.min(10, Math.max(0.001, timeoutMs / 1000)).toFixed(3);
        const args = [
            'exec', this.observerId,
            'curl', '--silent', '--show-error', '--fail-with-body',
            '--connect-timeout', connectTimeout, '--max-time', curlTimeout,
            '--request', method,
            '--write-out', '\nNEO_PROVIDER_REMOTE_IP:%{remote_ip}',
            '--header', 'Accept: application/json'
        ];

        if (body !== undefined) {
            args.push('--header', 'Content-Type: application/json', '--data-binary', JSON.stringify(body))
        }

        args.push(url);

        return parseCurlReceipt(await this.runExec('docker', args, label, {timeout: timeoutMs + 1000}),
            label.replaceAll(' ', '_').toUpperCase())
    }

    /**
     * @summary Resolves and validates one project-owned provider container.
     */
    async inspectService(service, lane) {
        const id = (await this.runDocker(['ps', '--quiet', service], `resolve ${service} container`)).trim();

        assertRuntime(/^[a-f0-9]{12,64}$/.test(id), `${service.toUpperCase().replace('-', '_')}_CONTAINER_MISSING`);

        const rows = parseJson(await this.runExec('docker', ['inspect', id], `inspect ${service}`),
            `${service.toUpperCase().replace('-', '_')}_INSPECT_INVALID`),
              row  = Array.isArray(rows) ? rows[0] : null,
              networks = projectNetworks(row),
              labels = row?.Config?.Labels || {};

        assertRuntime(row?.Id === id || row?.Id?.startsWith(id), `${service.toUpperCase().replace('-', '_')}_ID_DRIFT`);
        assertRuntime(row?.Config?.Image === `${lane.image.reference}@${lane.image.digest}`,
            `${service.toUpperCase().replace('-', '_')}_IMAGE_REFERENCE_MISMATCH`);
        assertRuntime(/^sha256:[a-f0-9]{64}$/.test(row?.Image || ''),
            `${service.toUpperCase().replace('-', '_')}_IMAGE_ID_MISSING`);
        assertRuntime(row?.State?.Health?.Status === 'healthy',
            `${service.toUpperCase().replace('-', '_')}_NOT_HEALTHY`);
        assertRuntime(labels['com.docker.compose.project'] === this.projectName,
            `${service.toUpperCase().replace('-', '_')}_PROJECT_OWNERSHIP_MISMATCH`);
        assertRuntime(labels['com.docker.compose.service'] === service,
            `${service.toUpperCase().replace('-', '_')}_SERVICE_OWNERSHIP_MISMATCH`);
        assertRuntime(networks.length > 0,
            `${service.toUpperCase().replace('-', '_')}_NETWORK_IDENTITY_MISSING`);

        return {
            containerId    : row.Id,
            configuredImage: row.Config.Image,
            health         : row.State.Health.Status,
            imageId        : row.Image,
            networks,
            projectLabel   : labels['com.docker.compose.project'],
            restartCount   : row.RestartCount,
            serviceLabel   : labels['com.docker.compose.service'],
            startedAt      : row.State.StartedAt
        }
    }

    /**
     * @summary Validates that one exact provider container is stopped without identity movement.
     */
    async inspectStoppedService(id, lane, service) {
        const rows = parseJson(await this.runExec('docker', ['inspect', id], `inspect stopped ${service}`),
                  `${service.toUpperCase().replace('-', '_')}_STOPPED_INSPECT_INVALID`),
              row = Array.isArray(rows) ? rows[0] : null,
              networks = projectStoppedNetworks(row),
              labels = row?.Config?.Labels || {};

        assertRuntime(row?.Id === id, `${service.toUpperCase().replace('-', '_')}_STOPPED_ID_DRIFT`);
        assertRuntime(row?.Config?.Image === `${lane.image.reference}@${lane.image.digest}` &&
            /^sha256:[a-f0-9]{64}$/.test(row?.Image || ''),
        `${service.toUpperCase().replace('-', '_')}_STOPPED_IMAGE_MISMATCH`);
        assertRuntime(row?.State?.Running === false && row?.State?.Status === 'exited',
            `${service.toUpperCase().replace('-', '_')}_STOP_NOT_OBSERVED`);
        assertRuntime(labels['com.docker.compose.project'] === this.projectName &&
            labels['com.docker.compose.service'] === service,
        `${service.toUpperCase().replace('-', '_')}_STOPPED_OWNERSHIP_MISMATCH`);
        assertRuntime(networks.length > 0,
            `${service.toUpperCase().replace('-', '_')}_STOPPED_NETWORK_IDENTITY_MISSING`);

        return {
            configuredImage: row.Config.Image,
            containerId    : row.Id,
            imageId        : row.Image,
            networks,
            projectLabel   : labels['com.docker.compose.project'],
            restartCount   : row.RestartCount,
            serviceLabel   : labels['com.docker.compose.service'],
            startedAt      : row.State.StartedAt,
            state          : row.State.Status
        }
    }

    /**
     * @summary Polls container health within the declared startup bound.
     */
    async waitForHealthy(service, expectedId=null) {
        const deadline = this.now() + HEALTH_TIMEOUT_MS;

        do {
            const id = expectedId ||
                (await this.runDocker(['ps', '--quiet', service], `resolve ${service} health target`)).trim();

            if (id) {
                const status = (await this.runExec(
                    'docker', ['inspect', '--format', '{{.State.Health.Status}}', id],
                    `read ${service} health`
                )).trim();

                if (status === 'healthy') return
            }

            await this.delayFn(1000)
        } while (this.now() <= deadline);

        throw new RuntimeProofError(`${service.toUpperCase().replace('-', '_')}_HEALTH_TIMEOUT`)
    }

    composeArgs(args) {
        const compose = ['compose', '--env-file', '/dev/null', '-p', this.projectName];

        for (const file of this.composeFiles) compose.push('-f', file);
        compose.push('--profile', 'cloud');

        return [...compose, ...args]
    }

    /**
     * @summary Executes one project-scoped canonical Compose command without a shell.
     */
    runDocker(args, label, timeout=COMMAND_TIMEOUT_MS) {
        return this.runExec('docker', this.composeArgs(args), label, {timeout})
    }

    /**
     * @summary Executes one bounded child command without retaining raw failure output.
     */
    runExec(command, args, label, {timeout=COMMAND_TIMEOUT_MS, cleanup=false} = {}) {
        if (!cleanup) this.throwIfInterrupted();

        return new Promise((resolve, reject) => {
            let settleBarrier;
            const tracked = {
                child             : null,
                rejectInterruption: null,
                settled           : false,
                settledPromise    : new Promise(settle => {
                    settleBarrier = settle
                })
            };

            if (!cleanup) this.activeCommands.add(tracked);
            tracked.rejectInterruption = () => reject(this.interrupted ||
                new RuntimeProofError('ACTIVE_COMMAND_CANCELLATION_UNRESOLVED'));

            const done = (error, stdout='') => {
                if (tracked.settled) return;
                tracked.settled = true;
                this.activeCommands.delete(tracked);
                settleBarrier();

                if (error) {
                    reject(!cleanup && this.interrupted
                        ? this.interrupted
                        : new RuntimeProofError(`${label.replaceAll(' ', '_').toUpperCase()}_FAILED`))
                } else {
                    resolve(String(stdout))
                }
            };

            try {
                tracked.child = this.execFileFn(command, args, {
                    cwd      : this.sourceRoot,
                    env      : this.composeEnv,
                    timeout,
                    maxBuffer: 8 * 1024 * 1024
                }, done)
            } catch (error) {
                done(error)
            }
        })
    }

    /**
     * @summary Terminates an active probe caller, then removes only this actor's project and volumes.
     */
    async close() {
        if (this.closed) return;
        if (this.closePromise) return this.closePromise;

        this.closePromise = this.performClose();

        return this.closePromise
    }

    /**
     * @summary Performs one serialized caller teardown and project-scoped Compose cleanup.
     * @private
     */
    async performClose() {
        if (this.closed) return;

        const errors = [];

        if (this.signalPromise || this.activeCommands.size > 0) {
            const settled = await (this.signalPromise || this.cancelActiveWork());
            if (!settled) errors.push(new RuntimeProofError('ACTIVE_COMMAND_CLEANUP_UNRESOLVED'))
        }

        if (this.activeCommands.size > 0) {
            errors.push(new RuntimeProofError('ACTIVE_COMMAND_CLEANUP_UNRESOLVED'))
        }

        if (this.activeCaller && !this.activeCaller.settled) {
            try {
                await this.disconnectCaller(this.activeCaller)
            } catch {
                this.activeCaller.child?.kill?.('SIGTERM')
            }

            try {
                await this.waitForCallerSettlement(this.activeCaller)
            } catch {
                this.activeCaller.child?.kill?.('SIGKILL');

                try {
                    await this.waitForCallerSettlement(this.activeCaller)
                } catch (error) {
                    errors.push(error)
                }
            }
        }

        if (this.activeCaller && !this.activeCaller.settled) {
            errors.push(new RuntimeProofError('CALLER_CLEANUP_UNRESOLVED'))
        }

        if (errors.length === 0 && this.observerId) {
            try {
                await this.runExec('docker', ['rm', '--force', this.observerId],
                    'remove provider proof observer', {cleanup: true})
                this.observerId = null
            } catch (error) {
                errors.push(error)
            }
        }

        if (errors.length === 0 && this.composeAttempted) {
            try {
                await this.runExec('docker', this.composeArgs([
                    'down', '--remove-orphans', '--volumes', '--timeout', '30'
                ]), 'remove provider proof project', {cleanup: true})
            } catch (error) {
                errors.push(error)
            }
        }

        if (errors.length === 0 && this.composeAttempted) {
            try {
                await this.verifyProjectRemoved()
            } catch (error) {
                errors.push(error)
            }
        }

        this.disposeSignalHandlers();
        this.closed = errors.length === 0;

        if (errors.length) throw new RuntimeProofError('CLEANUP_UNRESOLVED')
    }

    /**
     * @summary Requires a bounded zero-resource census for this exact Compose project after teardown.
     * @private
     */
    async verifyProjectRemoved() {
        const filter = `label=com.docker.compose.project=${this.projectName}`;

        for (let attempt = 0; attempt < CLEANUP_VERIFY_ATTEMPTS; attempt++) {
            const containers = (await this.runExec('docker', [
                      'ps', '--all', '--quiet', '--filter', filter
                  ], 'census provider proof containers', {cleanup: true})).trim(),
                  networks = (await this.runExec('docker', [
                      'network', 'ls', '--quiet', '--filter', filter
                  ], 'census provider proof networks', {cleanup: true})).trim(),
                  volumes = (await this.runExec('docker', [
                      'volume', 'ls', '--quiet', '--filter', filter
                  ], 'census provider proof volumes', {cleanup: true})).trim();

            if (!containers && !networks && !volumes) return;
            if (attempt === CLEANUP_VERIFY_ATTEMPTS - 1) break;

            await this.runExec('docker', this.composeArgs([
                'down', '--remove-orphans', '--volumes', '--timeout', '30'
            ]), 'retry provider proof project removal', {cleanup: true});
            await this.delayFn(CLEANUP_VERIFY_DELAY_MS)
        }

        throw new RuntimeProofError('PROJECT_RESIDUE_REMAINS')
    }
}

/**
 * @summary Parses the deliberately closed CLI surface.
 * @param {String[]} argv
 * @returns {{input: String|null}}
 */
export function parseArgs(argv) {
    const command = new Command()
        .name('providerLaneRuntimeProof')
        .description('Prove the elected provider lanes in a fresh local canonical Compose project.')
        .option('--input <file>', 'authoritative election report JSON; defaults to stdin')
        .allowExcessArguments(false)
        .exitOverride();

    command.parse(['node', 'providerLaneRuntimeProof', ...argv]);

    return {input: command.opts().input || null}
}

async function readInput(inputPath) {
    const raw = inputPath ? await readFile(path.resolve(inputPath), 'utf8') : await readFile(0, 'utf8');
    return JSON.parse(raw)
}

async function main() {
    let report;
    let result;

    try {
        const {input} = parseArgs(process.argv.slice(2));
        report = await readInput(input);
        result = await proveProviderLaneRuntime(report)
    } catch (error) {
        if (error?.code === 'commander.helpDisplayed') return;

        result = boundedErrorReceipt({
            code        : 'INPUT_PARSE_FAILED',
            verdict     : 'FAIL',
            report,
            projectName : null,
            partial     : null,
            cleanupState: 'NOT_STARTED'
        })
    }

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.stderr.write(`[provider-lane-runtime-proof] ${result.verdict}\n`);
    process.exitCode = result.verdict === 'PASS' ? 0 : 1
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    await main()
}
