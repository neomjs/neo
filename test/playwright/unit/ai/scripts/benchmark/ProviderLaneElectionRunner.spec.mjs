import {test, expect}                           from '@playwright/test';
import {EventEmitter}                           from 'node:events';
import fs                                       from 'node:fs';
import path                                     from 'node:path';
import {load as loadYaml}                       from 'js-yaml';
import {EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS} from '../../../../../../ai/embeddingSafeBand.mjs';

import {
    analyzeProviderLaneComposition,
    validateProviderLaneCompositionReceipt
} from '../../../../../../ai/scripts/diagnostics/providerLaneComposition.mjs';
import {
    PROVIDER_LANE_ELECTION_REPORT_SCHEMA_VERSION,
    calculateProviderLaneDockerCpuPercent,
    classifyProviderLaneOperationResult,
    classifyProviderLaneProbeResponse,
    completeProviderLaneCleanup,
    createIncompleteProviderLaneReport,
    createProviderLaneCleanup,
    createProviderLaneCandidateProfile,
    createProviderLaneOverLimitRequest,
    createProviderLaneSupportedLimitRequest,
    digestProviderLaneValue,
    installProviderLaneSignalHandlers,
    invokeProviderLaneEmbeddingSource,
    normalizeProviderLaneWorkerOperations,
    parseProviderLaneDockerEndpoint,
    parseProviderLaneDockerTopRss,
    projectProviderLaneOutcome,
    readBoundedProviderLaneResponseBody,
    resolveProviderLaneDockerAuthority,
    resolveProviderLaneAdapters,
    validateProviderLaneElectionReport,
    validateProviderLaneRunPlan
} from '../../../../../../ai/scripts/benchmark/provider-lane-election.mjs';
import {
    buildProviderLaneCandidateSchedule,
    evaluateProviderLaneElection
} from '../../../../../../ai/scripts/benchmark/helpers/providerLaneElectionCore.mjs';

const
    repoRoot    = path.resolve(process.cwd()),
    profilePath = path.join(repoRoot, 'ai/deploy/docker-compose.provider-lanes.yml'),
    REVISION    = '1'.repeat(40);

function buildComposition(candidate) {
    const environment = {
        NEO_PROVIDER_LANES_CPU_TOTAL                                : '4',
        NEO_PROVIDER_LANES_MEMORY_BYTES_TOTAL                       : '51539607552',
        NEO_PROVIDER_LANE_CHAT_CPUS                                 : '2',
        NEO_PROVIDER_LANE_CHAT_MEMORY_BYTES                         : '34359738368',
        NEO_PROVIDER_LANE_CHAT_CONTEXT_TOKENS                       : '131072',
        NEO_PROVIDER_LANE_EMBEDDING_CPUS                            : '2',
        NEO_PROVIDER_LANE_EMBEDDING_MEMORY_BYTES                    : '17179869184',
        NEO_PROVIDER_LANE_EMBEDDING_SLOTS                           : String(candidate),
        NEO_PROVIDER_LANE_EMBEDDING_TOTAL_CONTEXT_TOKENS            : String(candidate * 32768),
        NEO_PROVIDER_LANE_EMBEDDING_CONTEXT_TOKENS_PER_SLOT_REQUIRED: '32768',
        NEO_PROVIDER_LANE_EMBEDDING_BATCH_TOKENS                    : String(candidate * 32768),
        NEO_PROVIDER_LANE_EMBEDDING_UBATCH_TOKENS                   : String(candidate * 32768),
        NEO_LOCAL_MODELS_EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS     : String(EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS)
    };
    const source = fs.readFileSync(profilePath, 'utf8').replace(
        /\$\{([A-Z0-9_]+):\?[^}]+}/g,
        (match, name) => {
            if (!Object.hasOwn(environment, name)) throw new Error(`missing fixture env ${name}`);
            return environment[name]
        }
    );
    const composition = {name: 'neo-provider-lane-election-test', ...loadYaml(source)},
          shared      = composition['x-provider-lane-env'];

    for (const serviceKey of ['kb-server', 'mc-server', 'orchestrator']) {
        composition.services[serviceKey].environment = {
            ...shared,
            ...composition.services[serviceKey].environment
        }
    }

    return composition
}

function buildReceipt(candidate) {
    const receipt = analyzeProviderLaneComposition(buildComposition(candidate), {
        safeProcessingLimitTokensEmbedding: EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS
    });

    expect(receipt.ready, JSON.stringify(receipt.errors, null, 2)).toBe(true);
    return receipt
}

function buildRunPlan(receipts = [1, 2, 4].map(buildReceipt)) {
    return {
        blocks                   : 1,
        candidateDeploymentInputs: receipts.map((receipt, index) => ({
            candidate       : [1, 2, 4][index],
            deploymentInputs: structuredClone(receipt.deploymentInputs)
        })),
        contextProbeTimeoutMs: 300_000,
        resourceSampling     : {activeCpuThreshold: 1, expectedIntervalMs: 1000, gapFactor: 2},
        revision             : REVISION,
        schemaVersion        : 'provider-lane-election-plan.v2',
        slo                  : {
            lanes: {
                chat     : buildLaneSlo({context: 131072, cpu: 200, memory: 34359738368, operations: 2}),
                embedding: buildLaneSlo({context: 32768, cpu: 200, memory: 17179869184, operations: 4})
            }
        },
        trialTimeoutMs: 900_000
    }
}

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
        requiredQueueDisposition: 'queued'
    }
}

function buildWorkerReceipt(source, receipt) {
    const contract = {
        chat: {
            callKind: 'chat-queue', operationCounts: [1, 1], outputCounts: [1, 1], priority: 'interactive', role: 'chat', service: 'knowledge-base', stage: 'kb-ask-synthesis'
        },
        'knowledge-base': {
            callKind: 'interactive-single', operationCounts: [1], outputCounts: [1], priority: 'interactive', role: 'embedding', service: 'knowledge-base', stage: 'kb-query-embedding'
        },
        'memory-core': {
            callKind: 'batch-array', operationCounts: [4], outputCounts: [20], priority: 'batch', role: 'embedding', service: 'memory-core', stage: 'mc-wal-drain-embedding'
        },
        orchestrator: {
            callKind: 'batch-array', operationCounts: [2, 2], outputCounts: [8, 8], priority: 'batch', role: 'embedding', service: 'orchestrator', stage: 'unknown'
        }
    }[source];
    const lane           = receipt.lanes[source === 'chat' ? 'chat' : 'embedding'];
    let   operationIndex = 0;
    const operations     = contract.operationCounts.flatMap((count, callIndex) => Array.from({length: count}, () => {
        const index = operationIndex++;

        return {
            callId             : `${source}-${callIndex}`,
            completedAtMs      : 2000 + index,
            enqueuedAtMs       : 1000 + index,
            failureStage       : null,
            id                 : `${source}-activity-${index}`,
            model              : lane.model.id,
            operationStage     : contract.stage,
            outcome            : 'completed',
            priority           : contract.priority,
            provider           : lane.provider,
            providerStartedAtMs: 1500 + index,
            queueDisposition   : 'neo-queued',
            role               : contract.role,
            service            : contract.service
        }
    }));

    return {
        callKind: contract.callKind,
        operations,
        results : contract.outputCounts.map((outputCount, index) => ({
            callId       : `${source}-${index}`,
            completedAtMs: Math.max(...operations.filter(row => row.callId === `${source}-${index}`)
                .map(row => row.completedAtMs)) + 100,
            demandAtMs: 900 + index,
            outcome   : 'completed',
            outputCount
        })),
        schemaVersion: 'provider-lane-election-worker.v1',
        source
    }
}

/**
 * @summary Builds one complete controller-shaped report without exposing a production authority minter.
 */
function buildElectionReport({failAll = false} = {}) {
    const projectName = `neo-provider-election-${REVISION.slice(0, 10)}-${'a'.repeat(12)}`,
          receipts    = [1, 2, 4].map(candidate => {
              const receipt = buildReceipt(candidate);
              receipt.composeProject = projectName;

              return {
                  candidate,
                  compositionReceiptDigest: digestProviderLaneValue(receipt),
                  receipt
              }
          }),
          workload = {
              digest           : digestProviderLaneValue({fixture: 'provider-lane-report'}),
              offeredOperations: {chat: 2, 'knowledge-base': 1, 'memory-core': 1, orchestrator: 2}
          },
          runPlan = buildRunPlan(receipts.map(item => item.receipt)),
          plan = {
              blocks           : 1,
              candidateProfiles: receipts.map(createProviderLaneCandidateProfile),
              resourceSampling : runPlan.resourceSampling,
              slo              : runPlan.slo,
              workload
          },
          contextEvidence = receipts.map(item => buildReportContextEvidence(item)),
          trials = buildProviderLaneCandidateSchedule({blocks: 1})
              .map(slot => buildReportTrial({plan, slot})),
          election = evaluateProviderLaneElection({contextEvidence, plan, trials}),
          evidence = {contextEvidence, trials},
          evidenceDigest = digestProviderLaneValue({
              candidateReceiptDigests: receipts.map(item => item.compositionReceiptDigest),
              evidence,
              projectName,
              repositoryHead         : REVISION
          });

    if (failAll) {
        for (const context of contextEvidence) {
            context.lanes.embedding.overLimitProbe.responseClass = 'provider-error';
            context.lanes.embedding.overLimitProbe.transportStatus = 500
        }
    }

    const measuredElection = failAll
              ? evaluateProviderLaneElection({contextEvidence, plan, trials})
              : election,
          selected = measuredElection.winnerCandidate === null
              ? null
              : receipts.find(item => item.candidate === measuredElection.winnerCandidate);

    return {
        artifacts: {
            candidateReceipts: receipts.map(item => ({
                archiveByteDigest: digestProviderLaneValue({archive: item.candidate}),
                candidate        : item.candidate,
                digest           : item.compositionReceiptDigest,
                file             : `composition-candidate-${item.candidate}.json`
            })),
            evidenceDigest: failAll ? digestProviderLaneValue({
                candidateReceiptDigests: receipts.map(item => item.compositionReceiptDigest),
                evidence,
                projectName,
                repositoryHead         : REVISION
            }) : evidenceDigest,
            planDigest    : measuredElection.planCoordinates.planDigest,
            workloadDigest: workload.digest
        },
        authority: {
            authoritative: true,
            evidenceClass: 'canonical-disposable-plane',
            reason       : 'complete validated matrix on a run-owned disposable Compose project'
        },
        candidateReceipts    : receipts,
        deploymentInputs     : selected ? structuredClone(selected.receipt.deploymentInputs) : null,
        election             : measuredElection,
        evidence,
        projectName,
        repositoryHead       : REVISION,
        schemaVersion        : PROVIDER_LANE_ELECTION_REPORT_SCHEMA_VERSION,
        selectedReceipt      : selected ? structuredClone(selected.receipt) : null,
        selectedReceiptDigest: selected?.compositionReceiptDigest ?? null,
        status               : selected ? 'ELECTED' : 'NO_ELECTION'
    }
}

/**
 * @summary Builds exact supported and over-limit receipts for one candidate.
 */
function buildReportContextEvidence(entry) {
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
                  requestedContextTokens: supported
                      ? lane.contextTokensPerSlotRequired
                      : lane.contextTokensPerSlotRequired + 1,
                  responseBodyDigest: digestProviderLaneValue({candidate: entry.candidate, laneName, mode}),
                  responseClass     : supported ? 'completed' : 'context-limit-refusal',
                  serviceKey        : lane.serviceKey,
                  startedAtMs       : supported ? startedAtMs + 10 : completedAtMs - 100,
                  transportStatus   : supported ? 200 : 400
              }
          };

    return {
        candidate               : entry.candidate,
        completedAtMs,
        compositionReceiptDigest: entry.compositionReceiptDigest,
        lanes                   : {
            chat: {
                observedContextTokensPerSlot: 131072,
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

/**
 * @summary Builds one chronological production-source trial for report-validator falsifiers.
 */
function buildReportTrial({plan, slot}) {
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
          embeddingSources = ['knowledge-base', 'memory-core', 'orchestrator', 'orchestrator'],
          embeddingOperations = embeddingSources.map((source, index) => operation({
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
              sourceCalls   : operations.map(row => ({
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

test.describe('provider-lane election runner authority seams', () => {
    test('consumes exact canonical deployment envelopes for candidates 1, 2, and 4', () => {
        const receipts = [1, 2, 4].map(buildReceipt),
              plan     = validateProviderLaneRunPlan(buildRunPlan(receipts));

        expect(plan.candidateDeploymentInputs.map(row => row.candidate)).toEqual([1, 2, 4]);
        expect(plan.candidateDeploymentInputs[1].deploymentInputs.embeddingParallelSlots).toEqual({
            env  : 'NEO_PROVIDER_LANE_EMBEDDING_SLOTS',
            value: 2
        });
        expect(plan.candidateDeploymentInputs[1].deploymentInputs.embeddingSafeProcessingLimitTokens).toEqual({
            env  : 'NEO_LOCAL_MODELS_EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS',
            value: EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS
        });

        const divergentBand = buildRunPlan(receipts);
        divergentBand.candidateDeploymentInputs[2].deploymentInputs.embeddingSafeProcessingLimitTokens.value = 30000;
        expect(() => validateProviderLaneRunPlan(divergentBand)).toThrow(/must share one embedding safe-processing limit/);

        const fractionalBand = buildRunPlan(receipts);
        for (const row of fractionalBand.candidateDeploymentInputs) {
            row.deploymentInputs.embeddingSafeProcessingLimitTokens.value = 28672.5
        }
        expect(() => validateProviderLaneRunPlan(fractionalBand)).toThrow(/invalid integer embedding safe-processing limit/);

        const wrongEnv = buildRunPlan(receipts);
        wrongEnv.candidateDeploymentInputs[0].deploymentInputs.embeddingParallelSlots.env = 'NEO_FOREIGN_SLOTS';
        expect(() => validateProviderLaneRunPlan(wrongEnv)).toThrow(/invalid canonical deployment input/)
    });

    test('selects adapters by exact provider, endpoint, model, and image tuple', () => {
        const receipt = buildReceipt(1);

        expect(resolveProviderLaneAdapters(receipt)).toMatchObject({
            chat     : {id: 'ollama-chat-v0.32.9'},
            embedding: {id: 'llama-cpp-openai-embeddings-b10380'}
        });

        const alternateImage = structuredClone(receipt);
        alternateImage.lanes.chat.image.digest = `sha256:${'9'.repeat(64)}`;
        expect(validateProviderLaneCompositionReceipt(alternateImage).valid).toBe(true);
        expect(() => resolveProviderLaneAdapters(alternateImage)).toThrow(/closed exact-image adapter/);

        const external = structuredClone(receipt);
        external.lanes.embedding.endpoints.workload.url = 'https://external.example/v1/embeddings';
        expect(() => resolveProviderLaneAdapters(external)).toThrow(/canonical validation/)
    });

    test('normalizes only exact context refusal codes and statuses from raw provider bodies', () => {
        const adapters = resolveProviderLaneAdapters(buildReceipt(1)),
              adapter  = adapters.embedding;

        expect(classifyProviderLaneProbeResponse({
            adapter,
            body  : '{"error":{"type":"exceed_context_size_error"}}',
            status: 400
        })).toMatchObject({responseClass: 'context-limit-refusal', observedOutputTokens: 0});
        expect(classifyProviderLaneProbeResponse({
            adapter,
            body  : '{"error":{"type":"exceed_context_size_error"}}',
            status: 429
        }).responseClass).toBe('provider-error');
        expect(classifyProviderLaneProbeResponse({
            adapter,
            body  : '{"error":{"type":"internal_error"}}',
            status: 500
        }).responseClass).toBe('provider-error');
        expect(classifyProviderLaneProbeResponse({
            adapter,
            body  : '{"error":{"type":"server_error","message":"input (32769 tokens) is too large to process. increase the physical batch size (current batch size: 32768)"}}',
            status: 500
        }).responseClass).toBe('physical-batch-refusal');
        expect(classifyProviderLaneProbeResponse({
            adapter,
            body  : '{"error":{"type":"server_error","message":"unrelated server failure"}}',
            status: 500
        }).responseClass).toBe('provider-error');
        expect(classifyProviderLaneProbeResponse({
            adapter,
            body  : '{"data":[{"embedding":[0]}]}',
            status: 200
        })).toMatchObject({responseClass: 'completed', observedOutputTokens: 1});
        expect(classifyProviderLaneProbeResponse({
            adapter: adapters.chat,
            body   : '{"error":"the prompt is longer than the context length currently available to the model; shorten the prompt, adjust the context length in settings, or use a model with a longer context length"}',
            status : 400
        })).toMatchObject({responseClass: 'context-limit-refusal', observedOutputTokens: 0});
        expect(classifyProviderLaneProbeResponse({
            adapter: adapters.chat,
            body   : '{"error":"rate limited"}',
            status : 429
        }).responseClass).toBe('provider-error')
    });

    test('bounds over-limit request allocation by the exact receipt model ceiling', () => {
        const receipt = buildReceipt(1),
              adapter = resolveProviderLaneAdapters(receipt).embedding,
              lane    = receipt.lanes.embedding;

        const supportedMinimum = createProviderLaneSupportedLimitRequest({
              adapter,
              lane,
              observedContextTokensPerSlot: 32768
          }),
              overLimit        = createProviderLaneOverLimitRequest({
                  adapter,
                  lane,
                  observedContextTokensPerSlot: 32768
              });

        expect(supportedMinimum.requestedContextTokens).toBe(32768);
        expect(JSON.parse(supportedMinimum.body).input).toHaveLength(32768);
        expect(overLimit.requestedContextTokens).toBe(32769);
        expect(JSON.parse(overLimit.body).input).toHaveLength(32769);
        expect(() => createProviderLaneOverLimitRequest({
            adapter,
            lane,
            observedContextTokensPerSlot: lane.model.contextTokensMax + 1
        })).toThrow(/unbounded runtime context/)

        expect(() => createProviderLaneSupportedLimitRequest({
            adapter,
            lane,
            observedContextTokensPerSlot: 32769
        })).toThrow(/exceeds declared batch authority/)
    });

    test('builds the Ollama over-limit probe with truncation and shifting disabled', () => {
        const receipt = buildReceipt(1),
              request = createProviderLaneOverLimitRequest({
                  adapter                     : resolveProviderLaneAdapters(receipt).chat,
                  lane                        : receipt.lanes.chat,
                  observedContextTokensPerSlot: 131072
              }),
              body = JSON.parse(request.body);

        expect(body).toMatchObject({shift: false, stream: false, truncate: false});
        expect(request.requestedContextTokens).toBe(131073)
    });

    test('derives zero CPU and aggregate process RSS from raw Docker receipts', () => {
        const idleStats = {
            cpu_stats   : {cpu_usage: {total_usage: 100}, system_cpu_usage: 1000},
            precpu_stats: {cpu_usage: {total_usage: 100}, system_cpu_usage: 900}
        };

        expect(calculateProviderLaneDockerCpuPercent(idleStats, () => null)).toBe(0);
        expect(parseProviderLaneDockerTopRss({
            Titles   : ['PID', 'RSS'],
            Processes: [['793773', '279664'], ['1141586', '367664']]
        })).toBe((279664 + 367664) * 1024);
        expect(() => parseProviderLaneDockerTopRss({Titles: ['PID'], Processes: [['1']]}))
            .toThrow(/requires PID and RSS/);
        expect(() => parseProviderLaneDockerTopRss({Titles: ['PID', 'RSS'], Processes: []}))
            .toThrow(/requires PID and RSS/)
    });

    test('pins one canonical local Unix Docker authority before mutation', async () => {
        expect(parseProviderLaneDockerEndpoint('unix:///Users/operator/.colima/default/docker.sock'))
            .toBe('/Users/operator/.colima/default/docker.sock');

        const metadata  = {isSocket: () => true},
              authority = await resolveProviderLaneDockerAuthority({
                  inspectEndpoint: async () => 'unix:///tmp/provider-lane.sock',
                  realpathFn     : async value => `${value}.canonical`,
                  statFn         : async () => metadata
              });

        expect(authority).toEqual({
            endpoint  : 'unix:///tmp/provider-lane.sock.canonical',
            socketPath: '/tmp/provider-lane.sock.canonical'
        });
        expect(Object.isFrozen(authority)).toBe(true);

        for (const endpoint of [
            'tcp://127.0.0.1:2375',
            'ssh://operator@example.test',
            'unix://remote.example/tmp/docker.sock',
            'unix:relative.sock'
        ]) {
            expect(() => parseProviderLaneDockerEndpoint(endpoint)).toThrow(/local Unix Docker endpoint/)
        }

        await expect(resolveProviderLaneDockerAuthority({
            inspectEndpoint: async () => 'unix:///tmp/not-a-socket',
            realpathFn     : async value => value,
            statFn         : async () => ({isSocket: () => false})
        })).rejects.toMatchObject({code: 'DOCKER_ENDPOINT_NOT_LOCAL_UNIX'})
    });

    test('stream-bounds provider responses before retaining oversized evidence', async () => {
        await expect(readBoundedProviderLaneResponseBody(new Response('bounded'))).resolves.toBe('bounded');

        const oversized = new Response(new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array(700_000));
                controller.enqueue(new Uint8Array(400_000));
                controller.close()
            }
        }));

        await expect(readBoundedProviderLaneResponseBody(oversized)).rejects.toMatchObject({
            code: 'PROVIDER_RESPONSE_TOO_LARGE'
        })
    });

    test('retains signal ownership through one idempotent teardown and refuses success after interruption', async () => {
        const processTarget = new EventEmitter(),
              controller    = new AbortController();
        let   teardownCount = 0,
              releaseTeardown;
        const cleanup = createProviderLaneCleanup({
                  teardown: async () => {
                      teardownCount++;
                      await new Promise(resolve => {releaseTeardown = resolve})
                  }
              }),
              dispose  = installProviderLaneSignalHandlers({cleanup, controller, processTarget}),
              terminal = completeProviderLaneCleanup({cleanup, controller, dispose});

        await new Promise(resolve => setImmediate(resolve));
        expect(processTarget.listenerCount('SIGINT')).toBe(1);
        expect(processTarget.listenerCount('SIGTERM')).toBe(1);

        processTarget.emit('SIGTERM');
        releaseTeardown();

        await expect(terminal).rejects.toMatchObject({code: 'PROVIDER_LANE_INTERRUPTED'});
        expect(controller.signal.aborted).toBe(true);
        expect(controller.signal.reason).toMatchObject({code: 'PROVIDER_LANE_INTERRUPTED'});
        expect(teardownCount).toBe(1);
        expect(processTarget.listenerCount('SIGINT')).toBe(0);
        expect(processTarget.listenerCount('SIGTERM')).toBe(0)
    });

    test('builds a pure profile only from validated receipt coordinates and its archive digest', () => {
        const receipt = buildReceipt(2),
              digest  = digestProviderLaneValue(receipt),
              profile = createProviderLaneCandidateProfile({compositionReceiptDigest: digest, receipt});

        expect(profile).toMatchObject({
            compositionReceiptDigest: digest,
            embeddingSlots          : 2,
            lanes                   : {
                chat     : {parallelism: 1, protocolAdapter: 'ollama-chat-v0.32.9'},
                embedding: {parallelism: 2, protocolAdapter: 'llama-cpp-openai-embeddings-b10380'}
            }
        });
        expect(profile.deploymentInputs).toBeUndefined()
    });

    test('binds worker identities to controller-selected sources instead of trusting labels', () => {
        const receipt      = buildReceipt(2),
              receiptEntry = {receipt},
              workers      = ['chat', 'knowledge-base', 'memory-core', 'orchestrator']
                  .map(source => ({expectedSource: source, receipt: buildWorkerReceipt(source, receipt)})),
              normalized   = normalizeProviderLaneWorkerOperations({receiptEntry, workerReceipts: workers});

        expect(normalized.chat.operations).toHaveLength(2);
        expect(normalized.chat.sourceCalls).toHaveLength(2);
        expect(normalized.embedding.operations.map(row => row.source)).toEqual([
            'knowledge-base',
            'memory-core', 'memory-core', 'memory-core', 'memory-core',
            'orchestrator', 'orchestrator', 'orchestrator', 'orchestrator'
        ]);
        expect(normalized.embedding.sourceCalls.map(row => row.source)).toEqual([
            'knowledge-base', 'memory-core', 'orchestrator', 'orchestrator'
        ]);
        expect(workers[2].receipt.operations.map(row => row.callId)).toEqual([
            'memory-core-0', 'memory-core-0', 'memory-core-0', 'memory-core-0'
        ]);
        expect(workers[3].receipt.operations.map(row => row.callId)).toEqual([
            'orchestrator-0', 'orchestrator-0', 'orchestrator-1', 'orchestrator-1'
        ]);

        workers[0].receipt.results[0] = {
            callId       : 'chat-0',
            completedAtMs: 2100,
            demandAtMs   : 900,
            outcome      : 'error',
            outputCount  : 0
        };
        expect(normalizeProviderLaneWorkerOperations({receiptEntry, workerReceipts: workers}).chat.sourceCalls[0].outcome)
            .toBe('error');
        workers[0].receipt = buildWorkerReceipt('chat', receipt);

        workers[1].receipt.operations[0].service = 'orchestrator';
        expect(() => normalizeProviderLaneWorkerOperations({receiptEntry, workerReceipts: workers}))
            .toThrow(/cannot be bound to its exact lane/)

        workers[1].receipt = buildWorkerReceipt('orchestrator', receipt);
        expect(() => normalizeProviderLaneWorkerOperations({receiptEntry, workerReceipts: workers}))
            .toThrow(/invalid receipt/);

        workers[1].receipt = buildWorkerReceipt('knowledge-base', receipt);
        workers[1].receipt.results[0].callId = 'foreign-operation';
        expect(() => normalizeProviderLaneWorkerOperations({receiptEntry, workerReceipts: workers}))
            .toThrow(/cannot be bound to its source call/)

        workers[1].receipt = buildWorkerReceipt('knowledge-base', receipt);
        workers[2].receipt.operations[3].callId = 'memory-core-1';
        expect(() => normalizeProviderLaneWorkerOperations({receiptEntry, workerReceipts: workers}))
            .toThrow(/cannot be bound to its exact lane/)
    });

    test('uses production-shaped interactive and true batch scheduler seams', async () => {
        const calls            = [],
              embeddingService = {
                  embedText(text, provider, options) {
                      calls.push({kind: 'interactive-single', options, provider, texts: [text]});
                      return Promise.resolve('interactive')
                  },
                  embedTexts(texts, provider, options) {
                      calls.push({kind: 'batch-array', options, provider, texts});
                      return Promise.resolve(texts.map(() => [0]))
                  }
              };

        await invokeProviderLaneEmbeddingSource({
            embeddingService, options: {stage: 'kb'}, payload: 'kb', provider: 'openAiCompatible', source: 'knowledge-base'
        });
        await invokeProviderLaneEmbeddingSource({
            embeddingService, options: {stage: 'mc'}, payload: ['mc-1', 'mc-2'], provider: 'openAiCompatible', source: 'memory-core'
        });
        await invokeProviderLaneEmbeddingSource({
            embeddingService, options: {stage: 'oc'}, payload: ['oc-1', 'oc-2'], provider: 'openAiCompatible', source: 'orchestrator'
        });

        expect(calls.map(call => call.kind)).toEqual([
            'interactive-single', 'batch-array', 'batch-array'
        ]);
        expect(calls.map(call => call.texts)).toEqual([['kb'], ['mc-1', 'mc-2'], ['oc-1', 'oc-2']]);
        expect(() => invokeProviderLaneEmbeddingSource({
            embeddingService, options: {}, payload: ['singleton'], provider: 'openAiCompatible', source: 'memory-core'
        })).toThrow(/multiple strings/);
        expect(() => invokeProviderLaneEmbeddingSource({
            embeddingService, options: {}, payload: 'wrong-lane', provider: 'openAiCompatible', source: 'chat'
        })).toThrow(/no closed scheduler contract/)
    });

    test('classifies caller-visible provider output rather than lifecycle status alone', () => {
        expect(classifyProviderLaneOperationResult({status: 'fulfilled', value: undefined}, {
            expectedOutputCount: 1,
            kind               : 'embedding'
        })).toBe('error');
        expect(classifyProviderLaneOperationResult({status: 'fulfilled', value: [[0, 1], [2, 3]]}, {
            expectedOutputCount: 2,
            kind               : 'embedding'
        })).toBe('completed');
        expect(classifyProviderLaneOperationResult({
            reason: new Error('OpenAI-Compatible API error: 413 payload refused'),
            status: 'rejected'
        }, {expectedOutputCount: 1, kind: 'embedding'})).toBe('unexpected-refusal')
    });

    test('keeps the benchmark worker free of host binds, sockets, secrets, and public ports', () => {
        const worker     = buildComposition(1).services['provider-lane-worker'],
              serialized = JSON.stringify(worker);

        expect(worker.profiles).toEqual(['provider-lane-election']);
        expect(worker.volumes).toEqual([]);
        expect(worker.networks).toEqual(['neo-mcp-network']);
        expect(worker.ports).toBeUndefined();
        expect(worker.secrets).toBeUndefined();
        expect(serialized).not.toContain('/var/run/docker.sock');
        expect(serialized).not.toContain('.neo-ai/backups');
        expect(worker.environment).toMatchObject({
            GEMINI_API_KEY                                  : '',
            NEO_KB_ASK_API_KEY                              : '',
            NEO_OPENAI_COMPATIBLE_API_KEY                   : '',
            NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_CHUNK_SIZE: '5'
        })
    });

    test('recomputes the public handoff and rejects self-attested election authority', () => {
        const report = buildElectionReport();

        expect(report.schemaVersion).toBe('provider-lane-election-report.v2');
        expect(validateProviderLaneElectionReport(report)).toEqual(report);
        expect(report.selectedReceipt).toEqual(report.candidateReceipts[0].receipt);
        expect(report.selectedReceiptDigest).toBe(report.candidateReceipts[0].compositionReceiptDigest);

        const forgedWinner = structuredClone(report);
        forgedWinner.election.winnerCandidate = 2;
        forgedWinner.selectedReceipt = structuredClone(forgedWinner.candidateReceipts[1].receipt);
        forgedWinner.selectedReceiptDigest = forgedWinner.candidateReceipts[1].compositionReceiptDigest;
        forgedWinner.deploymentInputs = structuredClone(forgedWinner.selectedReceipt.deploymentInputs);
        expect(() => validateProviderLaneElectionReport(forgedWinner)).toThrow(/does not reproduce/);

        const reducedSelection = structuredClone(report);
        delete reducedSelection.selectedReceipt.roles;
        expect(() => validateProviderLaneElectionReport(reducedSelection)).toThrow(/smallest PASS/);

        const digestDrift = structuredClone(report);
        digestDrift.candidateReceipts[0].compositionReceiptDigest = `sha256:${'f'.repeat(64)}`;
        expect(() => validateProviderLaneElectionReport(digestDrift)).toThrow(/drifted candidate receipt/);

        const receiptExtra = structuredClone(report);
        receiptExtra.candidateReceipts[0].receipt.token = 'SECRET';
        receiptExtra.candidateReceipts[0].compositionReceiptDigest =
            digestProviderLaneValue(receiptExtra.candidateReceipts[0].receipt);
        expect(() => validateProviderLaneElectionReport(receiptExtra)).toThrow(/canonical validation/);

        const divergentReceiptBand = structuredClone(report);
        divergentReceiptBand.candidateReceipts[2].receipt
            .deploymentInputs.embeddingSafeProcessingLimitTokens.value = 30000;
        divergentReceiptBand.candidateReceipts[2].compositionReceiptDigest =
            digestProviderLaneValue(divergentReceiptBand.candidateReceipts[2].receipt);
        expect(() => validateProviderLaneElectionReport(divergentReceiptBand))
            .toThrow(/receipts must share one embedding safe-processing limit/);

        const unknownField = structuredClone(report);
        unknownField.evidence.trials[0].lanes.embedding.operations[0].token = 'SECRET';
        expect(() => validateProviderLaneElectionReport(unknownField)).toThrow(/requires exact fields/);

        const forgedAuthority = structuredClone(report);
        forgedAuthority.authority.authoritative = false;
        expect(() => validateProviderLaneElectionReport(forgedAuthority)).toThrow(/forged authority/);

        const noElection = buildElectionReport({failAll: true});
        expect(() => validateProviderLaneElectionReport(noElection)).toThrow(/requires an elected report/);
        expect(validateProviderLaneElectionReport(noElection, {requireElected: false}).status).toBe('NO_ELECTION');

        const extra = structuredClone(report);
        extra.selfAttested = true;
        expect(() => validateProviderLaneElectionReport(extra)).toThrow(/requires exact fields/)
    });

    test('publishes only the winning archived deployment inputs and never falls back', () => {
        const receipts = [1, 2, 4].map(candidate => {
            const receipt = buildReceipt(candidate);
            return {
                candidate,
                compositionReceiptDigest: digestProviderLaneValue(receipt),
                receipt
            }
        });
        const report = projectProviderLaneOutcome({
            election: {
                candidates: [
                    {candidate: 1, status: 'FAIL'},
                    {candidate: 2, status: 'PASS'},
                    {candidate: 4, status: 'PASS'}
                ],
                winnerCandidate: 2
            },
            receipts
        });

        expect(report.status).toBe('ELECTED');
        expect(report.deploymentInputs).toEqual(receipts[1].receipt.deploymentInputs);
        expect(report.selectedReceipt).toMatchObject({
            lanes: {
                chat: {
                    image: {digest: receipts[1].receipt.lanes.chat.image.digest},
                    model: {coordinate: receipts[1].receipt.lanes.chat.model.coordinate}
                },
                embedding: {
                    endpoints: receipts[1].receipt.lanes.embedding.endpoints,
                    model    : {digest: receipts[1].receipt.lanes.embedding.model.digest}
                }
            },
            roles: receipts[1].receipt.roles
        });
        expect(report.selectedReceiptDigest).toBe(receipts[1].compositionReceiptDigest);

        const noElection = projectProviderLaneOutcome({
            election: {
                candidates     : [1, 2, 4].map(candidate => ({candidate, status: 'FAIL'})),
                winnerCandidate: null
            },
            receipts
        });
        expect(noElection.status).toBe('NO_ELECTION');
        expect(noElection.deploymentInputs).toBeNull();
        expect(noElection.selectedReceipt).toBeNull();
        expect(noElection.selectedReceiptDigest).toBeNull();

        expect(() => projectProviderLaneOutcome({
            election: {
                candidates     : [{candidate: 1, status: 'PASS'}, {candidate: 2, status: 'PASS'}],
                winnerCandidate: 2
            },
            receipts
        })).toThrow(/incoherent measured winner/);

        expect(createIncompleteProviderLaneReport({code: 'EVIDENCE_GAP'})).toMatchObject({
            status          : 'INCOMPLETE',
            deploymentInputs: null,
            repositoryHead  : null,
            selectedReceipt : null,
            authority       : {authoritative: false}
        });

        expect(() => validateProviderLaneElectionReport(createIncompleteProviderLaneReport()))
            .toThrow(/no complete canonical controller identity/);

        const requestedHead = 'a'.repeat(40),
              measuredHead  = 'b'.repeat(40),
              mismatch      = createIncompleteProviderLaneReport({
                  code: 'REVISION_MISMATCH', measuredHead, projectName: 'neo-provider-lane-test'
              });

        expect(mismatch.repositoryHead).toBe(measuredHead);
        expect(mismatch.repositoryHead).not.toBe(requestedHead)
    })
});
