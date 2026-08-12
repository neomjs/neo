import {Command}                         from 'commander';
import {AsyncLocalStorage}               from 'node:async_hooks';
import {execFile, spawn}                 from 'node:child_process';
import {createHash, randomBytes}         from 'node:crypto';
import {mkdir, readFile, realpath, stat} from 'node:fs/promises';
import path                              from 'node:path';
import {promisify}                       from 'node:util';
import {fileURLToPath, pathToFileURL}    from 'node:url';

import {
    PROVIDER_LANE_DEPLOYMENT_INPUT_ENVS,
    validateProviderLaneCompositionReceipt
} from '../diagnostics/providerLaneComposition.mjs';
import {
    buildProviderLaneCandidateSchedule,
    createProviderLanePlanDigest,
    evaluateProviderLaneElection
} from './helpers/providerLaneElectionCore.mjs';
import {writeFileAtomic} from '../../services/shared/atomicFileWrite.mjs';

const
    execFileAsync = promisify(execFile),

    CANDIDATES        = Object.freeze([1, 2, 4]),
    CHAT_SOURCE       = 'chat',
    EMBEDDING_SOURCES = Object.freeze(['knowledge-base', 'memory-core', 'orchestrator']),
    LANE_NAMES        = Object.freeze(['chat', 'embedding']),
    PLAN_SCHEMA       = 'provider-lane-election-plan.v1',
    REPORT_SCHEMA     = 'provider-lane-election-report.v1',
    WORKER_SCHEMA     = 'provider-lane-election-worker.v1',
    WORKER_SENTINEL   = 'NEO_PROVIDER_LANE_WORKER:',
    DIGEST_PATTERN    = /^sha256:[a-f0-9]{64}$/,
    REVISION_PATTERN  = /^[0-9a-f]{40}$/,
    RESPONSE_BYTE_CAP    = 1024 * 1024,
    DOCKER_TOP_BYTE_CAP  = 1024 * 1024,
    EMBEDDING_CHUNK_SIZE = 5,

    BASE_COMPOSE_FILE     = 'ai/deploy/docker-compose.yml',
    LANE_COMPOSE_FILE     = 'ai/deploy/docker-compose.provider-lanes.yml',
    COMPOSITION_ANALYZER  = 'ai/scripts/diagnostics/providerLaneComposition.mjs',
    RUNNER_ENTRYPOINT     = 'ai/scripts/benchmark/provider-lane-election.mjs',

    CHAT_ADAPTER = Object.freeze({
        id                  : 'ollama-chat-v0.32.9',
        imageDigest         : 'sha256:1685741456770df6e3cceb2a945a5f75e020f658d1701509668d6f4688f1dd3f',
        imageReference      : 'ollama/ollama:0.32.9',
        lane                : 'chat',
        modelDigest         : 'sha256:7121486771cbfe218851513210c40b35dbdee93ab1ef43fe36283c883980f0df',
        provider            : 'ollama',
        refusalErrorMessages: Object.freeze([
            'the prompt is longer than the context length currently available to the model; shorten the prompt, adjust the context length in settings, or use a model with a longer context length',
            'the input length exceeds the context length'
        ]),
        refusalStatus: 400,
        workloadKind : 'ollamaChat'
    }),
    EMBEDDING_ADAPTER = Object.freeze({
        id              : 'llama-cpp-openai-embeddings-b10380',
        imageDigest     : 'sha256:9b518883e8faab479650ec802e02c9e37c6bb21d36168509efd8fb3c87fc1648',
        imageReference  : 'ghcr.io/ggml-org/llama.cpp:server-b10380',
        lane            : 'embedding',
        modelDigest     : 'sha256:3fcd3febec8b3fd64435204db75bf0dd73b91e8d0661e0331acfe7e7c3120b85',
        provider        : 'openAiCompatible',
        refusalErrorType: 'exceed_context_size_error',
        refusalStatus   : 400,
        workloadKind    : 'openAiEmbeddings'
    }),
    CLOSED_ADAPTERS = Object.freeze({
        chat     : CHAT_ADAPTER,
        embedding: EMBEDDING_ADAPTER
    }),

    WORKLOAD_PAYLOADS = Object.freeze({
        chat: Object.freeze([
            'Provider lane simultaneous large-context chat warm fixture. '.repeat(4096),
            'Explain why durable progress and provider latency must be measured separately in two sentences.'
        ]),
        'knowledge-base': Object.freeze([
            'Knowledge Base election fixture: deterministic retrieval-shaped embedding demand. '.repeat(32)
        ]),
        'memory-core': Object.freeze([
            Object.freeze(Array.from({length: 20}, (_, index) =>
                `Memory Core WAL batch fixture ${index}: deterministic durable-memory embedding demand. `.repeat(16)
            ))
        ]),
        orchestrator: Object.freeze([
            Object.freeze(Array.from({length: 8}, (_, index) =>
                `Orchestrator recovery batch A fixture ${index}: deterministic recovery-shaped embedding demand. `.repeat(16)
            )),
            Object.freeze(Array.from({length: 8}, (_, index) =>
                `Orchestrator recovery batch B fixture ${index}: deterministic maintenance-shaped embedding demand. `.repeat(16)
            ))
        ])
    }),
    SOURCE_CONTRACT = Object.freeze({
        chat: Object.freeze({
            callKind: 'chat-queue',
            priority: 'interactive',
            role    : 'chat',
            service : 'knowledge-base',
            stage   : 'kb-ask-synthesis'
        }),
        'knowledge-base': Object.freeze({
            callKind: 'interactive-single',
            priority: 'interactive',
            role    : 'embedding',
            service : 'knowledge-base',
            stage   : 'kb-query-embedding'
        }),
        'memory-core': Object.freeze({
            callKind: 'batch-array',
            priority: 'batch',
            role    : 'embedding',
            service : 'memory-core',
            stage   : 'mc-wal-drain-embedding'
        }),
        orchestrator: Object.freeze({
            callKind: 'batch-array',
            priority: 'batch',
            role    : 'embedding',
            service : 'orchestrator',
            stage   : 'unknown'
        })
    });

/**
 * @module ai/scripts/benchmark/provider-lane-election
 * @summary Canonical disposable-plane actor for the `{1,2,4}` provider-lane election.
 *
 * The controller owns a fresh Compose project, renders every candidate through the canonical
 * provider-lane composition analyzer, launches queue-real producer-shaped workers from one dedicated exact-revision image,
 * samples the two provider containers through DeploymentRuntimeAccessService, and publishes only
 * the winning receipt's already-validated deployment inputs. It never parses Compose, discovers
 * endpoints, adapts an external plane, reads caller content, or silently supplies SLO defaults.
 *
 * Numeric joint-SLO thresholds are required in a versioned plan. They are policy inputs, not facts
 * this runner is allowed to invent. Context-limit probes run once per candidate and lane outside the
 * timed workload windows so the proof does not contaminate the latency/throughput measurement.
 *
 * @see https://github.com/neomjs/neo/issues/17024
 * @see ai/scripts/diagnostics/providerLaneComposition.mjs
 * @see ai/scripts/benchmark/helpers/providerLaneElectionCore.mjs
 */

/**
 * @summary Returns one stable SHA-256 digest for JSON-compatible evidence.
 * @param {*} value JSON-compatible value.
 * @returns {String}
 */
export function digestProviderLaneValue(value) {
    return `sha256:${createHash('sha256').update(stableSerialize(value)).digest('hex')}`
}

/**
 * @summary Validates the exact caller-owned plan surface without creating SLO or workload defaults.
 * @param {Object} plan Candidate run plan.
 * @returns {Object} Bounded normalized plan.
 */
export function validateProviderLaneRunPlan(plan) {
    requireExactKeys(plan, [
        'blocks',
        'candidateDeploymentInputs',
        'contextProbeTimeoutMs',
        'resourceSampling',
        'revision',
        'schemaVersion',
        'slo',
        'trialTimeoutMs'
    ], 'provider-lane run plan');

    if (plan.schemaVersion !== PLAN_SCHEMA || !REVISION_PATTERN.test(plan.revision ?? '')) {
        throw new Error(`provider-lane run plan requires ${PLAN_SCHEMA} and one lowercase full revision SHA`)
    }
    if (!Number.isInteger(plan.blocks) || plan.blocks <= 0 ||
        !Number.isInteger(plan.contextProbeTimeoutMs) || plan.contextProbeTimeoutMs <= 0 ||
        !Number.isInteger(plan.trialTimeoutMs) || plan.trialTimeoutMs <= 0) {
        throw new Error('provider-lane run plan requires positive integer blocks and explicit context/trial timeouts')
    }

    const candidateDeploymentInputs = validateCandidateDeploymentInputs(plan.candidateDeploymentInputs);

    return {
        blocks               : plan.blocks,
        candidateDeploymentInputs,
        contextProbeTimeoutMs: plan.contextProbeTimeoutMs,
        resourceSampling     : structuredClone(plan.resourceSampling),
        revision             : plan.revision,
        schemaVersion        : PLAN_SCHEMA,
        slo                  : structuredClone(plan.slo),
        trialTimeoutMs       : plan.trialTimeoutMs
    }
}

/**
 * @summary Validates exact `{1,2,4}` envelopes against the composition analyzer's exported env map.
 * @param {Object[]} rows Candidate envelopes.
 * @returns {Object[]} Normalized rows.
 */
function validateCandidateDeploymentInputs(rows) {
    if (!Array.isArray(rows) || rows.length !== CANDIDATES.length) {
        throw new Error('provider-lane run plan requires exactly three candidate deployment envelopes')
    }

    const expectedKeys = Object.keys(PROVIDER_LANE_DEPLOYMENT_INPUT_ENVS).sort(),
          sorted       = [...rows].sort((left, right) => left?.candidate - right?.candidate);

    if (sorted.some((row, index) => row?.candidate !== CANDIDATES[index])) {
        throw new Error('provider-lane deployment envelopes require candidates 1, 2, and 4 exactly once')
    }

    return sorted.map(row => {
        requireExactKeys(row, ['candidate', 'deploymentInputs'], `candidate ${row.candidate}`);
        requireExactKeys(row.deploymentInputs, expectedKeys, `candidate ${row.candidate}.deploymentInputs`);

        const deploymentInputs = {};

        for (const key of expectedKeys) {
            const input = row.deploymentInputs[key];

            requireExactKeys(input, ['env', 'value'], `candidate ${row.candidate}.deploymentInputs.${key}`);
            if (input.env !== PROVIDER_LANE_DEPLOYMENT_INPUT_ENVS[key] ||
                !Number.isFinite(input.value) || input.value <= 0) {
                throw new Error(`candidate ${row.candidate} has an invalid canonical deployment input '${key}'`)
            }
            deploymentInputs[key] = {env: input.env, value: input.value}
        }

        if (deploymentInputs.embeddingParallelSlots.value !== row.candidate) {
            throw new Error(`candidate ${row.candidate} deployment envelope changed its embedding slot value`)
        }

        return {candidate: row.candidate, deploymentInputs}
    })
}

/**
 * @summary Validates a canonical composition receipt and selects only the closed exact-image adapters.
 * @param {Object} receipt Canonical provider-lane composition receipt.
 * @returns {Object} Lane adapter map.
 */
export function resolveProviderLaneAdapters(receipt) {
    const validation = validateProviderLaneCompositionReceipt(receipt);

    if (!validation.valid) {
        const error = new Error('provider-lane composition receipt failed canonical validation');
        error.code  = 'COMPOSITION_RECEIPT_INVALID';
        throw error
    }

    return Object.fromEntries(LANE_NAMES.map(laneName => {
        const lane    = receipt.lanes[laneName],
              adapter = CLOSED_ADAPTERS[laneName],
              kind    = lane.endpoints?.workload?.kind;

        if (lane.provider !== adapter.provider || lane.image?.reference !== adapter.imageReference ||
            lane.image?.digest !== adapter.imageDigest || lane.model?.digest !== adapter.modelDigest ||
            kind !== adapter.workloadKind) {
            const error = new Error(`provider-lane ${laneName} receipt does not match a closed exact-image adapter`);
            error.code  = 'UNSUPPORTED_PROVIDER_ADAPTER';
            throw error
        }

        return [laneName, adapter]
    }))
}

/**
 * @summary Projects one validated composition receipt into the pure core's immutable profile.
 * @param {Object} options
 * @param {String} options.compositionReceiptDigest Digest of the exact archived receipt bytes.
 * @param {Object} options.receipt Validated composition receipt.
 * @returns {Object}
 */
export function createProviderLaneCandidateProfile({compositionReceiptDigest, receipt}) {
    const adapters  = resolveProviderLaneAdapters(receipt),
          candidate = receipt.lanes.embedding.parallelSlots;

    if (!CANDIDATES.includes(candidate)) {
        throw new Error(`provider-lane composition receipt selected unsupported candidate ${candidate}`)
    }

    return {
        compositionReceiptDigest,
        compositionSchemaVersion: receipt.schemaVersion,
        embeddingSlots          : candidate,
        lanes                   : Object.fromEntries(LANE_NAMES.map(laneName => {
            const lane = receipt.lanes[laneName];

            return [laneName, {
                baseUrl                     : lane.baseUrl,
                contextTokensPerSlotRequired: lane.contextTokensPerSlotRequired,
                cpuCores                    : lane.cpuCores,
                endpointDigest              : digestProviderLaneValue(lane.endpoints),
                imageDigest                 : lane.image.digest,
                imageReference              : lane.image.reference,
                memoryBytes                 : lane.memoryBytes,
                modelCoordinate             : lane.model.coordinate,
                modelDigest                 : lane.model.digest,
                modelDigestKind             : lane.model.digestKind,
                modelId                     : lane.model.id,
                parallelism                 : lane.parallelSlots,
                protocolAdapter             : adapters[laneName].id,
                provider                    : lane.provider,
                serviceKey                  : lane.serviceKey,
                totalContextTokens          : lane.totalContextTokens
            }]
        })),
        roleMapDigest : digestProviderLaneValue(receipt.roles),
        totalResources: {
            cpuCores   : receipt.envelope.total.cpuCores,
            memoryBytes: receipt.envelope.total.memoryBytes
        }
    }
}

/**
 * @summary Parses a bounded provider response into the runner-owned context-refusal vocabulary.
 * @param {Object} options
 * @param {Object} options.adapter Closed exact-image adapter.
 * @param {String} options.body Raw bounded response body.
 * @param {Number} options.status HTTP status.
 * @returns {{observedOutputTokens: Number, responseBodyDigest: String, responseClass: String, transportStatus: Number}}
 */
export function classifyProviderLaneProbeResponse({adapter, body, status}) {
    if (!Object.values(CLOSED_ADAPTERS).includes(adapter) || !Number.isInteger(status) ||
        typeof body !== 'string' || Buffer.byteLength(body) > 1024 * 1024) {
        throw new Error('provider-lane probe requires a closed adapter and bounded raw response')
    }

    const parsed       = safeJson(body),
          errorType    = findProviderErrorType(parsed),
          errorMessage = findProviderErrorMessage(parsed),
          refused      = status === adapter.refusalStatus && (
              adapter.refusalErrorType
                  ? errorType === adapter.refusalErrorType
                  : adapter.refusalErrorMessages?.includes(errorMessage)
          ),
          completed = status >= 200 && status < 300;

    return {
        observedOutputTokens: completed ? inferObservedOutput(parsed) : 0,
        responseBodyDigest  : digestRaw(body),
        responseClass       : refused ? 'context-limit-refusal' : completed ? 'completed' : 'provider-error',
        transportStatus     : status
    }
}

/**
 * @summary Parses the Engine API's bounded `docker top -eo pid,rss` payload into aggregate process RSS.
 *
 * RSS is summed per process exactly as the Linux `ps` contract reports it. Shared pages may therefore
 * appear once per process, but the definition stays identical across every candidate. Docker cgroup-v2
 * `memory.stat.anon` is deliberately rejected: it excludes resident file-backed model mappings and is
 * not process RSS.
 *
 * @param {Object|String} payload Docker top JSON payload or its bounded serialized form.
 * @returns {Number} Aggregate process RSS bytes.
 */
export function parseProviderLaneDockerTopRss(payload) {
    const parsed    = typeof payload === 'string' ? safeJson(payload) : payload,
          titles    = parsed?.Titles,
          processes = parsed?.Processes,
          pidIndex  = Array.isArray(titles) ? titles.indexOf('PID') : -1,
          rssIndex  = Array.isArray(titles) ? titles.indexOf('RSS') : -1;

    if (pidIndex < 0 || rssIndex < 0 || !Array.isArray(processes) || processes.length === 0) {
        throw Object.assign(new Error('provider-lane Docker top receipt requires PID and RSS rows'), {
            code: 'DOCKER_TOP_RSS_INVALID'
        })
    }

    let totalKiB = 0;

    for (const row of processes) {
        const pid = Number(row?.[pidIndex]),
              rss = Number(row?.[rssIndex]);

        if (!Number.isSafeInteger(pid) || pid <= 0 || !Number.isSafeInteger(rss) || rss < 0 ||
            !Number.isSafeInteger(totalKiB + rss)) {
            throw Object.assign(new Error('provider-lane Docker top receipt contains an invalid PID/RSS row'), {
                code: 'DOCKER_TOP_RSS_INVALID'
            })
        }
        totalKiB += rss
    }

    const totalBytes = totalKiB * 1024;

    if (!Number.isSafeInteger(totalBytes)) {
        throw Object.assign(new Error('provider-lane aggregate process RSS exceeds the safe receipt range'), {
            code: 'DOCKER_TOP_RSS_INVALID'
        })
    }

    return totalBytes
}

/**
 * @summary Preserves truthful zero CPU while retaining the shared Docker delta calculator for active samples.
 * @param {Object} stats Raw non-streaming Docker stats.
 * @param {Function} calculateDockerCpuPercent Canonical Docker CPU calculator.
 * @returns {Number|null}
 */
export function calculateProviderLaneDockerCpuPercent(stats, calculateDockerCpuPercent) {
    const calculated = calculateDockerCpuPercent(stats);

    if (Number.isFinite(calculated)) return calculated;

    const cpuStats    = stats?.cpu_stats || {},
          preCpuStats = stats?.precpu_stats || {},
          cpuDelta    = Number(cpuStats.cpu_usage?.total_usage) - Number(preCpuStats.cpu_usage?.total_usage),
          systemDelta = Number(cpuStats.system_cpu_usage) - Number(preCpuStats.system_cpu_usage);

    return cpuDelta === 0 && Number.isFinite(systemDelta) && systemDelta > 0 ? 0 : null
}

/**
 * @summary Parses one Docker CLI endpoint and admits only a local absolute Unix socket.
 * @param {String} endpoint Docker Engine endpoint.
 * @returns {String} Absolute socket path before canonicalization.
 */
export function parseProviderLaneDockerEndpoint(endpoint) {
    let parsed;

    try {
        parsed = new URL(endpoint)
    } catch {
        parsed = null
    }

    if (!parsed || parsed.protocol !== 'unix:' || parsed.hostname || parsed.username || parsed.password ||
        parsed.search || parsed.hash || !parsed.pathname.startsWith('/')) {
        throw Object.assign(new Error('provider-lane election requires one local Unix Docker endpoint'), {
            code: 'DOCKER_ENDPOINT_NOT_LOCAL_UNIX'
        })
    }

    const socketPath = fileURLToPath(new URL(`file://${parsed.pathname}`));

    if (!path.isAbsolute(socketPath)) {
        throw Object.assign(new Error('provider-lane Docker socket path must be absolute'), {
            code: 'DOCKER_ENDPOINT_NOT_LOCAL_UNIX'
        })
    }

    return socketPath
}

/**
 * @summary Resolves and verifies the one Docker daemon authority used by mutation and observation.
 * @param {Object} [options]
 * @param {Function} [options.inspectEndpoint] Read-only effective Docker-context inspector.
 * @param {Function} [options.realpathFn] Filesystem canonicalizer.
 * @param {Function} [options.statFn] Filesystem stat reader.
 * @returns {Promise<Readonly<{endpoint: String, socketPath: String}>>}
 */
export async function resolveProviderLaneDockerAuthority({
    inspectEndpoint = async () => {
        const env = {
            HOME: process.env.HOME,
            PATH: process.env.PATH
        };

        for (const key of ['DOCKER_CONFIG', 'DOCKER_CONTEXT', 'DOCKER_HOST']) {
            if (process.env[key]) env[key] = process.env[key]
        }

        const {stdout} = await execFileAsync('docker', [
            'context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}'
        ], {env, maxBuffer: 1024 * 1024});
        return JSON.parse(stdout.trim())
    },
    realpathFn = realpath,
    statFn = stat
} = {}) {
    const socketPath = parseProviderLaneDockerEndpoint(await inspectEndpoint()),
          canonical  = await realpathFn(socketPath),
          metadata   = await statFn(canonical);

    if (!path.isAbsolute(canonical) || !metadata.isSocket()) {
        throw Object.assign(new Error('provider-lane Docker endpoint does not resolve to a Unix socket'), {
            code: 'DOCKER_ENDPOINT_NOT_LOCAL_UNIX'
        })
    }

    return Object.freeze({endpoint: `unix://${canonical}`, socketPath: canonical})
}

/**
 * @summary Creates one idempotent cleanup owner for normal completion and process interruption.
 * @param {Object} options
 * @param {Function} options.teardown Bounded disposable-project teardown.
 * @returns {Function} Idempotent asynchronous cleanup function.
 */
export function createProviderLaneCleanup({teardown}) {
    if (typeof teardown !== 'function') throw new TypeError('provider-lane cleanup requires teardown');

    let cleanupPromise;

    return () => {
        cleanupPromise ??= Promise.resolve().then(teardown);
        return cleanupPromise
    }
}

/**
 * @summary Routes SIGINT/SIGTERM through the run AbortController and its idempotent cleanup owner.
 * @param {Object} options
 * @param {Function} options.cleanup Idempotent cleanup function.
 * @param {AbortController} options.controller Active run controller.
 * @param {Object} [options.processTarget=process] EventEmitter-compatible process boundary.
 * @returns {Function} Listener disposer.
 */
export function installProviderLaneSignalHandlers({cleanup, controller, processTarget = process}) {
    if (typeof cleanup !== 'function' || !controller?.signal) {
        throw new TypeError('provider-lane signal routing requires cleanup and an AbortController')
    }

    const onSignal = signal => {
        if (!controller.signal.aborted) {
            const error = new Error(`provider-lane election interrupted by ${signal}`);
            error.code  = 'PROVIDER_LANE_INTERRUPTED';
            controller.abort(error);
            void cleanup().catch(() => {})
        }
    },
          onSigint  = () => onSignal('SIGINT'),
          onSigterm = () => onSignal('SIGTERM');

    processTarget.on('SIGINT', onSigint);
    processTarget.on('SIGTERM', onSigterm);

    return () => {
        processTarget.off('SIGINT', onSigint);
        processTarget.off('SIGTERM', onSigterm)
    }
}

/**
 * @summary Keeps signal ownership through teardown and refuses an authoritative return after interruption.
 * @param {Object} options
 * @param {Function} options.cleanup Idempotent cleanup owner.
 * @param {AbortController} options.controller Active run controller.
 * @param {Function} options.dispose Signal-listener disposer.
 * @returns {Promise<void>}
 */
export async function completeProviderLaneCleanup({cleanup, controller, dispose}) {
    try {
        await cleanup()
    } finally {
        dispose()
    }

    if (controller.signal.aborted) throw controller.signal.reason
}

/**
 * @summary Projects a pure measured winner onto its already-validated deployment envelope.
 * @param {Object} options
 * @returns {{deploymentInputs: Object|null, status: String}} Non-authoritative bounded outcome.
 */
export function projectProviderLaneOutcome({election, receipts}) {
    if (!election || !Array.isArray(election.candidates) || !Array.isArray(receipts) ||
        receipts.length !== CANDIDATES.length) {
        throw new Error('provider-lane outcome projection requires a complete measured election')
    }

    const sortedReceipts = [...receipts].sort((left, right) => left?.candidate - right?.candidate);

    if (sortedReceipts.some((entry, index) => entry?.candidate !== CANDIDATES[index] ||
        !DIGEST_PATTERN.test(entry?.compositionReceiptDigest ?? '') ||
        entry?.receipt?.lanes?.embedding?.parallelSlots !== entry.candidate)) {
        throw new Error('provider-lane outcome projection requires exact validated candidate receipts')
    }
    sortedReceipts.forEach(entry => resolveProviderLaneAdapters(entry.receipt));

    const passing = election.candidates
              .filter(candidate => candidate?.status === 'PASS')
              .map(candidate => candidate.candidate)
              .sort((left, right) => left - right),
          winner = election.winnerCandidate,
          expectedWinner = passing[0] ?? null,
          receipt = winner === null ? null : sortedReceipts.find(item => item.candidate === winner);

    if (winner !== expectedWinner || (winner !== null && (!CANDIDATES.includes(winner) || !receipt))) {
        throw new Error('provider-lane outcome projection received an incoherent measured winner')
    }

    return {
        deploymentInputs   : receipt ? structuredClone(receipt.receipt.deploymentInputs) : null,
        selectedComposition: receipt ? projectSelectedProviderLaneComposition(receipt) : null,
        status             : winner === null ? 'NO_ELECTION' : 'ELECTED'
    }
}

/**
 * @summary Projects the self-describing immutable composition selected by the measured winner.
 *
 * The profile digest proves which archived receipt was measured, but downstream generation identity
 * cannot recover model coordinates, endpoints, role routing, or the fixed resource envelope from a
 * digest alone. This projection is therefore copied from the same already-validated receipt as the
 * deployment inputs. It contains no operator secrets and never re-derives configuration.
 *
 * @param {Object} receiptEntry Validated archived candidate receipt wrapper.
 * @returns {Object} Allowlisted immutable composition artifact.
 */
function projectSelectedProviderLaneComposition(receiptEntry) {
    const receipt = receiptEntry.receipt;

    resolveProviderLaneAdapters(receipt);

    return {
        candidate               : receiptEntry.candidate,
        compositionReceiptDigest: receiptEntry.compositionReceiptDigest,
        envelope                : structuredClone(receipt.envelope),
        lanes                   : Object.fromEntries(LANE_NAMES.map(laneName => {
            const lane = receipt.lanes[laneName];

            return [laneName, {
                baseUrl                     : lane.baseUrl,
                contextTokensPerSlotRequired: lane.contextTokensPerSlotRequired,
                cpuCores                    : lane.cpuCores,
                endpoints                   : structuredClone(lane.endpoints),
                image                       : structuredClone(lane.image),
                memoryBytes                 : lane.memoryBytes,
                model                       : structuredClone(lane.model),
                parallelSlots               : lane.parallelSlots,
                provider                    : lane.provider,
                serviceKey                  : lane.serviceKey,
                totalContextTokens          : lane.totalContextTokens
            }]
        })),
        roles        : structuredClone(receipt.roles),
        schemaVersion: receipt.schemaVersion
    }
}

/**
 * @summary Finalizes live-controller evidence without exposing an authority-minting public seam.
 * @private
 */
function finalizeProviderLaneElection({artifacts, election, head, projectName, receipts}) {
    if (!REVISION_PATTERN.test(head ?? '') || typeof projectName !== 'string' || !projectName) {
        throw new Error('provider-lane finalizer requires an exact live controller identity')
    }

    const outcome = projectProviderLaneOutcome({election, receipts});

    return {
        artifacts: structuredClone(artifacts),
        authority: {
            authoritative: true,
            evidenceClass: 'canonical-disposable-plane',
            reason       : 'complete validated matrix on a run-owned disposable Compose project'
        },
        deploymentInputs   : outcome.deploymentInputs,
        election,
        projectName,
        repositoryHead     : head,
        schemaVersion      : REPORT_SCHEMA,
        selectedComposition: outcome.selectedComposition,
        status             : outcome.status
    }
}

/**
 * @summary Creates a bounded incomplete report which can never expose deployment inputs.
 * @param {Object} options
 * @returns {Object}
 */
export function createIncompleteProviderLaneReport({code = 'RUN_ABORTED', measuredHead = null, projectName = null} = {}) {
    return {
        artifacts: {candidateReceipts: []},
        authority: {
            authoritative: false,
            evidenceClass: 'incomplete',
            reason       : String(code).slice(0, 120)
        },
        deploymentInputs   : null,
        election           : null,
        projectName,
        repositoryHead     : REVISION_PATTERN.test(measuredHead ?? '') ? measuredHead : null,
        schemaVersion      : REPORT_SCHEMA,
        selectedComposition: null,
        status             : 'INCOMPLETE'
    }
}

/**
 * @summary Runs one queue-real producer-shaped worker inside the dedicated exact-revision image.
 * @param {Object} options
 * @param {Object} options.receipt Validated candidate receipt.
 * @param {String} options.source Closed workload source.
 * @returns {Promise<Object>} Bounded worker lifecycle receipt.
 */
export async function runProviderLaneWorkloadWorker({receipt, source}) {
    const contract = SOURCE_CONTRACT[source],
          payloads = WORKLOAD_PAYLOADS[source];

    if (!contract || !payloads) {
        throw new Error(`provider-lane worker received unknown source '${source}'`)
    }

    resolveProviderLaneAdapters(receipt);

    const recorder = createInMemoryProviderRecorder(),
          results  = source === CHAT_SOURCE
              ? await runChatWorker({contract, payloads, receipt, recorder})
              : await runEmbeddingWorker({contract, payloads, receipt, recorder, source}),
          operations         = recorder.project(),
          expectedOperations = countExpectedProviderOperations(source, payloads);

    if (results.length !== payloads.length || operations.length < payloads.length ||
        operations.length > expectedOperations) {
        throw new Error(`provider-lane ${source} worker observed ${operations.length}/${expectedOperations} provider lifecycles`)
    }

    return {
        callKind: contract.callKind,
        operations,
        results : results.map((result, index) => {
            const kind        = source === CHAT_SOURCE ? 'chat' : 'embedding',
                  outputCount = result.status === 'fulfilled'
                      ? countProviderLaneOperationOutput(result.value, kind)
                      : 0;

            return {
                callId       : `${source}-${index}`,
                completedAtMs: result.completedAtMs,
                demandAtMs   : result.demandAtMs,
                outcome      : classifyProviderLaneOperationResult(result, {
                    kind               : source === CHAT_SOURCE ? 'chat' : 'embedding',
                    expectedOutputCount: source === CHAT_SOURCE
                        ? 1
                        : Array.isArray(payloads[index]) ? payloads[index].length : 1
                }),
                outputCount
            }
        }),
        schemaVersion: WORKER_SCHEMA,
        source
    }
}

/**
 * @summary Runs one receipt-bound context observation and optional over-limit probe inside the network.
 * @param {Object} options
 * @param {Boolean} options.includeOverLimit Whether to run the capacity refusal request.
 * @param {Object} options.receipt Validated candidate receipt.
 * @param {Number} options.timeoutMs Explicit request timeout.
 * @returns {Promise<Object>}
 */
export async function runProviderLaneContextWorker({includeOverLimit, receipt, timeoutMs}) {
    const adapters = resolveProviderLaneAdapters(receipt);

    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
        throw new Error('provider-lane context worker requires an explicit positive timeout')
    }

    if (includeOverLimit) {
        await warmChatLane({adapter: adapters.chat, lane: receipt.lanes.chat, timeoutMs})
    }

    const startedAtMs  = Date.now(),
          observations = Object.fromEntries(await Promise.all(LANE_NAMES.map(async laneName => [
              laneName,
              await observeLaneContext({adapter: adapters[laneName], lane: receipt.lanes[laneName], timeoutMs})
          ]))),
          lanes = {};

    for (const laneName of LANE_NAMES) {
        const observation = observations[laneName],
              lane        = receipt.lanes[laneName];

        lanes[laneName] = {
            observedContextTokensPerSlot: observation.contextTokensPerSlot,
            parallelism                 : observation.parallelism,
            resident                    : observation.resident
        };

        if (includeOverLimit) {
            lanes[laneName].overLimitProbe = await runOverLimitProbe({
                adapter                     : adapters[laneName],
                lane,
                observedContextTokensPerSlot: observation.contextTokensPerSlot,
                timeoutMs
            })
        }
    }

    return {
        completedAtMs: Date.now(),
        lanes,
        schemaVersion: WORKER_SCHEMA,
        startedAtMs
    }
}

/**
 * @summary Establishes one explicit pre-trial chat residency state on the disposable lane.
 * @param {Object} options
 * @param {Object} options.receipt Validated candidate receipt.
 * @param {Boolean} options.resident Requested pre-trial state.
 * @param {Number} options.timeoutMs Explicit request timeout.
 * @returns {Promise<Object>} Bounded preparation receipt.
 */
export async function runProviderLanePreparationWorker({receipt, resident, timeoutMs}) {
    const adapters    = resolveProviderLaneAdapters(receipt),
          lane        = receipt.lanes.chat,
          startedAtMs = Date.now();

    if (typeof resident !== 'boolean' || !Number.isInteger(timeoutMs) || timeoutMs <= 0) {
        throw new Error('provider-lane preparation worker requires explicit residency and timeout')
    }

    if (resident) {
        await warmChatLane({adapter: adapters.chat, lane, timeoutMs})
    } else {
        const response = await fetchBounded(lane.endpoints.workload.url, {
            body  : JSON.stringify({keep_alive: 0, messages: [], model: lane.model.id, stream: false}),
            method: lane.endpoints.workload.method,
            timeoutMs
        });

        if (response.status < 200 || response.status >= 300) {
            throw Object.assign(new Error('provider-lane chat unload failed'), {code: 'CHAT_UNLOAD_FAILED'})
        }
    }

    return {
        completedAtMs: Date.now(),
        resident,
        schemaVersion: WORKER_SCHEMA,
        startedAtMs
    }
}

/**
 * @summary Runs the real OpenAI-compatible embedding queue in one source process.
 * @private
 */
async function runEmbeddingWorker({contract, payloads, receipt, recorder, source}) {
    await import('../../../src/Neo.mjs');
    await import('../../../src/core/_export.mjs');

    const [{default: aiConfig}, {default: TextEmbeddingService}] = await Promise.all([
        source === 'knowledge-base'
            ? import('../../mcp/server/knowledge-base/config.mjs')
            : source === 'memory-core'
                ? import('../../mcp/server/memory-core/config.mjs')
                : import('../../config.mjs'),
        import('../../services/memory-core/TextEmbeddingService.mjs')
    ]);

    assertProviderLaneWorkerConfig({aiConfig, receipt, source});

    return Promise.all(payloads.map((payload, index) => observeProviderLaneSourceCall({
        callId  : `${source}-${index}`,
        callback: () => invokeProviderLaneEmbeddingSource({
            embeddingService: TextEmbeddingService,
            options         : {
                operationLabel          : `provider-lane-election-${contract.service}-${index}`,
                operationStage          : contract.stage,
                providerActivityRecorder: recorder,
                service                 : contract.service
            },
            provider: aiConfig.embeddingProvider,
            payload,
            source
        }),
        recorder
    })))
}

/**
 * @summary Invokes the source-owned interactive or batch scheduler seam without changing its payload.
 * @param {Object} options
 * @returns {Promise<*>} Provider result.
 */
export function invokeProviderLaneEmbeddingSource({embeddingService, options, payload, provider, source}) {
    const contract = SOURCE_CONTRACT[source];

    if (!contract || contract.role !== 'embedding' || !embeddingService) {
        throw new Error(`provider-lane embedding source '${source}' has no closed scheduler contract`)
    }
    if (contract.callKind === 'interactive-single') {
        if (typeof payload !== 'string') throw new Error('provider-lane interactive embedding payload must be one string');
        return embeddingService.embedText(payload, provider, options)
    }
    if (contract.callKind === 'batch-array') {
        if (!Array.isArray(payload) || payload.length < 2 || payload.some(text => typeof text !== 'string')) {
            throw new Error('provider-lane batch embedding payload must contain multiple strings')
        }
        return embeddingService.embedTexts(payload, provider, options)
    }
    throw new Error(`provider-lane embedding source '${source}' has an unsupported scheduler contract`)
}

/**
 * @summary Runs the real capacity-1 chat queue in one source process.
 * @private
 */
async function runChatWorker({contract, payloads, receipt, recorder}) {
    await import('../../../src/Neo.mjs');
    await import('../../../src/core/_export.mjs');

    const [
        {default: aiConfig},
        {buildChatModel},
        {buildAskChatModelOptions, buildAskProviderConfigs}
    ] = await Promise.all([
        import('../../mcp/server/knowledge-base/config.mjs'),
        import('../../provider/buildChatModel.mjs'),
        import('../../services/knowledge-base/SearchService.mjs')
    ]);

    const providerConfigs = buildAskProviderConfigs(aiConfig),
          options         = buildAskChatModelOptions(aiConfig, providerConfigs);

    assertProviderLaneWorkerConfig({
        aiConfig,
        providerConfig: providerConfigs.ollamaConfig,
        receipt,
        source        : CHAT_SOURCE
    });

    const model = buildChatModel({
        ...options,
        providerActivityRecorder: recorder,
        providerActivityService : contract.service
    });

    if (!model) throw new Error('provider-lane chat worker could not construct the configured model');

    const ask = aiConfig.askSynthesis;

    return Promise.all(payloads.map((text, index) => observeProviderLaneSourceCall({
        callId  : `${CHAT_SOURCE}-${index}`,
        callback: () => model.generateContent(text, {
            operationLabel  : `provider-lane-election-kb-ask-${index}`,
            operationStage  : contract.stage,
            priority        : contract.priority,
            reasoning_effort: ask.reasoningEffort || undefined,
            timeoutMs       : ask.timeoutMs
        }),
        recorder
    })))
}

/**
 * @summary Captures one caller-visible source operation around every provider lifecycle it creates.
 * @param {Object} options
 * @param {String} options.callId Bounded source-call identity.
 * @param {Function} options.callback Source-owned provider call.
 * @param {Object} options.recorder In-memory lifecycle recorder.
 * @returns {Promise<Object>} Settled result with caller demand/completion timestamps.
 * @private
 */
async function observeProviderLaneSourceCall({callId, callback, recorder}) {
    const demandAtMs = Date.now();

    try {
        const value = await recorder.withCall(callId, callback);

        return {completedAtMs: Math.max(Date.now(), demandAtMs + 1), demandAtMs, status: 'fulfilled', value}
    } catch (reason) {
        return {completedAtMs: Math.max(Date.now(), demandAtMs + 1), demandAtMs, reason, status: 'rejected'}
    }
}

/**
 * @summary Binds an internal worker's resolved provider leaves to the exact validated receipt.
 * @param {Object} options
 * @param {Object} options.aiConfig Resolved service config.
 * @param {Object} [options.providerConfig] Canonical resolved ask provider config.
 * @param {Object} options.receipt Validated composition receipt.
 * @param {String} options.source Closed producer source.
 * @returns {void}
 */
export function assertProviderLaneWorkerConfig({aiConfig, providerConfig, receipt, source}) {
    resolveProviderLaneAdapters(receipt);

    if (source === CHAT_SOURCE) {
        const ask  = aiConfig.askSynthesis,
              lane = receipt.lanes.chat;

        if (!providerConfig || ask.provider !== lane.provider || ask.model !== lane.model.id ||
            providerConfig.host !== lane.baseUrl || providerConfig.model !== lane.model.id || ask.apiKey) {
            throw Object.assign(new Error('provider-lane chat worker config differs from its exact receipt'), {
                code: 'WORKER_CONFIG_MISMATCH'
            })
        }
        return
    }

    const lane = receipt.lanes.embedding;

    if (!EMBEDDING_SOURCES.includes(source) || aiConfig.embeddingProvider !== lane.provider ||
        aiConfig.openAiCompatible.host !== lane.baseUrl ||
        aiConfig.openAiCompatible.embeddingModel !== lane.model.id ||
        aiConfig.openAiCompatible.batchEmbeddingChunkSize !== EMBEDDING_CHUNK_SIZE ||
        aiConfig.openAiCompatible.apiKey) {
        throw Object.assign(new Error('provider-lane embedding worker config differs from its exact receipt'), {
            code: 'WORKER_CONFIG_MISMATCH'
        })
    }
}

/**
 * @summary Reduces one caller-visible provider result to completed/error/refusal without retaining content.
 * @param {PromiseSettledResult<*>} result Settled source operation.
 * @param {Object} expected Closed output contract.
 * @returns {'completed'|'error'|'unexpected-refusal'}
 */
export function classifyProviderLaneOperationResult(result, {expectedOutputCount, kind}) {
    if (result?.status === 'fulfilled') {
        return countProviderLaneOperationOutput(result.value, kind) === expectedOutputCount ? 'completed' : 'error'
    }
    if (result?.status !== 'rejected') return 'error';

    return isProviderLaneUnexpectedRefusal(result.reason) ? 'unexpected-refusal' : 'error'
}

/**
 * @summary Counts only non-empty finite embedding vectors or one non-empty chat response.
 * @param {*} value Provider result.
 * @param {'chat'|'embedding'} kind Result kind.
 * @returns {Number}
 * @private
 */
function countProviderLaneOperationOutput(value, kind) {
    if (kind === 'chat') {
        try {
            const text = value?.response?.text?.();
            return typeof text === 'string' && text.length > 0 ? 1 : 0
        } catch {
            return 0
        }
    }

    const vectors = Array.isArray(value?.[0]) ? value : [value];

    return vectors.length > 0 && vectors.every(vector =>
        Array.isArray(vector) && vector.length > 0 && vector.every(Number.isFinite)
    ) ? vectors.length : 0
}

/**
 * @summary Classifies only closed provider HTTP 4xx error prefixes as unexpected refusals.
 * @param {*} error Rejected provider error.
 * @returns {Boolean}
 * @private
 */
function isProviderLaneUnexpectedRefusal(error) {
    for (let current = error, depth = 0; current && depth <= 4; current = current.cause, depth++) {
        const message = typeof current?.message === 'string' ? current.message : '';

        if (/^(?:Ollama API error:|OpenAI-Compatible API error:) 4\d\d\b/.test(message) ||
            /^openAiCompatible embedding error HTTP 4\d\d:/.test(message)) {
            return true
        }
    }

    return false
}

/**
 * @summary Creates a synchronous recorder implementing the shipped provider lifecycle contract.
 * @returns {Object}
 * @private
 */
function createInMemoryProviderRecorder() {
    const callContext = new AsyncLocalStorage(),
          rows        = new Map();
    let   nextId = 0;

    return {
        beginProviderActivity(entry) {
            const callId = callContext.getStore(),
                  id     = `worker-activity-${nextId++}`;

            if (typeof callId !== 'string') {
                throw new Error('provider-lane activity began outside a source-call boundary')
            }

            rows.set(id, {...entry, callId, id, startedAt: null, completedAt: null, success: null});
            return id
        },
        startProviderActivity(id, startedAt) {
            const row = rows.get(id);
            if (row) row.startedAt = startedAt
        },
        refineProviderActivity(id, activity) {
            const row = rows.get(id);
            if (row && Object.hasOwn(activity, 'model')) row.model = activity.model
        },
        completeProviderActivity(id, outcome) {
            const row = rows.get(id);
            if (row) Object.assign(row, {completedAt: outcome.completedAt, success: outcome.success === true})
        },
        project() {
            return [...rows.values()].map(row => ({
                callId             : row.callId,
                completedAtMs      : row.completedAt,
                enqueuedAtMs       : row.enqueuedAt,
                failureStage       : row.success ? null : 'provider',
                id                 : row.id,
                model              : row.model,
                operationStage     : row.operationStage,
                outcome            : row.success ? 'completed' : 'error',
                priority           : row.priority,
                provider           : row.provider,
                providerStartedAtMs: row.startedAt,
                queueDisposition   : row.queueDisposition,
                role               : row.role,
                service            : row.service
            }))
        },
        withCall(callId, callback) {
            if (!/^(?:chat|knowledge-base|memory-core|orchestrator)-\d+$/.test(callId) ||
                typeof callback !== 'function') {
                throw new Error('provider-lane recorder requires one bounded source-call identity')
            }

            return callContext.run(callId, callback)
        }
    }
}

/**
 * @summary Ensures the native chat model is resident before reading `/api/ps`.
 * @private
 */
async function warmChatLane({adapter, lane, timeoutMs}) {
    const body = JSON.stringify({
        messages: [{content: 'Reply with OK.', role: 'user'}],
        model   : lane.model.id,
        options : {num_predict: 1, temperature: 0},
        stream  : false
    });
    const response = await fetchBounded(lane.endpoints.workload.url, {
        body,
        method   : lane.endpoints.workload.method,
        timeoutMs
    });

    if (response.status < 200 || response.status >= 300) {
        const classified = classifyProviderLaneProbeResponse({adapter, body: response.body, status: response.status});
        throw Object.assign(new Error(`provider-lane chat warm failed as ${classified.responseClass}`), {
            code: 'CHAT_WARM_FAILED'
        })
    }
}

/**
 * @summary Reads runtime slot/context truth from one closed lane adapter.
 * @private
 */
async function observeLaneContext({adapter, lane, timeoutMs}) {
    if (adapter === CHAT_ADAPTER) {
        const response = await fetchBounded(lane.endpoints.modelContext.url, {
            method: lane.endpoints.modelContext.method,
            timeoutMs
        });
        const payload = safeJson(response.body),
              models  = Array.isArray(payload?.models) ? payload.models : [],
              model   = models.find(item => item?.name === lane.model.id || item?.model === lane.model.id);

        if (response.status !== 200) {
            throw Object.assign(new Error('provider-lane chat context receipt is unavailable'), {
                code: 'CHAT_CONTEXT_UNAVAILABLE'
            })
        }

        if (!model) return {contextTokensPerSlot: null, parallelism: 1, resident: false};
        if (!Number.isInteger(model.context_length) || model.context_length <= 0) {
            throw Object.assign(new Error('provider-lane chat context receipt is invalid'), {
                code: 'CHAT_CONTEXT_UNAVAILABLE'
            })
        }

        return {contextTokensPerSlot: model.context_length, parallelism: 1, resident: true}
    }

    const response = await fetchBounded(lane.endpoints.slotContext.url, {
        method: lane.endpoints.slotContext.method,
        timeoutMs
    });
    const slots = safeJson(response.body);

    if (response.status !== 200 || !Array.isArray(slots) || slots.length !== lane.parallelSlots ||
        slots.some(slot => !Number.isInteger(slot?.n_ctx) || slot.n_ctx <= 0) ||
        new Set(slots.map(slot => slot.n_ctx)).size !== 1) {
        throw Object.assign(new Error('provider-lane embedding slot context receipt is unavailable'), {
            code: 'EMBEDDING_CONTEXT_UNAVAILABLE'
        })
    }

    return {contextTokensPerSlot: slots[0].n_ctx, parallelism: slots.length, resident: true}
}

/**
 * @summary Executes one raw over-limit request and emits only bounded structural evidence.
 * @private
 */
async function runOverLimitProbe({adapter, lane, observedContextTokensPerSlot, timeoutMs}) {
    const {body, requestedContextTokens} = createProviderLaneOverLimitRequest({
              adapter,
              lane,
              observedContextTokensPerSlot
          }),
          startedAtMs = Date.now(),
          response = await fetchBounded(lane.endpoints.workload.url, {
              body,
              method: lane.endpoints.workload.method,
              timeoutMs
          });

    return {
        completedAtMs  : Date.now(),
        id             : `${lane.serviceKey}:${startedAtMs}:${randomBytes(8).toString('hex')}`,
        modelDigest    : lane.model.digest,
        protocolAdapter: adapter.id,
        requestedContextTokens,
        serviceKey     : lane.serviceKey,
        startedAtMs,
        ...classifyProviderLaneProbeResponse({adapter, body: response.body, status: response.status})
    }
}

/**
 * @summary Builds one bounded closed-adapter over-limit request from verified runtime context truth.
 * @param {Object} options
 * @returns {{body: String, requestedContextTokens: Number}}
 */
export function createProviderLaneOverLimitRequest({adapter, lane, observedContextTokensPerSlot}) {
    const modelCeiling = Number(lane.model?.contextTokensMax),
          required     = Number(lane.contextTokensPerSlotRequired);

    if (!Object.values(CLOSED_ADAPTERS).includes(adapter) ||
        !Number.isInteger(observedContextTokensPerSlot) || !Number.isInteger(modelCeiling) ||
        !Number.isInteger(required) || observedContextTokensPerSlot < required ||
        observedContextTokensPerSlot > modelCeiling) {
        throw Object.assign(new Error('provider-lane over-limit probe refused an unbounded runtime context'), {
            code: 'CONTEXT_PROBE_BOUND_INVALID'
        })
    }

    const requestedContextTokens = observedContextTokensPerSlot + 1,
          body                   = adapter === CHAT_ADAPTER
              ? JSON.stringify({
                  messages: [{content: 'x '.repeat(requestedContextTokens), role: 'user'}],
                  model   : lane.model.id,
                  options : {num_predict: 1, temperature: 0},
                  shift   : false,
                  stream  : false,
                  truncate: false
              })
              : JSON.stringify({
                  input: 'x '.repeat(requestedContextTokens),
                  model: lane.model.id
              });

    return {body, requestedContextTokens}
}

/**
 * @summary Performs one bounded internal HTTP request without following redirects.
 * @private
 */
async function fetchBounded(url, {body, method, timeoutMs}) {
    const response = await fetch(url, {
        body,
        headers : body === undefined ? undefined : {'content-type': 'application/json'},
        method,
        redirect: 'error',
        signal  : AbortSignal.timeout(timeoutMs)
    });
    const text = await readBoundedProviderLaneResponseBody(response);

    return {body: text, status: response.status}
}

/**
 * @summary Stream-reads one provider response and cancels before evidence exceeds 1 MiB.
 * @param {Response} response Fetch response.
 * @returns {Promise<String>} Bounded UTF-8 body.
 */
export async function readBoundedProviderLaneResponseBody(response) {
    const declaredLength = Number(response?.headers?.get?.('content-length'));

    if (Number.isFinite(declaredLength) && declaredLength > RESPONSE_BYTE_CAP) {
        await response.body?.cancel?.().catch(() => {});
        throw createProviderResponseTooLargeError()
    }
    if (!response?.body) return '';

    const reader = response.body.getReader(),
          chunks = [];
    let   byteLength = 0;

    try {
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            byteLength += value.byteLength;
            if (byteLength > RESPONSE_BYTE_CAP) {
                await reader.cancel().catch(() => {});
                throw createProviderResponseTooLargeError()
            }
            chunks.push(Buffer.from(value))
        }
    } finally {
        reader.releaseLock()
    }

    return Buffer.concat(chunks, byteLength).toString('utf8')
}

/**
 * @summary Creates the stable bounded-response refusal without retaining provider content.
 * @private
 */
function createProviderResponseTooLargeError() {
    return Object.assign(new Error('provider-lane response exceeded the 1 MiB evidence cap'), {
        code: 'PROVIDER_RESPONSE_TOO_LARGE'
    })
}

/**
 * @summary Executes one complete exact-head election in a run-owned disposable Compose project.
 * @param {Object} options
 * @param {String} options.artifactDir Persistent candidate-receipt directory.
 * @param {Readonly<{endpoint: String, socketPath: String}>} options.dockerAuthority One local Docker daemon.
 * @param {String} options.head Measured exact checkout head.
 * @param {Object} options.plan Validated run plan.
 * @param {String} options.projectName Internally minted project identity.
 * @param {String} options.projectRoot Exact checkout root.
 * @returns {Promise<Object>} Authoritative complete report.
 */
async function runProviderLaneElectionController({artifactDir, dockerAuthority, head, plan, projectName, projectRoot}) {
    if (head !== plan.revision) {
        throw Object.assign(new Error('provider-lane plan revision does not match the exact checkout head'), {
            code: 'REVISION_MISMATCH'
        })
    }

    await assertTrackedWorktreeClean(projectRoot);
    await mkdir(artifactDir, {recursive: true});

    const controller = new AbortController(),
          actor      = createComposeActor({dockerAuthority, plan, projectName, projectRoot, signal: controller.signal}),
          cleanup    = createProviderLaneCleanup({teardown: actor.teardown}),
          dispose    = installProviderLaneSignalHandlers({cleanup, controller});
    let receipts;

    try {
        receipts = await renderAndArchiveCandidateReceipts({actor, artifactDir, plan});

        const candidateProfiles = receipts.map(item => createProviderLaneCandidateProfile(item)),
              workload          = createWorkloadContract(plan),
              purePlan          = {
                  blocks          : plan.blocks,
                  candidateProfiles,
                  resourceSampling: plan.resourceSampling,
                  slo             : plan.slo,
                  workload
              },
              schedule          = buildProviderLaneCandidateSchedule({blocks: plan.blocks}),
              planDigest        = createProviderLanePlanDigest(purePlan),
              runtime           = await createRuntimeObserver({dockerAuthority, projectName}),
              contextEvidence   = [],
              contextByCandidate = new Map(),
              candidateRuns     = new Map(),
              trials            = [];

        await actor.buildWorkers(receipts[0]);

        for (const slot of schedule) {
            const receiptEntry       = receipts.find(item => item.candidate === slot.candidate),
                  candidateRun       = candidateRuns.get(slot.candidate) ?? 0,
                  chatResidentBefore = candidateRun % 2 === 1;

            candidateRuns.set(slot.candidate, candidateRun + 1);

            await actor.activateCandidate(receiptEntry);

            if (!contextByCandidate.has(slot.candidate)) {
                const worker = await actor.runContextWorker(receiptEntry, {
                    includeOverLimit: true,
                    timeoutMs       : plan.contextProbeTimeoutMs
                });
                const evidence = normalizeCandidateContextEvidence({receiptEntry, worker});

                contextByCandidate.set(slot.candidate, evidence);
                contextEvidence.push(evidence)
            }

            trials.push(await runMeasuredTrial({
                actor,
                plan,
                receiptEntry,
                runtime,
                slot,
                chatResidentBefore,
                workloadDigest: workload.digest
            }))
        }

        const election  = evaluateProviderLaneElection({contextEvidence, plan: purePlan, trials}),
              artifacts = {
                  candidateReceipts: receipts.map(item => ({
                      candidate: item.candidate,
                      digest   : item.compositionReceiptDigest,
                      file     : path.basename(item.file)
                  })),
                  planDigest,
                  workloadDigest: workload.digest
              };

        return finalizeProviderLaneElection({
            artifacts,
            election,
            head,
            projectName,
            receipts
        })
    } finally {
        await completeProviderLaneCleanup({cleanup, controller, dispose})
    }
}

/**
 * @summary Builds the immutable internal workload identity from code-owned public fixtures.
 * @private
 */
function createWorkloadContract(plan) {
    const offeredOperations = Object.fromEntries(Object.entries(WORKLOAD_PAYLOADS).map(([source, payloads]) => [
        source,
        payloads.length
    ]));

    return {
        digest: digestProviderLaneValue({
            contextProbeTimeoutMs: plan.contextProbeTimeoutMs,
            embeddingChunkSize   : EMBEDDING_CHUNK_SIZE,
            fixtures             : WORKLOAD_PAYLOADS,
            schemaVersion        : 'provider-lane-workload.v1',
            trialTimeoutMs       : plan.trialTimeoutMs
        }),
        offeredOperations
    }
}

/**
 * @summary Counts source calls as the exact provider lifecycle rows the shipped queue will create.
 * @param {String} source Closed workload source.
 * @param {Array} payloads Code-owned source payloads.
 * @returns {Number}
 * @private
 */
function countExpectedProviderOperations(source, payloads) {
    const contract = SOURCE_CONTRACT[source];

    if (!contract || !Array.isArray(payloads)) {
        throw new Error(`provider-lane workload source '${source}' has no countable contract`)
    }

    return contract.callKind === 'batch-array'
        ? payloads.reduce((count, payload) => count + Math.ceil(payload.length / EMBEDDING_CHUNK_SIZE), 0)
        : payloads.length
}

/**
 * @summary Renders every candidate through the analyzer and preserves exact receipt bytes.
 * @private
 */
async function renderAndArchiveCandidateReceipts({actor, artifactDir, plan}) {
    const receipts = [];

    for (const candidateInput of plan.candidateDeploymentInputs) {
        const raw       = await actor.renderReceipt(candidateInput),
              receipt   = JSON.parse(raw),
              adapters  = resolveProviderLaneAdapters(receipt),
              candidate = receipt.lanes.embedding.parallelSlots;

        if (candidate !== candidateInput.candidate || !adapters.chat || !adapters.embedding) {
            throw Object.assign(new Error('provider-lane rendered candidate does not match its input envelope'), {
                code: 'CANDIDATE_RENDER_MISMATCH'
            })
        }

        assertDeploymentInputsEqual(receipt.deploymentInputs, candidateInput.deploymentInputs, candidate);

        const compositionReceiptDigest = digestRaw(raw),
              file                     = path.join(artifactDir, `composition-candidate-${candidate}.json`);

        await atomicWrite(file, raw);
        if (digestRaw(await readFile(file, 'utf8')) !== compositionReceiptDigest) {
            throw Object.assign(new Error('provider-lane archived receipt digest changed after write'), {
                code: 'RECEIPT_ARCHIVE_MISMATCH'
            })
        }

        receipts.push({candidate, compositionReceiptDigest, file, receipt, candidateInput})
    }

    return receipts.sort((left, right) => left.candidate - right.candidate)
}

/**
 * @summary Refuses any analyzer echo that differs from the candidate input byte-for-byte by field.
 * @private
 */
function assertDeploymentInputsEqual(actual, expected, candidate) {
    if (stableSerialize(actual) !== stableSerialize(expected)) {
        throw Object.assign(new Error(`candidate ${candidate} analyzer changed the deployment-input envelope`), {
            code: 'DEPLOYMENT_INPUT_MISMATCH'
        })
    }
}

/**
 * @summary Builds the run-owned host Compose actor without accepting a live project identity.
 * @private
 */
function createComposeActor({dockerAuthority, plan, projectName, projectRoot, signal}) {
    const baseArgs = [
        '--host', dockerAuthority.endpoint,
        'compose',
        '--env-file', '/dev/null',
        '--project-name', projectName,
        '--file', BASE_COMPOSE_FILE,
        '--file', LANE_COMPOSE_FILE,
        '--profile', 'cloud',
        '--profile', 'provider-lane-election'
        ],
        healthToken   = `election-${randomBytes(24).toString('hex')}`,
        activeCommands = new Set();

    const envFor = candidateInput => {
        const env = {
            HOME                     : process.env.HOME,
            PATH                     : process.env.PATH,
            NEO_DEPLOY_PROJECT_NAME  : projectName,
            NEO_MCP_HEALTHCHECK_TOKEN: healthToken,
            NEO_REVISION             : plan.revision
        };

        for (const input of Object.values(candidateInput.deploymentInputs)) {
            env[input.env] = String(input.value)
        }

        return env
    };

    const runDocker = async (candidateInput, args, options = {}) => {
        let command;

        try {
            command = execFileAsync('docker', [...baseArgs, ...args], {
                cwd      : projectRoot,
                env      : envFor(candidateInput),
                maxBuffer: 16 * 1024 * 1024,
                signal   : options.uninterruptible ? undefined : signal,
                timeout  : options.timeout
            });
            if (!options.uninterruptible) activeCommands.add(command);
            return await command
        } catch (cause) {
            const error = new Error(`provider-lane Docker actor failed at '${args[0]}'`);
            error.code  = 'DOCKER_ACTOR_FAILED';
            error.cause = cause;
            throw error
        } finally {
            if (command) activeCommands.delete(command)
        }
    };

    return {
        async renderReceipt(candidateInput) {
            const {stdout: composition} = await runDocker(candidateInput, ['config', '--format', 'json']);
            return runAnalyzer({composition, projectRoot, signal})
        },
        async buildWorkers(receiptEntry) {
            await runDocker(receiptEntry.candidateInput, ['build', 'provider-lane-worker'], {
                timeout: plan.trialTimeoutMs
            })
        },
        async activateCandidate(receiptEntry) {
            await runDocker(receiptEntry.candidateInput, [
                'up', '--detach', '--wait', '--no-deps', 'chat-model', 'embedding-model'
            ], {timeout: plan.contextProbeTimeoutMs})
        },
        runContextWorker(receiptEntry, {includeOverLimit, timeoutMs}) {
            return runComposeWorker({
                args: [
                    '--worker', includeOverLimit ? 'context' : 'observe',
                    '--receipt', '/tmp/provider-lane-receipt.json',
                    '--timeout-ms', String(timeoutMs)
                ],
                candidateInput: receiptEntry.candidateInput,
                runDocker,
                service       : 'provider-lane-worker',
                timeout       : (includeOverLimit ? timeoutMs * 4 : timeoutMs) + 30_000,
                volume        : `${receiptEntry.file}:/tmp/provider-lane-receipt.json:ro`
            })
        },
        setChatResidency(receiptEntry, {resident, timeoutMs}) {
            return runComposeWorker({
                args: [
                    '--worker', 'prepare',
                    '--receipt', '/tmp/provider-lane-receipt.json',
                    '--resident', String(resident),
                    '--timeout-ms', String(timeoutMs)
                ],
                candidateInput: receiptEntry.candidateInput,
                runDocker,
                service       : 'provider-lane-worker',
                timeout       : timeoutMs + 30_000,
                volume        : `${receiptEntry.file}:/tmp/provider-lane-receipt.json:ro`
            })
        },
        runWorkloadWorker(receiptEntry, source, timeout) {
            return runComposeWorker({
                args: [
                    '--worker', 'workload',
                    '--source', source,
                    '--receipt', '/tmp/provider-lane-receipt.json'
                ],
                candidateInput: receiptEntry.candidateInput,
                runDocker,
                service       : 'provider-lane-worker',
                timeout,
                volume        : `${receiptEntry.file}:/tmp/provider-lane-receipt.json:ro`
            })
        },
        async teardown() {
            const candidateInput = plan.candidateDeploymentInputs[0];

            try {
                await Promise.allSettled([...activeCommands]);
                await runDocker(candidateInput, ['down', '--volumes', '--remove-orphans', '--rmi', 'local'], {
                    timeout        : 120_000,
                    uninterruptible: true
                })
            } catch (error) {
                error.code = 'DISPOSABLE_PROJECT_CLEANUP_FAILED';
                throw error
            }
        }
    }
}

/**
 * @summary Feeds rendered Compose to the canonical analyzer without persisting or logging it.
 * @private
 */
function runAnalyzer({composition, projectRoot, signal}) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [COMPOSITION_ANALYZER], {
            cwd  : projectRoot,
            env  : {HOME: process.env.HOME, PATH: process.env.PATH},
            signal,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        const stdout = [];

        child.stdout.on('data', chunk => stdout.push(chunk));
        child.stderr.resume();
        child.on('error', reject);
        child.on('close', code => {
            if (code !== 0) {
                const error = new Error('provider-lane canonical composition analyzer refused the render');
                error.code  = 'COMPOSITION_ANALYZER_REFUSED';
                reject(error);
                return
            }

            resolve(Buffer.concat(stdout).toString('utf8'))
        });
        child.stdin.end(composition)
    })
}

/**
 * @summary Launches one dedicated exact-revision worker and parses only its final sentinel receipt.
 * @private
 */
async function runComposeWorker({args, candidateInput, runDocker, service, timeout, volume}) {
    const command = [
        'run', '--rm', '-T', '--no-deps',
        ...(volume ? ['--volume', volume] : []),
        '--entrypoint', 'node',
        service,
        `./${RUNNER_ENTRYPOINT}`,
        ...args
    ];
    const {stdout} = await runDocker(candidateInput, command, {timeout});
    return parseWorkerOutput(stdout)
}

/**
 * @summary Creates a read-only runtime observer scoped to the internally minted project.
 * @private
 */
async function createRuntimeObserver({dockerAuthority, projectName}) {
    const {default: Neo} = await import('../../../src/Neo.mjs');
    await import('../../../src/core/_export.mjs');
    const [
        {default: DeploymentRuntimeAccessService},
        {dockerSocketRequest},
        {calculateDockerCpuPercent}
    ] = await Promise.all([
        import('../../daemons/orchestrator/services/DeploymentRuntimeAccessService.mjs'),
        import('../../daemons/orchestrator/services/DeploymentRuntimeAccessService.mjs'),
        import('../../daemons/orchestrator/services/ContainerHealthDiagnosisService.mjs')
    ]);

    const service = Neo.create(DeploymentRuntimeAccessService, {
        runtimeAccessConfig: {
            allowedServices    : ['chat-model', 'embedding-model'],
            auditMode          : 'metadata',
            composeProject     : projectName,
            enabled            : true,
            lifecycleOperations: [],
            mechanism          : 'docker-socket',
            readOperations     : ['inspect', 'stats'],
            responseMaxBytes   : 1024 * 1024,
            socketPath         : dockerAuthority.socketPath,
            timeoutMs          : 5000
        }
    });

    return {
        calculateDockerCpuPercent,
        async readContainerRssBytes(containerId) {
            if (!/^[0-9a-f]{64}$/.test(containerId ?? '')) {
                throw Object.assign(new Error('provider-lane RSS probe requires the exact inspected container id'), {
                    code: 'DOCKER_TOP_RSS_INVALID'
                })
            }

            const response = await dockerSocketRequest({
                maxBytes  : DOCKER_TOP_BYTE_CAP,
                method    : 'GET',
                path      : `/containers/${containerId}/top?ps_args=${encodeURIComponent('-eo pid,rss')}`,
                socketPath: dockerAuthority.socketPath,
                timeoutMs : 5000
            });

            return parseProviderLaneDockerTopRss(response.body)
        },
        service
    }
}

/**
 * @summary Runs one timed workload window and derives only proof-bound trial inputs.
 * @private
 */
async function runMeasuredTrial({actor, chatResidentBefore, plan, receiptEntry, runtime, slot, workloadDigest}) {
    await actor.setChatResidency(receiptEntry, {
        resident : chatResidentBefore,
        timeoutMs: plan.contextProbeTimeoutMs
    });

    const observation = await actor.runContextWorker(receiptEntry, {
              includeOverLimit: false,
              timeoutMs       : plan.contextProbeTimeoutMs
          }),
          inspect = await inspectRuntimeLanes({
              expectedChatResident: chatResidentBefore,
              observation,
              receiptEntry,
              runtime
          }),
          samples = {chat: [], embedding: []},
          workers = [CHAT_SOURCE, ...EMBEDDING_SOURCES].map(async expectedSource => ({
              expectedSource,
              receipt: await actor.runWorkloadWorker(receiptEntry, expectedSource, plan.trialTimeoutMs)
          })),
          allWorkers = Promise.all(workers);

    let finished = false;
    allWorkers.then(() => {finished = true}, () => {finished = true});

    do {
        await sampleRuntimeLanes({inspect, runtime, samples});
        if (!finished) {
            await Promise.race([
                allWorkers,
                delay(plan.resourceSampling.expectedIntervalMs)
            ])
        }
    } while (!finished);

    const workerReceipts = await allWorkers;
    const laneEvidence   = normalizeProviderLaneWorkerOperations({receiptEntry, workerReceipts}),
          allSourceCalls = [...laneEvidence.chat.sourceCalls, ...laneEvidence.embedding.sourceCalls],
          startedAtMs    = Math.min(...allSourceCalls.map(call => call.demandAtMs)),
          completedAtMs  = Math.max(...allSourceCalls.map(call => call.completedAtMs)),
          windowSamples = Object.fromEntries(LANE_NAMES.map(laneName => [laneName,
              samples[laneName].filter(sample => sample.atMs >= startedAtMs && sample.atMs <= completedAtMs)
          ]));

    if (!Number.isFinite(startedAtMs) || !Number.isFinite(completedAtMs) || completedAtMs <= startedAtMs ||
        windowSamples.chat.length < 2 || windowSamples.embedding.length < 2) {
        throw Object.assign(new Error('provider-lane trial lacks two in-window resource samples'), {
            code: 'RESOURCE_SAMPLE_WINDOW_INCOMPLETE'
        })
    }

    return {
        candidate               : slot.candidate,
        completedAtMs,
        compositionReceiptDigest: receiptEntry.compositionReceiptDigest,
        executionIndex          : slot.executionIndex,
        lanes                   : {
            chat: {
                operations     : laneEvidence.chat.operations,
                resourceSamples: windowSamples.chat,
                runtimeProfile : inspect.chat.runtimeProfile,
                sourceCalls    : laneEvidence.chat.sourceCalls
            },
            embedding: {
                operations     : laneEvidence.embedding.operations,
                resourceSamples: windowSamples.embedding,
                runtimeProfile : inspect.embedding.runtimeProfile,
                sourceCalls    : laneEvidence.embedding.sourceCalls
            }
        },
        residencyBefore: {
            lanes: Object.fromEntries(LANE_NAMES.map(laneName => [laneName, {
                modelDigest: observation.lanes[laneName].resident
                    ? receiptEntry.receipt.lanes[laneName].model.digest
                    : null,
                resident: observation.lanes[laneName].resident
            }])),
            observedAtMs: observation.completedAtMs
        },
        scheduleId    : slot.id,
        startedAtMs,
        workloadDigest
    }
}

/**
 * @summary Inspects both provider containers and binds resource/runtime identity to the receipt.
 * @private
 */
async function inspectRuntimeLanes({expectedChatResident, receiptEntry, runtime, observation}) {
    return Object.fromEntries(await Promise.all(LANE_NAMES.map(async laneName => {
        const lane          = receiptEntry.receipt.lanes[laneName],
              result        = await runtime.service.readObserve({serviceKey: lane.serviceKey, operation: 'inspect'}),
              actualImage   = result.data?.Config?.Image,
              expectedImage = `${lane.image.reference}@${lane.image.digest}`,
              cpuCores      = Number(result.data?.HostConfig?.NanoCpus) / 1e9,
              memoryBytes   = Number(result.data?.HostConfig?.Memory),
              parallelism   = observation.lanes[laneName].parallelism;

        const expectedResident = laneName === 'chat' ? expectedChatResident : true;

        if (result.proof?.target?.containerId !== result.data?.Id ||
            result.proof?.serviceKey !== lane.serviceKey || actualImage !== expectedImage ||
            cpuCores !== lane.cpuCores || memoryBytes !== lane.memoryBytes ||
            parallelism !== lane.parallelSlots || observation.lanes[laneName].resident !== expectedResident) {
            throw Object.assign(new Error(`provider-lane ${laneName} runtime does not match its composition receipt`), {
                code: 'RUNTIME_PROFILE_MISMATCH'
            })
        }

        return [laneName, {
            containerId   : result.data.Id,
            runtimeProfile: {
                cpuCores,
                imageDigest: lane.image.digest,
                memoryBytes,
                modelDigest: lane.model.digest,
                parallelism,
                serviceKey : lane.serviceKey
            }
        }]
    })))
}

/**
 * @summary Samples CPU and aggregate Docker Top process RSS for both exact container incarnations.
 * @private
 */
async function sampleRuntimeLanes({inspect, runtime, samples}) {
    await Promise.all(LANE_NAMES.map(async laneName => {
        const serviceKey = inspect[laneName].runtimeProfile.serviceKey,
              result     = await runtime.service.readObserve({serviceKey, operation: 'stats'}),
              cpuPercent = calculateProviderLaneDockerCpuPercent(result.data, runtime.calculateDockerCpuPercent),
              rssBytes   = await runtime.readContainerRssBytes(inspect[laneName].containerId),
              atMs       = result.proof?.observedAt;

        if (result.proof?.target?.containerId !== inspect[laneName].containerId ||
            !Number.isFinite(atMs) || !Number.isFinite(cpuPercent) || cpuPercent < 0 ||
            !Number.isFinite(rssBytes) || rssBytes < 0 ||
            samples[laneName].some(sample => sample.atMs >= atMs)) {
            throw Object.assign(new Error(`provider-lane ${laneName} resource sample is incomplete or changed incarnation`), {
                code: 'RESOURCE_SAMPLE_INVALID'
            })
        }

        samples[laneName].push({atMs, cpuPercent, rssBytes})
    }))
}

/**
 * @summary Normalizes candidate-level context evidence into the pure core's bounded input.
 * @private
 */
function normalizeCandidateContextEvidence({receiptEntry, worker}) {
    if (worker.schemaVersion !== WORKER_SCHEMA ||
        !Number.isFinite(worker.startedAtMs) || !Number.isFinite(worker.completedAtMs) ||
        worker.completedAtMs <= worker.startedAtMs) {
        throw Object.assign(new Error('provider-lane context worker returned an invalid evidence window'), {
            code: 'CONTEXT_WORKER_INVALID'
        })
    }

    return {
        candidate               : receiptEntry.candidate,
        completedAtMs           : worker.completedAtMs,
        compositionReceiptDigest: receiptEntry.compositionReceiptDigest,
        lanes                   : Object.fromEntries(LANE_NAMES.map(laneName => {
            const lane = worker.lanes?.[laneName];

            if (!lane?.overLimitProbe || lane.resident !== true ||
                lane.parallelism !== receiptEntry.receipt.lanes[laneName].parallelSlots) {
                throw Object.assign(new Error(`provider-lane ${laneName} context evidence is incomplete`), {
                    code: 'CONTEXT_EVIDENCE_INVALID'
                })
            }

            return [laneName, {
                observedContextTokensPerSlot: lane.observedContextTokensPerSlot,
                overLimitProbe              : structuredClone(lane.overLimitProbe)
            }]
        })),
        startedAtMs: worker.startedAtMs
    }
}

/**
 * @summary Maps worker lifecycle rows to fixed source identities selected by the controller.
 * @param {Object} options
 * @param {Object} options.receiptEntry Validated candidate receipt wrapper.
 * @param {Object[]} options.workerReceipts Controller-bound worker lifecycle receipts.
 * @returns {{chat: Object[], embedding: Object[]}}
 */
export function normalizeProviderLaneWorkerOperations({receiptEntry, workerReceipts}) {
    const output = {
              chat     : {operations: [], sourceCalls: []},
              embedding: {operations: [], sourceCalls: []}
          },
          expectedSources = [CHAT_SOURCE, ...EMBEDDING_SOURCES],
          receivedSources = Array.isArray(workerReceipts)
              ? workerReceipts.map(envelope => envelope?.expectedSource)
              : [];

    if (receivedSources.length !== expectedSources.length ||
        new Set(receivedSources).size !== expectedSources.length ||
        expectedSources.some(source => !receivedSources.includes(source))) {
        throw Object.assign(new Error('provider-lane workload requires each closed source exactly once'), {
            code: 'WORKLOAD_WORKER_INVALID'
        })
    }

    for (const envelope of workerReceipts) {
        const expectedSource = envelope?.expectedSource,
              worker         = envelope?.receipt,
              expected       = SOURCE_CONTRACT[expectedSource],
              payloads       = WORKLOAD_PAYLOADS[expectedSource];

        requireExactKeys(worker, ['callKind', 'operations', 'results', 'schemaVersion', 'source'],
            `provider-lane ${expectedSource} worker`);

        if (worker?.callKind !== expected?.callKind || worker?.source !== expectedSource ||
            worker?.schemaVersion !== WORKER_SCHEMA || !expected ||
            !Array.isArray(worker.operations) || !Array.isArray(worker.results) ||
            worker.operations.length < payloads.length ||
            worker.operations.length > countExpectedProviderOperations(expectedSource, payloads) ||
            worker.results.length !== payloads.length) {
            throw Object.assign(new Error('provider-lane workload worker returned an invalid receipt'), {
                code: 'WORKLOAD_WORKER_INVALID'
            })
        }

        const laneName         = expectedSource === CHAT_SOURCE ? 'chat' : 'embedding',
              lane             = receiptEntry.receipt.lanes[laneName],
              operationsByCall = new Map(payloads.map((payload, index) => [`${expectedSource}-${index}`, []])),
              resultsByCall    = new Map();

        worker.results.forEach((result, index) => {
            const callId          = `${expectedSource}-${index}`,
                  expectedOutputs = expectedSource === CHAT_SOURCE
                      ? 1
                      : Array.isArray(payloads[index]) ? payloads[index].length : 1;

            requireExactKeys(result, ['callId', 'completedAtMs', 'demandAtMs', 'outcome', 'outputCount'],
                `provider-lane ${expectedSource} result ${index}`);

            if (result.callId !== callId || !['completed', 'error', 'unexpected-refusal'].includes(result.outcome) ||
                !Number.isInteger(result.outputCount) || result.outputCount < 0 ||
                !Number.isFinite(result.demandAtMs) || !Number.isFinite(result.completedAtMs) ||
                result.completedAtMs <= result.demandAtMs ||
                (result.outcome === 'completed' ? result.outputCount !== expectedOutputs : result.outputCount !== 0)) {
                throw Object.assign(new Error(`provider-lane ${expectedSource} result cannot be bound to its source call`), {
                    code: 'WORKLOAD_LIFECYCLE_INVALID'
                })
            }

            resultsByCall.set(callId, result)
        });

        for (const row of worker.operations) {
            requireExactKeys(row, [
                'callId',
                'completedAtMs',
                'enqueuedAtMs',
                'failureStage',
                'id',
                'model',
                'operationStage',
                'outcome',
                'priority',
                'provider',
                'providerStartedAtMs',
                'queueDisposition',
                'role',
                'service'
            ], `provider-lane ${expectedSource} lifecycle`);

            const queueDisposition = row.queueDisposition === 'neo-queued'
                ? 'queued'
                : row.queueDisposition === 'not-applicable'
                    ? 'not-applicable'
                    : null;

            if (!operationsByCall.has(row.callId) || row.priority !== expected.priority ||
                row.service !== expected.service || row.operationStage !== expected.stage ||
                row.role !== expected.role || row.provider !== lane.provider || row.model !== lane.model.id ||
                !['completed', 'error'].includes(row.outcome) || !queueDisposition ||
                !Number.isFinite(row.providerStartedAtMs) || !Number.isFinite(row.completedAtMs)) {
                throw Object.assign(new Error(`provider-lane ${expectedSource} lifecycle cannot be bound to its exact lane`), {
                    code: 'WORKLOAD_LIFECYCLE_INVALID'
                })
            }

            operationsByCall.get(row.callId).push({queueDisposition, row})
        }

        payloads.forEach((payload, callIndex) => {
            const callId           = `${expectedSource}-${callIndex}`,
                  group            = operationsByCall.get(callId),
                  result           = resultsByCall.get(callId),
                  normalizedCallId = `${expectedSource}:${callId}:${randomBytes(4).toString('hex')}`,
                  groupLength      = expected.callKind === 'batch-array'
                      ? Math.ceil(payload.length / EMBEDDING_CHUNK_SIZE)
                      : 1;

            if (group.length === 0 || group.length > groupLength ||
                (result.outcome === 'completed' && (group.length !== groupLength ||
                    group.some(item => item.row.outcome !== 'completed'))) ||
                group.some(item => item.row.completedAtMs > result.completedAtMs ||
                    item.row.providerStartedAtMs < result.demandAtMs ||
                    (item.queueDisposition === 'queued' && item.row.enqueuedAtMs < result.demandAtMs)) ||
                (result.outcome === 'unexpected-refusal' && group.every(item => item.row.outcome !== 'error'))) {
                throw Object.assign(new Error(`provider-lane ${expectedSource} source-call evidence is incomplete`), {
                    code: 'WORKLOAD_LIFECYCLE_INVALID'
                })
            }

            output[laneName].sourceCalls.push({
                completedAtMs: result.completedAtMs,
                demandAtMs   : result.demandAtMs,
                id           : normalizedCallId,
                outcome      : result.outcome,
                source       : expectedSource
            });

            group.forEach(({queueDisposition, row}) => output[laneName].operations.push({
                callId             : normalizedCallId,
                completedAtMs      : row.completedAtMs,
                enqueuedAtMs       : queueDisposition === 'queued' ? row.enqueuedAtMs : null,
                id                 : `${expectedSource}:${row.id}:${randomBytes(4).toString('hex')}`,
                outcome            : row.outcome,
                providerStartedAtMs: row.providerStartedAtMs,
                queueDisposition,
                source             : expectedSource
            }))
        })
    }

    return output
}

/**
 * @summary Parses only the final base64 worker sentinel, ignoring bounded service log noise.
 * @private
 */
function parseWorkerOutput(stdout) {
    const line = String(stdout).split(/\r?\n/).reverse().find(item => item.startsWith(WORKER_SENTINEL));

    if (!line) throw Object.assign(new Error('provider-lane worker emitted no receipt sentinel'), {
        code: 'WORKER_RECEIPT_MISSING'
    });

    const encoded = line.slice(WORKER_SENTINEL.length);

    if (encoded.length > 2 * 1024 * 1024) {
        throw Object.assign(new Error('provider-lane worker receipt exceeded the bounded envelope'), {
            code: 'WORKER_RECEIPT_TOO_LARGE'
        })
    }

    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
}

/**
 * @summary Runs the CLI controller or internal dedicated-worker mode.
 * @returns {Promise<void>}
 * @private
 */
async function main() {
    const program = new Command()
        .option('--worker <mode>', 'internal worker mode (workload | context | observe | prepare)')
        .option('--source <source>', 'closed workload source')
        .option('--receipt <file>', 'validated candidate receipt for internal workers')
        .option('--resident <boolean>', 'explicit chat residency target for prepare mode')
        .option('--timeout-ms <number>', 'explicit context worker timeout')
        .option('--plan <file>', 'versioned election plan')
        .option('--out <file>', 'persistent bounded report path')
        .parse(process.argv);
    const options = program.opts();

    if (options.worker) {
        await runWorkerMode(options);
        return
    }

    if (!options.plan || !options.out) {
        throw Object.assign(new Error('provider-lane controller requires --plan and --out'), {
            code: 'CLI_INPUT_REQUIRED'
        })
    }

    const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'),
          plan        = validateProviderLaneRunPlan(JSON.parse(await readFile(path.resolve(options.plan), 'utf8'))),
          outFile     = path.resolve(options.out),
          artifactDir = `${outFile}.artifacts`,
          projectName = createDisposableProjectName(plan.revision);

    let report,
        measuredHead = null;

    try {
        measuredHead = await getExactRepositoryHead(projectRoot);

        const dockerAuthority = await resolveProviderLaneDockerAuthority();

        report = await runProviderLaneElectionController({
            artifactDir,
            dockerAuthority,
            head: measuredHead,
            plan,
            projectName,
            projectRoot
        })
    } catch (error) {
        report = createIncompleteProviderLaneReport({
            code: error?.code || 'RUN_ABORTED',
            measuredHead,
            projectName
        });
        await atomicWrite(outFile, `${JSON.stringify(report, null, 2)}\n`);
        throw error
    }

    await atomicWrite(outFile, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`[provider-lane-election] ${report.status} report=${outFile}\n`)
}

/**
 * @summary Executes one internal worker mode and emits one base64 sentinel receipt.
 * @private
 */
async function runWorkerMode(options) {
    const timeoutMs = Number(options.timeoutMs);
    let   receipt;

    if (options.worker === 'workload') {
        const candidateReceipt = JSON.parse(await readFile(path.resolve(options.receipt), 'utf8'));

        receipt = await runProviderLaneWorkloadWorker({receipt: candidateReceipt, source: options.source})
    } else if (options.worker === 'context' || options.worker === 'observe') {
        const candidateReceipt = JSON.parse(await readFile(path.resolve(options.receipt), 'utf8'));

        receipt = await runProviderLaneContextWorker({
            includeOverLimit: options.worker === 'context',
            receipt         : candidateReceipt,
            timeoutMs
        })
    } else if (options.worker === 'prepare') {
        const candidateReceipt = JSON.parse(await readFile(path.resolve(options.receipt), 'utf8')),
              resident         = options.resident === 'true'
                  ? true
                  : options.resident === 'false' ? false : null;

        receipt = await runProviderLanePreparationWorker({receipt: candidateReceipt, resident, timeoutMs})
    } else {
        throw new Error(`provider-lane worker mode '${options.worker}' is unknown`)
    }

    const encoded = Buffer.from(JSON.stringify(receipt)).toString('base64url');
    process.stdout.write(`${WORKER_SENTINEL}${encoded}\n`)
}

/**
 * @summary Creates a collision-resistant project name owned only by this process.
 * @private
 */
function createDisposableProjectName(revision) {
    return `neo-provider-election-${revision.slice(0, 10)}-${randomBytes(6).toString('hex')}`
}

/**
 * @summary Resolves the exact repository head through argv-safe git execution.
 * @private
 */
async function getExactRepositoryHead(projectRoot) {
    const {stdout} = await execFileAsync('git', ['rev-parse', 'HEAD'], {cwd: projectRoot});
    const head     = stdout.trim();

    if (!REVISION_PATTERN.test(head)) throw new Error('provider-lane runner could not resolve a full repository head');
    return head
}

/**
 * @summary Refuses tracked worktree drift while ignoring unrelated untracked operator files.
 * @private
 */
async function assertTrackedWorktreeClean(projectRoot) {
    const {stdout} = await execFileAsync('git', ['status', '--porcelain', '--untracked-files=no'], {cwd: projectRoot});

    if (stdout.trim()) {
        throw Object.assign(new Error('provider-lane exact-head mode requires no tracked worktree changes'), {
            code: 'TRACKED_WORKTREE_DIRTY'
        })
    }
}

/**
 * @summary Atomically writes one run-owned artifact without shell redirection.
 * @private
 */
async function atomicWrite(file, content) {
    await writeFileAtomic(file, content, {mode: 0o600})
}

/**
 * @summary Requires one exact enumerable key set.
 * @private
 */
function requireExactKeys(value, keys, label) {
    const actual = value && typeof value === 'object' && !Array.isArray(value)
        ? Object.keys(value).sort()
        : [];
    const expected = [...keys].sort();

    if (stableSerialize(actual) !== stableSerialize(expected)) {
        throw new Error(`${label} requires exact fields ${expected.join(', ')}`)
    }
}

/**
 * @summary Stable recursively-key-sorted serialization for receipt identity.
 * @private
 */
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
 * @summary Returns parsed JSON or null for classification-only provider bodies.
 * @private
 */
function safeJson(value) {
    try {
        return JSON.parse(value)
    } catch {
        return null
    }
}

/**
 * @summary Finds only the closed provider error discriminator through bounded object depth.
 * @private
 */
function findProviderErrorType(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 4) return null;

    for (const key of ['error_type', 'errorType', 'type']) {
        if (typeof value[key] === 'string') return value[key]
    }
    for (const key of ['error', 'detail', 'cause']) {
        const found = findProviderErrorType(value[key], depth + 1);
        if (found) return found
    }

    return null
}

/**
 * @summary Finds only a bounded provider error string through closed wrapper fields.
 * @private
 */
function findProviderErrorMessage(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 4) return null;
    if (typeof value.error === 'string') return value.error;
    if (typeof value.message === 'string') return value.message;

    for (const key of ['error', 'detail', 'cause']) {
        const found = findProviderErrorMessage(value[key], depth + 1);
        if (found) return found
    }

    return null
}

/**
 * @summary Projects a positive provider output indicator without retaining generated content.
 * @private
 */
function inferObservedOutput(value) {
    const count = Number(value?.eval_count ?? value?.usage?.completion_tokens);

    if (Number.isInteger(count) && count >= 0) return count;
    if (Array.isArray(value?.data) && value.data.length > 0) return 1;
    if (typeof value?.message?.content === 'string' && value.message.content.length > 0) return 1;
    return 0
}

/**
 * @summary Digests exact raw bytes.
 * @private
 */
function digestRaw(value) {
    return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

/**
 * @summary Async delay used only between bounded samples.
 * @private
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
    main().catch(error => {
        process.stderr.write(`[provider-lane-election] ${error?.code || 'RUN_ABORTED'}\n`);
        process.exitCode = 1
    })
}
