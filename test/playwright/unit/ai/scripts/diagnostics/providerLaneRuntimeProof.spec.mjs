import {test, expect}     from '@playwright/test';
import {spawnSync}        from 'node:child_process';
import {EventEmitter}     from 'node:events';
import fs                 from 'node:fs';
import path               from 'node:path';
import {load as loadYaml} from 'js-yaml';
import {
    PROVIDER_LANE_RUNTIME_PROOF_SCHEMA_VERSION,
    ProviderLaneRuntimeProofActor,
    parseArgs,
    proveProviderLaneRuntime,
    validateProviderLaneRuntimeProofInput,
    validateProviderLaneRuntimeProofReceipt
} from '../../../../../../ai/scripts/diagnostics/providerLaneRuntimeProof.mjs';
import {
    analyzeProviderLaneComposition
} from '../../../../../../ai/scripts/diagnostics/providerLaneComposition.mjs';
import {
    PROVIDER_LANE_ELECTION_REPORT_SCHEMA_VERSION,
    createProviderLaneCandidateProfile,
    digestProviderLaneValue,
    validateProviderLaneElectionReport
} from '../../../../../../ai/scripts/benchmark/provider-lane-election.mjs';
import {
    buildProviderLaneCandidateSchedule,
    evaluateProviderLaneElection
} from '../../../../../../ai/scripts/benchmark/helpers/providerLaneElectionCore.mjs';

const
    repoRoot         = path.resolve(process.cwd()),
    profilePath      = path.join(repoRoot, 'ai/deploy/docker-compose.provider-lanes.yml'),
    REVISION         = 'a'.repeat(40),
    ELECTION_PROJECT = `neo-provider-election-${REVISION.slice(0, 10)}-${'b'.repeat(12)}`;

function loadCompositionReceipt(candidate=1) {
    const fixtureEnv = {
              NEO_PROVIDER_LANES_CPU_TOTAL                                : '4',
              NEO_PROVIDER_LANES_MEMORY_BYTES_TOTAL                       : '51539607552',
              NEO_PROVIDER_LANE_CHAT_CPUS                                 : '2',
              NEO_PROVIDER_LANE_CHAT_MEMORY_BYTES                         : '34359738368',
              NEO_PROVIDER_LANE_CHAT_CONTEXT_TOKENS                       : '32768',
              NEO_PROVIDER_LANE_EMBEDDING_CPUS                            : '2',
              NEO_PROVIDER_LANE_EMBEDDING_MEMORY_BYTES                    : '17179869184',
              NEO_PROVIDER_LANE_EMBEDDING_SLOTS                           : String(candidate),
              NEO_PROVIDER_LANE_EMBEDDING_TOTAL_CONTEXT_TOKENS            : String(candidate * 32768),
              NEO_PROVIDER_LANE_EMBEDDING_CONTEXT_TOKENS_PER_SLOT_REQUIRED: '32768',
              NEO_PROVIDER_LANE_EMBEDDING_BATCH_TOKENS                    : String(candidate * 32768),
              NEO_PROVIDER_LANE_EMBEDDING_UBATCH_TOKENS                   : String(candidate * 32768)
          },
          source = fs.readFileSync(profilePath, 'utf8').replace(
              /\$\{([A-Z0-9_]+):\?[^}]+}/g,
              (match, name) => fixtureEnv[name]
          ),
          composition = {name: ELECTION_PROJECT, ...loadYaml(source)};
    const shared = composition['x-provider-lane-env'];

    for (const serviceKey of ['kb-server', 'mc-server', 'orchestrator']) {
        composition.services[serviceKey].environment = {
            ...shared,
            ...composition.services[serviceKey].environment
        }
    }

    return analyzeProviderLaneComposition(composition, {verifySources: false})
}

function clone(value) {
    return structuredClone(value)
}

const canonicalReceipt = loadCompositionReceipt();

function buildLaneSlo({context, cpu, memory, operations}) {
    return {
        maxCpuHighWaterPercent  : cpu,
        maxErrors               : 0,
        maxNeoQueueWaitMs       : 60_000,
        maxProgressGapMs        : 300_000,
        maxProviderDurationMs   : 300_000,
        maxResourceGapCount     : 0,
        maxRssHighWaterBytes    : memory,
        maxUnexpectedRefusals   : 0,
        minCompletedOperations  : operations,
        minContextTokensPerSlot : context,
        minResourceCoverageRatio: 0.9,
        minThroughputPerSecond  : 0.001,
        requiredQueueDisposition: 'queued'
    }
}

function buildContextEvidence(entry) {
    const startedAtMs   = entry.candidate * 1000,
          completedAtMs = startedAtMs + 500,
          probe         = (laneName, mode) => {
              const lane      = entry.receipt.lanes[laneName],
                    supported = mode === 'supported';

              return {
                  completedAtMs       : completedAtMs - (supported ? 110 : 10),
                  id                  : `${entry.candidate}:${laneName}:${mode}`,
                  modelDigest         : lane.model.digest,
                  observedOutputTokens: supported ? 1 : 0,
                  protocolAdapter     : laneName === 'chat'
                      ? 'ollama-chat-v0.32.9'
                      : 'llama-cpp-openai-embeddings-b10380',
                  requestedContextTokens: lane.contextTokensPerSlotRequired + (supported ? 0 : 1),
                  responseBodyDigest    : digestProviderLaneValue({candidate: entry.candidate, laneName, mode}),
                  responseClass         : supported ? 'completed' : 'context-limit-refusal',
                  serviceKey            : lane.serviceKey,
                  startedAtMs           : supported ? startedAtMs + 10 : completedAtMs - 100,
                  transportStatus       : supported ? 200 : 400
              }
          };

    return {
        candidate               : entry.candidate,
        completedAtMs,
        compositionReceiptDigest: entry.compositionReceiptDigest,
        lanes                   : {
            chat: {
                observedContextTokensPerSlot: 32768,
                overLimitProbe              : probe('chat', 'over-limit')
            },
            embedding: {
                observedContextTokensPerSlot: 32768,
                overLimitProbe              : probe('embedding', 'over-limit'),
                supportedLimitProbe         : probe('embedding', 'supported')
            }
        },
        startedAtMs
    }
}

function buildTrial({plan, slot}) {
    const startedAtMs   = 10_000 + slot.executionIndex * 10_000,
          completedAtMs = startedAtMs + 5000,
          profile       = plan.candidateProfiles.find(item => item.embeddingSlots === slot.candidate),
          operation     = ({completedOffset, id, laneName, source, startedOffset}) => ({
              callId             : `${slot.id}:${id}`,
              completedAtMs      : startedAtMs + completedOffset,
              enqueuedAtMs       : startedAtMs + 100,
              id                 : `${slot.id}:${laneName}:${id}`,
              outcome            : 'completed',
              providerStartedAtMs: startedAtMs + startedOffset,
              queueDisposition   : 'queued',
              source
          }),
          chatOperations = [
              operation({completedOffset: 1000, id: 'chat-0', laneName: 'chat', source: 'chat', startedOffset: 200}),
              operation({completedOffset: 2000, id: 'chat-1', laneName: 'chat', source: 'chat', startedOffset: 1200})
          ],
          starts = {
              1: [200, 1000, 1800, 2600],
              2: [200, 200, 1200, 1200],
              4: [200, 200, 200, 1200]
          }[slot.candidate],
          embeddingOperations = ['knowledge-base', 'memory-core', 'orchestrator', 'orchestrator']
              .map((source, index) => operation({
                  completedOffset: starts[index] + 600,
                  id             : `${source}-${index}`,
                  laneName       : 'embedding',
                  source,
                  startedOffset  : starts[index]
              })),
          lane = (laneName, operations) => ({
              operations,
              resourceSamples: Array.from({length: 6}, (_, index) => ({
                  atMs      : startedAtMs + index * 1000,
                  cpuPercent: laneName === 'chat' ? 100 : 150,
                  rssBytes  : laneName === 'chat' ? 2_000_000_000 : 3_000_000_000
              })),
              runtimeProfile: Object.fromEntries([
                  'cpuCores', 'imageDigest', 'memoryBytes', 'modelDigest', 'parallelism', 'serviceKey'
              ].map(field => [field, profile.lanes[laneName][field]])),
              sourceCalls: operations.map(row => ({
                  completedAtMs: row.completedAtMs + 100,
                  demandAtMs   : startedAtMs + 100,
                  id           : row.callId,
                  outcome      : 'completed',
                  source       : row.source
              }))
          });

    return {
        candidate               : slot.candidate,
        completedAtMs,
        compositionReceiptDigest: profile.compositionReceiptDigest,
        executionIndex          : slot.executionIndex,
        lanes                   : {
            chat     : lane('chat', chatOperations),
            embedding: lane('embedding', embeddingOperations)
        },
        residencyBefore: {
            lanes: {
                chat     : {modelDigest: profile.lanes.chat.modelDigest, resident: true},
                embedding: {modelDigest: profile.lanes.embedding.modelDigest, resident: true}
            },
            observedAtMs: startedAtMs - 1
        },
        scheduleId    : slot.id,
        startedAtMs,
        workloadDigest: plan.workload.digest
    }
}

function buildElectionReport({minimumPassingCandidate=1} = {}) {
    const receipts = [1, 2, 4].map(candidate => {
              const receipt = loadCompositionReceipt(candidate);

              return {candidate, compositionReceiptDigest: digestProviderLaneValue(receipt), receipt}
          }),
          workload = {
              digest           : digestProviderLaneValue({fixture: 'provider-lane-runtime-proof'}),
              offeredOperations: {chat: 2, 'knowledge-base': 1, 'memory-core': 1, orchestrator: 2}
          },
          plan = {
              blocks           : 1,
              candidateProfiles: receipts.map(createProviderLaneCandidateProfile),
              resourceSampling : {activeCpuThreshold: 1, expectedIntervalMs: 1000, gapFactor: 2},
              slo              : {
                  lanes: {
                      chat     : buildLaneSlo({context: 32768, cpu: 200, memory: 34359738368, operations: 2}),
                      embedding: buildLaneSlo({context: 32768, cpu: 200, memory: 17179869184, operations: 4})
                  }
              },
              workload
          },
          contextEvidence = receipts.map(buildContextEvidence),
          trials = buildProviderLaneCandidateSchedule({blocks: 1}).map(slot => buildTrial({plan, slot})),
          rejected = contextEvidence.filter(item => item.candidate < minimumPassingCandidate);

    for (const context of rejected) {
        context.lanes.embedding.overLimitProbe.responseClass = 'provider-error';
        context.lanes.embedding.overLimitProbe.transportStatus = 500
    }

    const election       = evaluateProviderLaneElection({contextEvidence, plan, trials}),
          evidence       = {contextEvidence, trials},
          selected       = receipts.find(item => item.candidate === election.winnerCandidate),
          evidenceDigest = digestProviderLaneValue({
              candidateReceiptDigests: receipts.map(item => item.compositionReceiptDigest),
              evidence,
              projectName            : ELECTION_PROJECT,
              repositoryHead         : REVISION
          });

    return {
        artifacts: {
            candidateReceipts: receipts.map(item => ({
                archiveByteDigest: digestProviderLaneValue({archive: item.candidate}),
                candidate        : item.candidate,
                digest           : item.compositionReceiptDigest,
                file             : `composition-candidate-${item.candidate}.json`
            })),
            evidenceDigest,
            planDigest    : election.planCoordinates.planDigest,
            workloadDigest: workload.digest
        },
        authority: {
            authoritative: true,
            evidenceClass: 'canonical-disposable-plane',
            reason       : 'complete validated matrix on a run-owned disposable Compose project'
        },
        candidateReceipts    : receipts,
        deploymentInputs     : clone(selected.receipt.deploymentInputs),
        election,
        evidence,
        projectName          : ELECTION_PROJECT,
        repositoryHead       : REVISION,
        schemaVersion        : PROVIDER_LANE_ELECTION_REPORT_SCHEMA_VERSION,
        selectedReceipt      : clone(selected.receipt),
        selectedReceiptDigest: selected.compositionReceiptDigest,
        status               : 'ELECTED'
    }
}

const canonicalReport = validateProviderLaneElectionReport(buildElectionReport());

function makeElectionReport(minimumPassingCandidate=1) {
    return minimumPassingCandidate === 1
        ? clone(canonicalReport)
        : validateProviderLaneElectionReport(buildElectionReport({minimumPassingCandidate}))
}

function makeContainer(lane, {
    id=(lane.serviceKey === 'chat-model' ? 'a' : 'b').repeat(64),
    imageId=`sha256:${(lane.serviceKey === 'chat-model' ? '1' : '2').repeat(64)}`,
    ip=lane.serviceKey === 'chat-model' ? '172.30.0.2' : '172.30.0.3',
    restartCount=0,
    startedAt='2026-08-12T16:00:00.000Z'
} = {}) {
    return {
        containerId    : id,
        configuredImage: `${lane.image.reference}@${lane.image.digest}`,
        health         : 'healthy',
        imageId,
        networks       : [{id: 'c'.repeat(64), ip, name: 'neo-provider-proof-test_neo-mcp-network'}],
        projectLabel   : 'neo-provider-proof-123-abcdef0123456789',
        restartCount,
        serviceLabel   : lane.serviceKey,
        startedAt
    }
}

function makeSlots(processing=false) {
    return [{id: 0, idTask: processing ? 41 : null, isProcessing: processing, nCtx: 32768}]
}

function makeObservedPlane() {
    const chatLane      = canonicalReceipt.lanes.chat;
    const embeddingLane = canonicalReceipt.lanes.embedding;

    return {
        chat: {
            container: makeContainer(chatLane),
            endpoint : {url: chatLane.endpoints.modelContext.url, remoteIp: '172.30.0.2'},
            model    : {id: chatLane.model.id, contextTokens: 32768}
        },
        embedding: {
            container: makeContainer(embeddingLane),
            endpoint : {url: embeddingLane.endpoints.models.url, remoteIp: '172.30.0.3'},
            model    : {id: embeddingLane.model.id},
            slots    : makeSlots()
        },
        declaredRoles: clone(canonicalReceipt.roles)
    }
}

function laneIdentity(lane) {
    return {
        container   : clone(lane.container),
        endpoint    : clone(lane.endpoint),
        model       : clone(lane.model),
        slotTopology: lane.slots ? lane.slots.map(({id, nCtx}) => ({id, nCtx})) : null
    }
}

function makeObserver() {
    const embedding = makeContainer(canonicalReceipt.lanes.embedding);

    return {
        configuredImage: embedding.configuredImage,
        containerId    : 'd'.repeat(64),
        imageId        : embedding.imageId,
        networks       : [{...embedding.networks[0], ip: '172.30.0.4'}],
        projectLabel   : embedding.projectLabel,
        serviceLabel   : 'provider-lane-proof-observer',
        startedAt      : '2026-08-12T15:59:00.000Z',
        state          : 'running'
    }
}

function stoppedIdentity(lane) {
    const {health, ...container} = clone(lane.container);

    container.networks = container.networks.map(({id, name}) => ({id, name}));

    return {...container, state: 'exited'}
}

function makeContainment() {
    return {
        state  : 'PASS',
        payload: {
            digest    : `sha256:${'3'.repeat(64)}`,
            byteLength: 512,
            inputCount: 4,
            shape     : 'bounded-string-array'
        },
        admission: {
            observed         : true,
            slotId           : 0,
            idTask           : 41,
            admittedAtMs     : 100,
            revalidatedAtMs  : 150,
            revalidatedIdTask: 42,
            revalidatedSlotId: 0
        },
        disconnect: {
            method                : 'in-container-sigterm',
            atMs                  : 150,
            confirmedAtMs         : 150,
            callerPid             : 17,
            callerRemoteIp        : '172.30.0.3',
            callerSettled         : true,
            exitCode              : 143,
            signal                : null,
            socketCount           : 1,
            preKillProcessingCount: 1,
            preKillRemoteIp       : '172.30.0.3',
            startTime             : '12345'
        },
        idle: {
            boundMs               : 30000,
            firstAllIdleAtMs      : 200,
            stableAllIdleAtMs     : 300,
            settleMs              : 150,
            consecutiveIdleSamples: 2
        },
        slotSequence: [
            {atMs: 100, remoteIp: '172.30.0.3', slots: makeSlots(true)},
            {atMs: 150, remoteIp: '172.30.0.3', slots: [{...makeSlots(true)[0], idTask: 42}]},
            {atMs: 200, remoteIp: '172.30.0.3', slots: makeSlots()},
            {atMs: 300, remoteIp: '172.30.0.3', slots: makeSlots()}
        ],
        postControl: {state: 'PASS', remoteIp: '172.30.0.3'}
    }
}

function restartedPlane(baseline, laneName) {
    const result = clone(baseline);
    const lane   = result[laneName];

    lane.container.startedAt    = '2026-08-12T16:05:00.000Z';

    return result
}

function makeRestartIsolation(baseline=makeObservedPlane()) {
    const afterChat      = restartedPlane(baseline, 'chat');
    const afterEmbedding = restartedPlane(afterChat, 'embedding');

    return {
        state: 'PASS',
        chat : {
            before: laneIdentity(baseline.chat),
            during: {
                target  : stoppedIdentity(baseline.chat),
                opposite: laneIdentity(baseline.embedding)
            },
            after: {
                target  : laneIdentity(afterChat.chat),
                opposite: laneIdentity(afterChat.embedding)
            }
        },
        embedding: {
            before: laneIdentity(afterChat.embedding),
            during: {
                target  : stoppedIdentity(afterChat.embedding),
                opposite: laneIdentity(afterChat.chat)
            },
            after: {
                target  : laneIdentity(afterEmbedding.embedding),
                opposite: laneIdentity(afterEmbedding.chat)
            }
        }
    }
}

function makeRuntimeReceipt() {
    const report = makeElectionReport();
    const lanes  = makeObservedPlane();

    return {
        schemaVersion: PROVIDER_LANE_RUNTIME_PROOF_SCHEMA_VERSION,
        verdict      : 'PASS',
        source       : {
            head             : report.repositoryHead,
            compositionDigest: report.selectedReceiptDigest
        },
        project: {
            name           : 'neo-provider-proof-123-abcdef0123456789',
            composeFiles   : ['ai/deploy/docker-compose.yml', 'ai/deploy/docker-compose.provider-lanes.yml'],
            dockerAuthority: {
                contextName     : 'default',
                endpointClass   : 'local-unix',
                socketPathDigest: `sha256:${'4'.repeat(64)}`
            },
            observer    : makeObserver()
        },
        lanes,
        containment     : makeContainment(),
        restartIsolation: makeRestartIsolation(lanes),
        cleanup         : {state: 'PASS'},
        errors          : []
    }
}

function makeActor({clock={value: 0}, delayStep=100, nonce='abcdef0123456789'} = {}) {
    const report = makeElectionReport();

    return new ProviderLaneRuntimeProofActor({
        report,
        receipt: report.selectedReceipt,
        nonceFn: () => nonce,
        now    : () => clock.value,
        delayFn: async () => {
            clock.value += delayStep
        },
        realpathFn            : async value => value,
        statFn                : async () => ({isSocket: () => true}),
        env                   : {PATH: '/usr/bin', SECRET_SENTINEL: 'must-not-leak'},
        registerSignalHandlers: false
    })
}

function rawSlot({busy=false, idTask=busy ? 41 : null} = {}) {
    return [{id: 0, id_task: idTask, is_processing: busy, n_ctx: 32768}]
}

function curlReceipt(body, remoteIp) {
    return `${JSON.stringify(body)}\nNEO_PROVIDER_REMOTE_IP:${remoteIp}`
}

class TranscriptCaller extends EventEmitter {
    constructor() {
        super();
        this.stdout    = new EventEmitter();
        this.stderr    = new EventEmitter();
        this.killCalls = []
    }

    kill(signal) {
        this.killCalls.push(signal);
        this.onKill?.(signal);
        return true
    }
}

function makeDockerTranscript({
    nonce='abcdef0123456789',
    selectedSlots=1,
    slotScript,
    slotPeers,
    chatWorkloadPeer='172.30.0.2',
    postControlPeer='172.30.0.3',
    disconnectExitCode=143,
    disconnectSignal=null,
    disconnectFails=false,
    slotFailureIndex=null,
    moveEmbeddingOnChatRestart=false,
    moveChatOnEmbeddingRestart=false,
    restartCountDrifts=false,
    idleTaskAfterRestart=null,
    downFails=false,
    cleanupResidue=false,
    upFails=false,
    env={PATH: '/usr/bin', SECRET_SENTINEL: 'must-not-leak'}
} = {}) {
    const report          = makeElectionReport(selectedSlots),
          chatLane        = report.selectedReceipt.lanes.chat,
          embeddingLane   = report.selectedReceipt.lanes.embedding,
          chatId          = 'a'.repeat(64),
          embeddingId     = 'b'.repeat(64),
          observerId      = 'd'.repeat(64),
          networkId       = 'c'.repeat(64),
          calls           = [],
          caller          = new TranscriptCaller(),
          clock           = {value: 1000},
          transcriptSlots = ({busy=false, idTask=busy ? 41 : idleTaskAfterRestart} = {}) =>
              Array.from({length: embeddingLane.parallelSlots}, (_, id) => ({
                  id,
                  id_task      : idTask === null ? null : idTask + id,
                  is_processing: busy,
                  n_ctx        : embeddingLane.contextTokensPerSlotRequired
              })),
          slots         = (slotScript || [
              transcriptSlots(),
              transcriptSlots({busy: true}),
              transcriptSlots({busy: true}),
              transcriptSlots({busy: true}),
              transcriptSlots({busy: true}),
              transcriptSlots(),
              transcriptSlots(),
              transcriptSlots(),
              transcriptSlots(),
              transcriptSlots()
          ]).map(clone),
          peers         = [...(slotPeers || [])];
    let chatStartCount      = 0,
        embeddingStartCount = 0,
        chatStopped         = false,
        embeddingStopped    = false,
        observerStarted     = false,
        projectName,
        slotIndex             = 0,
        callerSettled         = false;

    caller.onKill = () => {
        if (!callerSettled) {
            callerSettled = true;
            queueMicrotask(() => caller.emit('exit', 143, null))
        }
    };

    const currentStartedAt = lane => {
        if (lane === 'chat') {
            if (moveChatOnEmbeddingRestart && (embeddingStopped || embeddingStartCount > 0)) {
                return '2026-08-12T16:15:00.000Z'
            }
            return chatStartCount > 0
                ? '2026-08-12T16:05:00.000Z'
                : '2026-08-12T16:00:00.000Z'
        }

        return embeddingStartCount > 0 || (moveEmbeddingOnChatRestart && (chatStopped || chatStartCount > 0))
            ? '2026-08-12T16:10:00.000Z'
            : '2026-08-12T16:00:00.000Z'
    };
    const currentRestartCount = lane => {
        if (!restartCountDrifts) return 0;
        if (lane === 'chat') {
            return chatStartCount + (moveChatOnEmbeddingRestart && embeddingStartCount > 0 ? 1 : 0)
        }
        return embeddingStartCount + (moveEmbeddingOnChatRestart && chatStartCount > 0 ? 1 : 0)
    };
    const inspectRow = (laneName, lane, id, ip, imageId) => {
        const running = laneName === 'chat' ? !chatStopped : !embeddingStopped;

        return {
        Id    : id,
        Config: {
            Image : `${lane.image.reference}@${lane.image.digest}`,
            Labels: {
                'com.docker.compose.project': projectName,
                'com.docker.compose.service': lane.serviceKey
            }
        },
        Image       : imageId,
        RestartCount: currentRestartCount(laneName),
        State       : {
            Health   : running ? {Status: 'healthy'} : {Status: 'unhealthy'},
            Running  : running,
            Status   : running ? 'running' : 'exited',
            StartedAt: currentStartedAt(laneName)
        },
        NetworkSettings: {
            Networks: {
                [`${projectName}_neo-mcp-network`]: {
                    IPAddress: running ? ip : '',
                    NetworkID: networkId
                }
            }
        }
        }
    };
    const observerRow = () => ({
        Id    : observerId,
        Config: {
            Image : `${embeddingLane.image.reference}@${embeddingLane.image.digest}`,
            Labels: {
                'com.docker.compose.project': projectName,
                'com.docker.compose.service': 'provider-lane-proof-observer'
            }
        },
        Image: `sha256:${'2'.repeat(64)}`,
        State: {
            Running  : observerStarted,
            Status   : observerStarted ? 'running' : 'exited',
            StartedAt: '2026-08-12T15:59:00.000Z'
        },
        NetworkSettings: {
            Networks: {
                [`${projectName}_neo-mcp-network`]: {IPAddress: '172.30.0.4', NetworkID: networkId}
            }
        }
    });
    const composeTail = args => {
        const index = args.indexOf('cloud');
        projectName ??= args[args.indexOf('-p') + 1];
        return args.slice(index + 1)
    };
    const respond = (callback, error, stdout='') => {
        queueMicrotask(() => callback(error, stdout, ''))
    };

    const execFileFn = (command, args, options, callback) => {
        calls.push({kind: 'exec', command, args: [...args], env: clone(options.env)});

        if (command === 'git') {
            const stdout = args.includes('rev-parse') ? `${report.repositoryHead}\n` : '';
            respond(callback, null, stdout);
            return {kill() {}}
        }

        if (args[0] === 'context' && args[1] === 'show') {
            respond(callback, null, 'default\n');
            return {kill() {}}
        }

        if (args[0] === 'context' && args[1] === 'inspect') {
            respond(callback, null, '"unix:///var/run/docker.sock"\n');
            return {kill() {}}
        }

        if (args[0] === 'inspect' && args[1] === '--format') {
            respond(callback, null, 'healthy\n');
            return {kill() {}}
        }

        if (args[0] === 'inspect') {
            const id  = args[1],
                  row = id === observerId
                      ? observerRow()
                      : id === chatId
                      ? inspectRow('chat', chatLane, chatId, '172.30.0.2', `sha256:${'1'.repeat(64)}`)
                      : inspectRow('embedding', embeddingLane, embeddingId, '172.30.0.3', `sha256:${'2'.repeat(64)}`);
            respond(callback, null, JSON.stringify([row]));
            return {kill() {}}
        }

        if (args[0] === 'run') {
            if (!args.includes('--pull') || !args.includes('never') || !args.includes('--read-only') ||
                args[args.indexOf('--cap-drop') + 1] !== 'ALL' ||
                args[args.indexOf('--security-opt') + 1] !== 'no-new-privileges' ||
                args[args.indexOf('--entrypoint') + 1] !== '/bin/sh' ||
                !args.includes(`com.docker.compose.project=${projectName}`) ||
                !args.includes('com.docker.compose.service=provider-lane-proof-observer') ||
                args[args.indexOf('--network') + 1] !== `${projectName}_neo-mcp-network` ||
                !args.includes(`${embeddingLane.image.reference}@${embeddingLane.image.digest}`) ||
                !args.at(-1).includes('trap "exit 0" INT TERM')) {
                respond(callback, new Error('observer authority missing'));
                return {kill() {}}
            }
            observerStarted = true;
            respond(callback, null, `${observerId}\n`);
            return {kill() {}}
        }

        if (args[0] === 'rm' && args.includes(observerId)) {
            observerStarted = false;
            respond(callback, null, `${observerId}\n`);
            return {kill() {}}
        }

        if (args[0] === 'ps' && args.includes('--all') && args.includes('--filter')) {
            respond(callback, null, cleanupResidue ? `${chatId}\n` : '');
            return {kill() {}}
        }

        if ((args[0] === 'network' || args[0] === 'volume') && args[1] === 'ls' && args.includes('--filter')) {
            respond(callback, null, cleanupResidue ? `${networkId}\n` : '');
            return {kill() {}}
        }

        if (args[0] === 'stop') {
            if (args.at(-1) === chatId) chatStopped = true;
            else embeddingStopped = true;
            respond(callback, null, `${args.at(-1)}\n`);
            return {kill() {}}
        }

        if (args[0] === 'start') {
            if (args.at(-1) === chatId) {
                chatStopped = false;
                chatStartCount++
            } else {
                embeddingStopped = false;
                embeddingStartCount++
            }
            respond(callback, null, `${args.at(-1)}\n`);
            return {kill() {}}
        }

        const tail = args[0] === 'compose' ? composeTail(args) : args;

        if (tail[0] === 'up') {
            respond(callback, upFails ? new Error('SECRET_SENTINEL up failed') : null, '');
            return {kill() {}}
        }

        if (tail[0] === 'down') {
            respond(callback, downFails ? new Error('SECRET_SENTINEL down failed') : null, '');
            return {kill() {}}
        }

        if (tail[0] === 'ps') {
            respond(callback, null, `${tail.at(-1) === chatLane.serviceKey ? chatId : embeddingId}\n`);
            return {kill() {}}
        }

        if (tail[0] === 'exec' && tail.some(value => String(value).startsWith('NEO_PROVIDER_CALLER_PID=')) &&
            tail.some(value => String(value).includes('NEO_PROVIDER_DISCONNECT'))) {
            const script = tail.at(-1);
            if (!script.includes('/proc/$pid/stat') || !script.includes('/proc/$pid/fd/*') ||
                !script.includes('/proc/net/tcp') || !script.includes('NEO_PROVIDER_SLOT_URL') ||
                !script.includes('test "$busy_count" -ge 1') || !script.includes('peer_hex') ||
                !script.includes('peer_port_hex') || !script.includes('test "$socket_count" -ge 1') ||
                !script.includes('kill -TERM "$pid"') ||
                !tail.includes('NEO_PROVIDER_CALLER_PID=4242') ||
                !tail.includes(`NEO_PROVIDER_PROBE_NONCE=${nonce}`) ||
                !tail.includes(`NEO_PROVIDER_PROBE_URL=${embeddingLane.endpoints.workload.url}`) ||
                !tail.includes('NEO_PROVIDER_CALLER_REMOTE_IP=172.30.0.3') ||
                !tail.includes('NEO_PROVIDER_CALLER_REMOTE_PORT=8080') ||
                !tail.includes(`NEO_PROVIDER_SLOT_URL=${embeddingLane.endpoints.slotContext.url}`) ||
                tail[tail.indexOf(`NEO_PROVIDER_SLOT_URL=${embeddingLane.endpoints.slotContext.url}`) + 1] !==
                    observerId) {
                respond(callback, new Error('disconnect mechanism missing'));
                return {kill() {}}
            }
            const marker = `NEO_PROVIDER_DISCONNECT:4242:12345:1:${embeddingLane.parallelSlots}:172.30.0.3\n`;
            respond(callback, disconnectFails ? new Error('disconnect failed') : null, marker);
            if (disconnectFails) return {kill() {}};
            queueMicrotask(() => {
                if (!callerSettled) {
                    callerSettled = true;
                    caller.emit('exit', disconnectExitCode, disconnectSignal)
                }
            });
            return {kill() {}}
        }

        if (tail[0] === 'exec' && tail.includes('NEO_PROVIDER_CALLER_START_TIME=12345')) {
            const script = tail.at(-1);
            if (!tail.includes('NEO_PROVIDER_CALLER_PID=4242') ||
                tail[tail.indexOf('NEO_PROVIDER_CALLER_START_TIME=12345') + 1] !== observerId ||
                !script.includes('/proc/$pid/stat') ||
                !script.includes('test "$current" != "$NEO_PROVIDER_CALLER_START_TIME"')) {
                respond(callback, new Error('caller-gone mechanism missing'));
                return {kill() {}}
            }
            respond(callback, null, '');
            return {kill() {}}
        }

        if (tail[0] === 'exec' && tail.includes('curl')) {
            const url = tail.at(-1);

            if (tail[1] !== observerId || !tail.includes('--connect-timeout') ||
                !tail.includes('--max-time') || !tail.includes('--request') ||
                !tail.includes('--write-out') || !tail.includes('\nNEO_PROVIDER_REMOTE_IP:%{remote_ip}') ||
                !tail.includes('Accept: application/json')) {
                respond(callback, new Error('curl authority missing'));
                return {kill() {}}
            }

            if (url.endsWith('/api/chat')) {
                respond(callback, null, curlReceipt({message: {content: 'OK'}}, chatWorkloadPeer))
            } else if (url.endsWith('/api/ps')) {
                respond(callback, null, curlReceipt({models: [{
                    name          : chatLane.model.id,
                    context_length: chatLane.contextTokensPerSlotRequired
                }]}, '172.30.0.2'))
            } else if (url.endsWith('/health')) {
                respond(callback, null, curlReceipt({status: 'ok'}, '172.30.0.3'))
            } else if (url.endsWith('/v1/models')) {
                respond(callback, null, curlReceipt({data: [{id: embeddingLane.model.id}]}, '172.30.0.3'))
            } else if (url.endsWith('/slots')) {
                const body = slots[Math.min(slotIndex, slots.length - 1)],
                      peer = peers[slotIndex] || '172.30.0.3';
                if (slotIndex === slotFailureIndex) {
                    slotIndex++;
                    respond(callback, new Error('slot observer unavailable'));
                    return {kill() {}}
                }
                slotIndex++;
                respond(callback, null, curlReceipt(body, peer))
            } else if (url.endsWith('/v1/embeddings')) {
                respond(callback, null, curlReceipt({data: [{index: 0, embedding: [0.1]}]}, postControlPeer))
            } else {
                respond(callback, new Error('unexpected curl URL'))
            }

            return {kill() {}}
        }

        respond(callback, new Error(`unexpected command: ${command} ${args.join(' ')}`));
        return {kill() {}}
    };

    const spawnFn = (command, args, options) => {
        calls.push({kind: 'spawn', command, args: [...args], env: clone(options.env)});
        const script = args.at(-1),
              syntax = spawnSync('/bin/sh', ['-n', '-c', script], {encoding: 'utf8'});

        if (command !== 'docker' || args[0] !== 'exec' ||
            !args.includes(`NEO_PROVIDER_PROBE_NONCE=${nonce}`) ||
            !args.some(value => String(value).startsWith('NEO_PROVIDER_PROBE_PAYLOAD=')) ||
            args[args.findIndex(value => String(value).startsWith('NEO_PROVIDER_PROBE_PAYLOAD=')) + 1] !== observerId ||
            !args.includes('sh') || !args.includes('-ec') || syntax.status !== 0 ||
            !script.includes('&\ncaller_pid=$!') ||
            !script.includes('caller_pid=$!\nprintf') ||
            !script.includes('\nwait "$caller_pid"') || script.includes('&;') ||
            !script.includes('Connection: close') || !script.includes(embeddingLane.endpoints.workload.url) ||
            !script.includes('X-Neo-Probe-Id: $NEO_PROVIDER_PROBE_NONCE')) {
            throw new Error('malformed caller shell')
        }

        queueMicrotask(() => {
            caller.stdout.emit('data', `NEO_PROVIDER_CALLER:${nonce}:4242\n`);
            caller.stderr.emit('data', '* Connected to embedding-model (172.30.0.3) port 8080\n')
        });

        return caller
    };

    return {
        calls,
        caller,
        dependencies: {
            execFileFn,
            spawnFn,
            now    : () => clock.value,
            delayFn: async ms => {
                clock.value += ms
            },
            nonceFn               : () => nonce,
            realpathFn            : async value => value,
            statFn                : async () => ({isSocket: () => true}),
            env,
            registerSignalHandlers: false
        },
        report
    }
}

test.describe('provider-lane runtime proof (#17022)', () => {
    test('accepts only a selected authoritative report carrying the full canonical receipt', () => {
        const report = makeElectionReport();

        expect(validateProviderLaneRuntimeProofInput(report)).toMatchObject({valid: true, errors: []});

        const mutations = [
            value => {
                value.schemaVersion = 'provider-lane-election-report.v0'
            },
            value => {
                value.status = 'NO_ELECTION'
            },
            value => {
                value.authority.authoritative = false
            },
            value => {
                delete value.selectedReceipt
            },
            value => {
                value.selectedReceipt.ready = false
            },
            value => {
                value.selectedReceipt.lanes.chat.baseUrl = 'https://foreign.invalid'
            },
            value => {
                value.deploymentInputs.chatCpuCores.value = 99
            },
            value => {
                value.endpoint = 'https://foreign.invalid'
            }
        ];

        for (const mutate of mutations) {
            const candidate = clone(report);
            mutate(candidate);
            expect(validateProviderLaneRuntimeProofInput(candidate).valid).toBe(false)
        }

        for (const field of [
            'apiKey', 'baseUrl', 'composeFile', 'composeFiles', 'credential', 'endpoint',
            'existingProject', 'host', 'password', 'project', 'token', 'url'
        ]) {
            const candidate = clone(report);
            candidate[field] = 'SECRET_SENTINEL';
            expect(validateProviderLaneRuntimeProofInput(candidate).valid).toBe(false)
        }
    });

    test('invalid evidence fails before actor construction or Docker and does not echo secrets', async () => {
        const report = makeElectionReport();
        report.token = 'SECRET_SENTINEL';
        let execCalls = 0;

        const first = await proveProviderLaneRuntime(report, {
            execFileFn: () => {
                execCalls++
            },
            nonceFn: () => {
                throw new Error('actor must not be constructed')
            }
        });
        const second = await proveProviderLaneRuntime(clone(report));

        expect(execCalls).toBe(0);
        expect(first).toMatchObject({verdict: 'FAIL', cleanup: {state: 'NOT_STARTED'}});
        expect(JSON.stringify(first)).not.toContain('SECRET_SENTINEL');
        expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    });

    test('the closed CLI exposes only an election-report input file', () => {
        expect(parseArgs([])).toEqual({input: null});
        expect(parseArgs(['--input', '/tmp/report.json'])).toEqual({input: '/tmp/report.json'});

        for (const option of ['--project', '--endpoint', '--compose-file', '--token']) {
            expect(() => parseArgs([option, 'forbidden'])).toThrow()
        }
    });

    test('the actor mints unique strict projects and derives a secret-free exact environment', () => {
        const first  = makeActor({nonce: '1111111111111111'});
        const second = makeActor({nonce: '2222222222222222'});

        expect(first.projectName).not.toBe(second.projectName);
        expect(first.projectName).toMatch(/^neo-provider-proof-\d+-1111111111111111$/);
        expect(first.composeArgs(['ps'])).toEqual([
            'compose', '--env-file', '/dev/null', '-p', first.projectName,
            '-f', path.join(repoRoot, 'ai/deploy/docker-compose.yml'),
            '-f', path.join(repoRoot, 'ai/deploy/docker-compose.provider-lanes.yml'),
            '--profile', 'cloud', 'ps'
        ]);
        expect(first.composeEnv.SECRET_SENTINEL).toBeUndefined();
        expect(first.composeEnv.NEO_REVISION).toBe('a'.repeat(40));
        expect(first.composeEnv.NEO_PROVIDER_LANE_CHAT_CPUS).toBe('2');
        expect(first.composeEnv.NEO_DEPLOY_PROJECT_NAME).toBe(first.projectName)
    });

    test('a raw process and Docker transcript proves the complete local actor path', async () => {
        const first        = makeDockerTranscript(),
              second       = makeDockerTranscript(),
              firstResult  = await proveProviderLaneRuntime(first.report, first.dependencies),
              secondResult = await proveProviderLaneRuntime(second.report, second.dependencies);

        expect(firstResult.verdict).toBe('PASS');
        expect(validateProviderLaneRuntimeProofReceipt(firstResult, {report: first.report})).toEqual({
            valid : true,
            errors: []
        });
        expect(JSON.stringify(firstResult)).toBe(JSON.stringify(secondResult));
        expect(firstResult).toMatchObject({
            project: {
                dockerAuthority: {endpointClass: 'local-unix'},
                observer       : {serviceLabel: 'provider-lane-proof-observer', state: 'running'}
            },
            containment: {
                admission  : {observed: true, idTask: 41},
                disconnect : {callerPid: 4242, exitCode: 143, socketCount: 1},
                idle       : {consecutiveIdleSamples: 2},
                postControl: {state: 'PASS'}
            },
            restartIsolation: {
                chat     : {during: {target: {state: 'exited'}}},
                embedding: {during: {target: {state: 'exited'}}}
            },
            cleanup: {state: 'PASS'}
        });
        expect(first.calls.filter(call => call.kind === 'spawn')).toHaveLength(1);
        const composeCalls = first.calls.filter(call => call.kind === 'exec' && call.args[0] === 'compose'),
              downCalls    = composeCalls.filter(call => call.args.includes('down'));
        expect(downCalls).toHaveLength(1);
        expect(composeCalls.every(call => call.args.includes(firstResult.project.name))).toBe(true);
        expect(JSON.stringify(firstResult)).not.toContain('SECRET_SENTINEL')
    });

    test('authoritative two- and four-slot winners prove one-request multi-slot containment', async () => {
        for (const selectedSlots of [2, 4]) {
            const transcript = makeDockerTranscript({selectedSlots}),
                  result     = await proveProviderLaneRuntime(transcript.report, transcript.dependencies);

            expect(result).toMatchObject({
                verdict    : 'PASS',
                containment: {
                    disconnect: {preKillProcessingCount: selectedSlots},
                    state     : 'PASS'
                }
            });
            expect(result.lanes.embedding.slots).toHaveLength(selectedSlots);
            expect(validateProviderLaneRuntimeProofReceipt(result, {
                report: transcript.report
            })).toEqual({valid: true, errors: []})
        }
    });

    test('a remote Docker authority is refused before the first Compose mutation', async () => {
        const transcript = makeDockerTranscript({
            env: {PATH: '/usr/bin', DOCKER_HOST: 'tcp://external.invalid:2376'}
        });
        const result = await proveProviderLaneRuntime(transcript.report, transcript.dependencies);

        expect(result).toMatchObject({
            verdict: 'FAIL',
            cleanup: {state: 'NOT_STARTED'},
            errors : [{code: 'DOCKER_AUTHORITY_OVERRIDE_REFUSED'}]
        });
        expect(transcript.calls.some(call => call.kind === 'exec' && call.args.includes('up'))).toBe(false)
    });

    test('raw disconnect evidence fails closed across admission, peer, idle, and control mutations', async () => {
        const cases = [
            {
                options: {
                    slotScript: [rawSlot(), ...Array.from({length: 205}, () => rawSlot())]
                },
                verdict: 'NOT_PROVEN',
                code   : 'ADMISSION_NOT_OBSERVED'
            },
            {
                options: {
                    slotScript: [rawSlot(), rawSlot({busy: true}),
                        rawSlot({busy: true}),
                        rawSlot({busy: true}), rawSlot({busy: true}),
                        ...Array.from({length: 305}, () => rawSlot({busy: true}))]
                },
                verdict: 'FAIL',
                code   : 'POST_DISCONNECT_WORK_DID_NOT_SETTLE'
            },
            {
                options: {
                    slotPeers: ['172.30.0.3', '203.0.113.7']
                },
                verdict: 'NOT_PROVEN',
                code   : 'SLOT_OBSERVER_PEER_MISMATCH'
            },
            {
                options: {postControlPeer: '203.0.113.7'},
                verdict: 'FAIL',
                code   : 'POST_DISCONNECT_CONTROL_PEER_MISMATCH'
            },
            {
                options: {disconnectExitCode: 0},
                verdict: 'NOT_PROVEN',
                code   : 'CALLER_COMPLETED_NATURALLY'
            },
            {
                options: {disconnectExitCode: null, disconnectSignal: null},
                verdict: 'NOT_PROVEN',
                code   : 'CALLER_COMPLETED_NATURALLY'
            },
            {
                options: {slotFailureIndex: 1},
                verdict: 'NOT_PROVEN',
                code   : 'SLOT_OBSERVATION_UNAVAILABLE'
            },
            {
                options: {disconnectFails: true},
                verdict: 'NOT_PROVEN',
                code   : 'CALLER_DISCONNECT_NOT_OBSERVED'
            }
        ];

        for (const row of cases) {
            const transcript = makeDockerTranscript(row.options),
                  result     = await proveProviderLaneRuntime(transcript.report, transcript.dependencies);

            expect(result.verdict).toBe(row.verdict);
            expect(result.errors).toEqual([{code: row.code}]);
            expect(transcript.calls.some(call => call.kind === 'exec' && call.args.includes('down'))).toBe(true)
        }
    });

    test('the idle stability witness resets after renewed processing', async () => {
        const transcript = makeDockerTranscript({
            slotScript: [
                rawSlot(),
                rawSlot({busy: true}),
                rawSlot({busy: true}),
                rawSlot({busy: true}),
                rawSlot({busy: true}),
                rawSlot(),
                rawSlot({busy: true}),
                rawSlot(),
                rawSlot(),
                rawSlot(),
                rawSlot()
            ]
        });
        const result = await proveProviderLaneRuntime(transcript.report, transcript.dependencies);

        expect(result.verdict).toBe('PASS');
        expect(result.containment.slotSequence.map(sample => sample.slots[0].isProcessing)).toEqual([
            true, true, true, true, false, true, false, false
        ]);
        expect(result.containment.idle.firstAllIdleAtMs)
            .toBe(result.containment.slotSequence.at(-2).atMs)
    });

    test('raw restart evidence rejects opposite movement and restart-policy counter drift', async () => {
        const cases = [
            {options: {moveEmbeddingOnChatRestart: true}, code: 'CHAT_RESTART_MOVED_EMBEDDING'},
            {options: {moveChatOnEmbeddingRestart: true}, code: 'EMBEDDING_RESTART_MOVED_CHAT'},
            {options: {restartCountDrifts: true}, code: 'CHAT_RESTART_NOT_OBSERVED'}
        ];

        for (const row of cases) {
            const transcript = makeDockerTranscript(row.options),
                  result     = await proveProviderLaneRuntime(transcript.report, transcript.dependencies);

            expect(result.verdict).toBe('FAIL');
            expect(result.errors).toEqual([{code: row.code}])
        }

        const ephemeral       = makeDockerTranscript({idleTaskAfterRestart: 99}),
              ephemeralResult = await proveProviderLaneRuntime(ephemeral.report, ephemeral.dependencies);
        expect(ephemeralResult.verdict).toBe('PASS')
    });

    test('runtime errors and malformed slot task IDs never leak raw secret text', async () => {
        const transcript = makeDockerTranscript({
            slotScript: [rawSlot({idTask: 'SECRET_SENTINEL'})]
        });
        const result = await proveProviderLaneRuntime(transcript.report, transcript.dependencies);

        expect(result).toMatchObject({verdict: 'NOT_PROVEN', errors: [{code: 'SLOT_CONTRACT_MISMATCH'}]});
        expect(JSON.stringify(result)).not.toContain('SECRET_SENTINEL')
    });

    test('cleanup removes only the actor-owned project and is idempotent', async () => {
        const calls = [];
        const actor = makeActor();
        actor.execFileFn = (command, args, options, callback) => {
            calls.push({command, args});
            queueMicrotask(() => callback(null, ''));
            return {kill() {}}
        };
        actor.composeAttempted = true;

        await actor.close();
        await actor.close();

        expect(calls).toHaveLength(4);
        expect(calls[0].command).toBe('docker');
        expect(calls[0].args).toContain(actor.projectName);
        expect(calls[0].args.slice(-5)).toEqual(['down', '--remove-orphans', '--volumes', '--timeout', '30']);
        expect(calls[0].args.join(' ')).not.toContain('system prune')
        expect(calls.slice(1).map(call => call.args[0])).toEqual(['ps', 'network', 'volume'])
    });

    test('setup and cleanup failures remain terminal and project-scoped', async () => {
        const failedSetup   = makeDockerTranscript({upFails: true}),
              setupResult   = await proveProviderLaneRuntime(failedSetup.report, failedSetup.dependencies),
              failedCleanup = makeDockerTranscript({downFails: true}),
              cleanupResult = await proveProviderLaneRuntime(failedCleanup.report, failedCleanup.dependencies);

        expect(setupResult.verdict).toBe('FAIL');
        expect(failedSetup.calls.filter(call => call.kind === 'exec' && call.args.includes('down'))).toHaveLength(1);
        expect(cleanupResult).toMatchObject({
            verdict: 'FAIL', cleanup: {state: 'FAIL'}, errors: [{code: 'CLEANUP_UNRESOLVED'}]
        });
        expect(failedCleanup.calls.filter(call => call.kind === 'exec' && call.args.includes('down'))).toHaveLength(1);
        expect(JSON.stringify(cleanupResult)).not.toContain('SECRET_SENTINEL')
    });

    test('cleanup requires a zero-resource project census after successful down', async () => {
        const transcript = makeDockerTranscript({cleanupResidue: true}),
              result     = await proveProviderLaneRuntime(transcript.report, transcript.dependencies);

        expect(result).toMatchObject({
            verdict: 'FAIL', cleanup: {state: 'FAIL'}, errors: [{code: 'CLEANUP_UNRESOLVED'}]
        });
        expect(transcript.calls.filter(call => call.kind === 'exec' && call.args.includes('down'))).toHaveLength(3)
    });

    test('ordinary sibling-command failure drains active work before teardown', async () => {
        const actor = makeActor(),
              order = [];
        actor.composeAttempted = true;
        actor.execFileFn = (command, args, options, callback) => {
            if (args[0] === 'hang') {
                order.push('hang-start');
                return {kill(signal) {
                    order.push(`hang-${signal}`);
                    queueMicrotask(() => {
                        order.push('hang-settled');
                        callback(new Error('cancelled'))
                    })
                }}
            }
            if (args.includes('down')) order.push('down');
            queueMicrotask(() => callback(null, ''));
            return {kill() {}}
        };

        const pending = actor.runExec('docker', ['hang'], 'hanging sibling').catch(error => error);
        await actor.close();
        await expect(pending).resolves.toMatchObject({code: 'HANGING_SIBLING_FAILED'});
        expect(order.slice(0, 4)).toEqual(['hang-start', 'hang-SIGTERM', 'hang-settled', 'down']);
        expect(actor.activeCommands.size).toBe(0)
    });

    test('cleanup refuses PASS while an outer caller child remains unsettled', async () => {
        const actor     = makeActor(),
              killCalls = [];
        actor.activeCaller = {
            settled: false,
            child  : {kill: signal => killCalls.push(signal)}
        };
        actor.disconnectCaller = async () => {
            throw new Error('disconnect failed')
        };
        actor.waitForCallerSettlement = async () => {
            throw new Error('caller still live')
        };

        await expect(actor.close()).rejects.toMatchObject({code: 'CLEANUP_UNRESOLVED'});
        expect(killCalls).toEqual(['SIGTERM', 'SIGKILL']);
        expect(actor.closed).toBe(false)
    });

    test('a caller that exits after PID but before peer binding is NOT_PROVEN and remains cleanup-safe', async () => {
        const actor  = makeActor(),
              caller = new TranscriptCaller();
        actor.spawnFn = () => caller;

        const pending = actor.startEmbeddingCaller(actor.createEmbeddingProbePayload());
        caller.stdout.emit('data', `NEO_PROVIDER_CALLER:${actor.probeNonce}:4242\n`);
        caller.emit('exit', 0, null);

        await expect(pending).rejects.toMatchObject({
            code   : 'CALLER_SETTLED_BEFORE_PEER',
            verdict: 'NOT_PROVEN'
        });
        await expect(actor.close()).resolves.toBeUndefined();
        expect(caller.killCalls).toEqual(['SIGTERM'])
    });

    test('SIGTERM settles an active Docker mutation before project cleanup starts', async () => {
        const report       = makeElectionReport(),
              signalTarget = new EventEmitter(),
              order        = [];
        const actor = new ProviderLaneRuntimeProofActor({
            report,
            receipt: report.selectedReceipt,
            nonceFn: () => 'abcdef0123456789',
            signalTarget,
            env    : {PATH: '/usr/bin'},
            execFileFn(command, args, options, callback) {
                if (args.includes('up')) {
                    order.push('up-start');
                    return {
                        kill(signal) {
                            order.push(`up-${signal}`);
                            queueMicrotask(() => {
                                order.push('up-settled');
                                callback(new Error('interrupted'))
                            })
                        }
                    }
                }

                if (args.includes('down')) {
                    order.push('down-start');
                    queueMicrotask(() => callback(null, ''));
                    return {kill() {}}
                }

                if (args.includes('--filter')) {
                    queueMicrotask(() => callback(null, ''));
                    return {kill() {}}
                }

                throw new Error(`unexpected command ${command} ${args.join(' ')}`)
            }
        });
        actor.composeAttempted = true;

        const pending = actor.runExec('docker', ['compose', 'up'], 'deferred provider up');
        signalTarget.emit('SIGTERM');

        await expect(pending).rejects.toMatchObject({code: 'INTERRUPTED_SIGTERM'});
        await actor.close();
        expect(order).toEqual(['up-start', 'up-SIGTERM', 'up-settled', 'down-start']);
        expect(actor.activeCommands.size).toBe(0);
        expect(signalTarget.listenerCount('SIGTERM')).toBe(0)
    });

    test('an unresponsive interrupted Docker child blocks cleanup instead of racing a down', async () => {
        const report       = makeElectionReport(),
              signalTarget = new EventEmitter(),
              order        = [];
        const actor = new ProviderLaneRuntimeProofActor({
            report,
            receipt               : report.selectedReceipt,
            nonceFn               : () => 'abcdef0123456789',
            signalTarget,
            commandSettleTimeoutMs: 1,
            env                   : {PATH: '/usr/bin'},
            execFileFn(command, args) {
                if (args.includes('up')) {
                    order.push('up-start');
                    return {kill: signal => order.push(`up-${signal}`)}
                }
                if (args.includes('down')) order.push('down-start');
                throw new Error(`unexpected command ${command} ${args.join(' ')}`)
            }
        });
        actor.composeAttempted = true;

        const pending = actor.runExec('docker', ['compose', 'up'], 'unresponsive provider up');
        signalTarget.emit('SIGTERM');

        await expect(pending).rejects.toMatchObject({code: 'INTERRUPTED_SIGTERM'});
        await expect(actor.close()).rejects.toMatchObject({code: 'CLEANUP_UNRESOLVED'});
        expect(order).toEqual(['up-start', 'up-SIGTERM', 'up-SIGKILL']);
        expect(order).not.toContain('down-start')
    });

    test('a signal after the last proof arm remains terminal instead of minting PASS', async () => {
        const report       = makeElectionReport(),
              signalTarget = new EventEmitter(),
              actor        = new ProviderLaneRuntimeProofActor({
                  report,
                  receipt   : report.selectedReceipt,
                  nonceFn   : () => 'abcdef0123456789',
                  signalTarget,
                  env       : {PATH: '/usr/bin'},
                  realpathFn: async value => value,
                  statFn    : async () => ({isSocket: () => true})
              }),
              baseline = makeObservedPlane();

        actor.assertSourceBinding = async () => report.repositoryHead;
        actor.assertLocalDockerAuthority = async () => ({
            contextName: 'default', endpointClass: 'local-unix', socketPathDigest: `sha256:${'4'.repeat(64)}`
        });
        actor.runDocker = async () => {};
        actor.waitForHealthy = async () => {};
        actor.startObserver = async () => makeObserver();
        actor.capturePlane = async () => baseline;
        actor.proveEmbeddingDisconnect = async () => makeContainment();
        actor.proveRestartIsolation = async () => {
            signalTarget.emit('SIGTERM');
            return makeRestartIsolation(baseline)
        };

        await expect(actor.run()).rejects.toMatchObject({code: 'INTERRUPTED_SIGTERM'});
        actor.composeAttempted = false;
        await actor.close();
        expect(actor.closed).toBe(true)
    });

    test('disconnect PASS requires admission, non-natural caller settlement, stable all-idle, and control success', async () => {
        const clock    = {value: 0};
        const actor    = makeActor({clock});
        const caller   = {pid: 17, remoteIp: '172.30.0.3', settled: false, result: null};
        const sequence = [
            makeSlots(), makeSlots(),
            makeSlots(true), makeSlots(true),
            makeSlots(true), makeSlots(true),
            makeSlots(), makeSlots()
        ];

        actor.startEmbeddingCaller   = async () => caller;
        actor.readSlots              = async () => ({remoteIp: '172.30.0.3', slots: sequence.shift()});
        actor.disconnectCaller       = async () => ({
            startTime      : '12345', socketCount: 1, preKillProcessingCount: 1,
            preKillRemoteIp: '172.30.0.3'
        });
        actor.verifyCallerGone       = async () => {};
        actor.waitForCallerSettlement = async () => ({code: 143, signal: null});
        actor.curlJson               = async () => ({
            body    : {data: [{embedding: [0.1]}]},
            remoteIp: '172.30.0.3'
        });

        const result = await actor.proveEmbeddingDisconnect(makeObservedPlane().embedding);

        expect(result).toMatchObject({
            state      : 'PASS',
            payload    : {shape: 'bounded-string-array', inputCount: 4},
            admission  : {observed: true, slotId: 0, admittedAtMs: 100},
            disconnect : {callerPid: 17, callerSettled: true},
            idle       : {consecutiveIdleSamples: 2},
            postControl: {state: 'PASS'}
        });
        expect(result.slotSequence).toHaveLength(8)
    });

    test('missing admission is NOT_PROVEN and continued post-disconnect work is FAIL', async () => {
        const noAdmission = makeActor();
        noAdmission.startEmbeddingCaller = async () => ({
            pid: 17, remoteIp: '172.30.0.3', settled: true, result: {code: 0, signal: null}
        });

        await expect(noAdmission.proveEmbeddingDisconnect(makeObservedPlane().embedding)).rejects.toMatchObject({
            code   : 'ADMISSION_NOT_OBSERVED',
            verdict: 'NOT_PROVEN'
        });

        const clock  = {value: 0};
        const noIdle = makeActor({clock, delayStep: 10000});
        noIdle.startEmbeddingCaller    = async () => ({pid: 17, remoteIp: '172.30.0.3', settled: false});
        noIdle.readSlots               = async () => ({remoteIp: '172.30.0.3', slots: makeSlots(true)});
        noIdle.disconnectCaller        = async () => ({
            startTime      : '12345', socketCount: 1, preKillProcessingCount: 1,
            preKillRemoteIp: '172.30.0.3'
        });
        noIdle.verifyCallerGone        = async () => {};
        noIdle.waitForCallerSettlement = async () => ({code: 143, signal: null});

        await expect(noIdle.proveEmbeddingDisconnect(makeObservedPlane().embedding)).rejects.toMatchObject({
            code   : 'POST_DISCONNECT_WORK_DID_NOT_SETTLE',
            verdict: 'FAIL'
        })
    });

    test('a naturally completed caller cannot masquerade as disconnect containment', async () => {
        const actor = makeActor();
        actor.startEmbeddingCaller    = async () => ({pid: 17, remoteIp: '172.30.0.3', settled: false});
        actor.readSlots               = async () => ({remoteIp: '172.30.0.3', slots: makeSlots(true)});
        actor.disconnectCaller        = async () => ({
            startTime      : '12345', socketCount: 1, preKillProcessingCount: 1,
            preKillRemoteIp: '172.30.0.3'
        });
        actor.verifyCallerGone        = async () => {};
        actor.waitForCallerSettlement = async () => ({code: 0, signal: null});

        await expect(actor.proveEmbeddingDisconnect(makeObservedPlane().embedding)).rejects.toMatchObject({
            code   : 'CALLER_COMPLETED_NATURALLY',
            verdict: 'NOT_PROVEN'
        })
    });

    test('restart isolation accepts only the restarted lane while the opposite identity stays exact', async () => {
        const actor          = makeActor();
        const baseline       = makeObservedPlane();
        const afterChat      = restartedPlane(baseline, 'chat');
        const afterEmbedding = restartedPlane(afterChat, 'embedding');
        const captures       = [afterChat, afterEmbedding];
        const commands       = [];

        let stopIndex = 0;
        actor.stopExactProvider = async (id, lane) => commands.push(['stop', lane, id]);
        actor.startExactProvider = async (id, lane) => commands.push(['start', lane, id]);
        actor.inspectStoppedService = async () => stopIndex++ === 0
            ? stoppedIdentity(baseline.chat)
            : stoppedIdentity(afterChat.embedding);
        actor.inspectService = async service => service === 'chat-model'
            ? afterChat.chat.container
            : baseline.embedding.container;
        actor.observeChatLane = async () => afterChat.chat;
        actor.observeEmbeddingLane = async () => baseline.embedding;
        actor.waitForHealthy = async () => {};
        actor.capturePlane = async () => captures.shift();

        await expect(actor.proveRestartIsolation(baseline)).resolves.toMatchObject({state: 'PASS'});
        expect(commands).toEqual([
            ['stop', 'chat', baseline.chat.container.containerId],
            ['start', 'chat', baseline.chat.container.containerId],
            ['stop', 'embedding', afterChat.embedding.container.containerId],
            ['start', 'embedding', afterChat.embedding.container.containerId]
        ])
    });

    test('a hidden route fallback fails independently', async () => {
        const baseline   = makeObservedPlane();
        const routeActor = makeActor();
        routeActor.curlJson = async () => ({
            body    : {models: [{name: canonicalReceipt.lanes.chat.model.id, context_length: 32768}]},
            remoteIp: '203.0.113.7'
        });

        await expect(routeActor.observeChatLane(baseline.chat.container, {warm: false})).rejects.toMatchObject({
            code: 'CHAT_ROUTE_PEER_MISMATCH'
        });

        const workloadFallback = makeDockerTranscript({chatWorkloadPeer: '203.0.113.7'}),
              result           = await proveProviderLaneRuntime(workloadFallback.report, workloadFallback.dependencies);

        expect(result).toMatchObject({
            verdict: 'FAIL',
            errors : [{code: 'CHAT_WORKLOAD_ROUTE_PEER_MISMATCH'}]
        })
    });

    test('PASS receipts are complete by construction and fail closed on evidence omission', () => {
        const report  = makeElectionReport(),
              receipt = makeRuntimeReceipt();

        expect(validateProviderLaneRuntimeProofReceipt(receipt, {report})).toEqual({valid: true, errors: []});

        const omissions = [
            value => delete value.lanes.declaredRoles,
            value => delete value.containment.admission,
            value => delete value.containment.postControl,
            value => delete value.restartIsolation.embedding,
            value => delete value.cleanup
        ];

        for (const omit of omissions) {
            const candidate = clone(receipt);
            omit(candidate);
            expect(validateProviderLaneRuntimeProofReceipt(candidate, {report}).valid).toBe(false)
        }
    });

    test('PASS receipt validation replays causal evidence instead of trusting green booleans', () => {
        const report    = makeElectionReport(),
              receipt   = makeRuntimeReceipt(),
              mutations = [
                  value => {
                      value.containment.disconnect.exitCode = null
                  },
                  value => {
                      value.containment.idle.settleMs = -1
                  },
                  value => {
                      value.containment.slotSequence = [value.containment.slotSequence[0]]
                  },
                  value => {
                      value.containment.admission.slotId = 99
                  },
                  value => {
                      value.containment.postControl.remoteIp = '203.0.113.7'
                  },
                  value => {
                      value.restartIsolation.chat.before = {}
                  },
                  value => {
                      value.restartIsolation.chat.after.target.container.restartCount = 1
                  },
                  value => {
                      value.lanes.declaredRoles.embedding.modelId = 'forged-model'
                  },
                  value => {
                      value.source.compositionDigest = `sha256:${'f'.repeat(64)}`
                  },
                  value => {
                      value.project.name = 'neo-provider-proof-123-fedcba9876543210'
                  },
                  value => {
                      value.project.observer.containerId = value.lanes.chat.container.containerId
                  },
                  value => {
                      const network = {id: 'e'.repeat(64), ip: '172.30.0.2', name: 'foreign-network'};
                      value.lanes.chat.container.networks = [network];
                      value.restartIsolation.chat.before.container.networks = [clone(network)];
                      value.restartIsolation.chat.after.target.container.networks = [clone(network)];
                      value.restartIsolation.embedding.during.opposite.container.networks = [clone(network)];
                      value.restartIsolation.embedding.after.opposite.container.networks = [clone(network)]
                  },
                  value => {
                      for (const sample of value.containment.slotSequence) {
                          sample.slots.forEach(slot => {
                              slot.id = 99;
                              slot.nCtx = 1
                          })
                      }
                      value.containment.admission.slotId = 99;
                      value.containment.admission.revalidatedSlotId = 99
                  },
                  value => {
                      value.containment.admission.revalidatedAtMs = value.containment.admission.admittedAtMs
                  },
                  value => {
                      value.containment.payload.shape = 'token-ids'
                  }
              ];

        expect(validateProviderLaneRuntimeProofReceipt(receipt, {report}).valid).toBe(true);

        for (const mutate of mutations) {
            const candidate = clone(receipt);
            mutate(candidate);
            expect(validateProviderLaneRuntimeProofReceipt(candidate, {report}).valid).toBe(false)
        }
    });

    test('the actor cannot emit PASS when an internal arm omits required evidence', async () => {
        const actor                 = makeActor();
        const baseline              = makeObservedPlane();
        const incompleteContainment = makeContainment();
        delete incompleteContainment.postControl;

        actor.assertSourceBinding       = async () => 'a'.repeat(40);
        actor.assertLocalDockerAuthority = async () => ({source: 'docker-context', endpointClass: 'local-unix'});
        actor.runDocker                 = async () => {};
        actor.waitForHealthy            = async () => {};
        actor.startObserver             = async () => makeObserver();
        actor.capturePlane              = async () => baseline;
        actor.proveEmbeddingDisconnect  = async () => incompleteContainment;
        actor.proveRestartIsolation     = async () => makeRestartIsolation(baseline);

        await expect(actor.run()).rejects.toMatchObject({code: 'RUNTIME_RECEIPT_INCOMPLETE'})
    })
});
