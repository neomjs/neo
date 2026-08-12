import {test, expect} from '@playwright/test';

import {
    buildProviderLaneCandidateSchedule,
    createProviderLanePlanDigest,
    evaluateProviderLaneElection
} from '../../../../../../ai/scripts/benchmark/helpers/providerLaneElectionCore.mjs';

const
    CHAT_IMAGE_DIGEST      = `sha256:${'a'.repeat(64)}`,
    CHAT_MODEL_DIGEST      = `sha256:${'b'.repeat(64)}`,
    EMBEDDING_IMAGE_DIGEST = `sha256:${'c'.repeat(64)}`,
    EMBEDDING_MODEL_DIGEST = `sha256:${'d'.repeat(64)}`,
    ROLE_MAP_DIGEST        = `sha256:${'f'.repeat(64)}`,
    WORKLOAD_DIGEST        = `sha256:${'e'.repeat(64)}`;

/**
 * @summary Builds a complete synthetic matrix for pure measurement and election tests.
 */
function buildFixture() {
    const plan = {
        blocks           : 1,
        candidateProfiles: [1, 2, 4].map(buildCandidateProfile),
        resourceSampling : {
            activeCpuThreshold: 1,
            expectedIntervalMs: 1000,
            gapFactor         : 2
        },
        slo: {
            lanes: {
                chat: buildLaneSlo({
                    maxCpuHighWaterPercent : 200,
                    maxRssHighWaterBytes   : 3_000_000_000,
                    minCompletedOperations : 2,
                    minContextTokensPerSlot: 131_072,
                    minThroughputPerSecond : 0.3
                }),
                embedding: buildLaneSlo({
                    maxCpuHighWaterPercent : 400,
                    maxRssHighWaterBytes   : 5_000_000_000,
                    minCompletedOperations : 4,
                    minContextTokensPerSlot: 8192,
                    minThroughputPerSecond : 0.5
                })
            }
        },
        workload: {
            digest           : WORKLOAD_DIGEST,
            offeredOperations: {
                chat            : 2,
                'knowledge-base': 1,
                'memory-core'   : 1,
                orchestrator    : 2
            }
        }
    };

    const schedule        = buildProviderLaneCandidateSchedule({blocks: plan.blocks}),
          contextEvidence = [1, 2, 4].map(candidate => buildContextEvidence({candidate, plan})),
          trials          = schedule.map(slot => buildTrial({plan, slot}));

    return {contextEvidence, plan, schedule, trials}
}

/**
 * @summary Shapes one composition-derived candidate profile.
 */
function buildCandidateProfile(embeddingSlots) {
    const profile = {
        compositionReceiptDigest: `sha256:${String(embeddingSlots).repeat(64)}`,
        compositionSchemaVersion: 'provider-lane-composition.v1',
        embeddingSlots,
        lanes                   : {
            chat: {
                baseUrl                     : 'http://chat-model:11434',
                contextTokensPerSlotRequired: 131_072,
                cpuCores                    : 2,
                endpointDigest              : `sha256:${'6'.repeat(64)}`,
                imageDigest                 : CHAT_IMAGE_DIGEST,
                imageReference              : 'ollama/ollama:0.32.9',
                memoryBytes                 : 3_000_000_000,
                modelCoordinate             : 'ollama://gemma4:26b@immutable',
                modelDigest                 : CHAT_MODEL_DIGEST,
                modelDigestKind             : 'ollama-model-weights',
                modelId                     : 'gemma4:26b',
                parallelism                 : 1,
                protocolAdapter             : 'ollama-chat-v0.32.9',
                provider                    : 'ollama',
                serviceKey                  : 'chat-model',
                totalContextTokens          : 131_072
            },
            embedding: {
                baseUrl                     : 'http://embedding-model:8080',
                contextTokensPerSlotRequired: 8192,
                cpuCores                    : 2,
                endpointDigest              : `sha256:${'7'.repeat(64)}`,
                imageDigest                 : EMBEDDING_IMAGE_DIGEST,
                imageReference              : 'ghcr.io/ggml-org/llama.cpp:server-b10380',
                memoryBytes                 : 5_000_000_000,
                modelCoordinate             : 'hf://Qwen/Qwen3-Embedding-8B-GGUF@immutable/model.gguf',
                modelDigest                 : EMBEDDING_MODEL_DIGEST,
                modelDigestKind             : 'gguf-file',
                modelId                     : 'qwen3-embedding-8b',
                parallelism                 : embeddingSlots,
                protocolAdapter             : 'llama-cpp-openai-embeddings-b10380',
                provider                    : 'openAiCompatible',
                serviceKey                  : 'embedding-model',
                totalContextTokens          : embeddingSlots * 8192
            }
        },
        roleMapDigest : ROLE_MAP_DIGEST,
        totalResources: {cpuCores: 4, memoryBytes: 8_000_000_000}
    };

    return profile
}

/**
 * @summary Shapes one explicit lane SLO.
 */
function buildLaneSlo({
    maxCpuHighWaterPercent,
    maxRssHighWaterBytes,
    minCompletedOperations,
    minContextTokensPerSlot,
    minThroughputPerSecond
}) {
    return {
        maxCpuHighWaterPercent,
        maxErrors               : 0,
        maxNeoQueueWaitMs       : 1500,
        maxProgressGapMs        : 4000,
        maxProviderDurationMs   : 3000,
        maxResourceGapCount     : 0,
        maxRssHighWaterBytes,
        maxUnexpectedRefusals   : 0,
        minCompletedOperations,
        minContextTokensPerSlot,
        minResourceCoverageRatio: 0.95,
        minThroughputPerSecond,
        requiredQueueDisposition: 'queued'
    }
}

/**
 * @summary Shapes one chronological trial with four overlapping demand sources and raw
 * resource samples.
 */
function buildTrial({plan, slot}) {
    const startedAtMs    = 10_000 + slot.executionIndex * 10_000,
          completedAtMs  = startedAtMs + 5000,
          profile        = plan.candidateProfiles.find(item => item.embeddingSlots === slot.candidate),
          chatOperations = [
              buildOperation({
                  completedAtMs      : startedAtMs + 1500,
                  enqueuedAtMs       : startedAtMs + 100,
                  id                 : `${slot.id}:chat:0`,
                  providerStartedAtMs: startedAtMs + 200,
                  source             : 'chat'
              }),
              buildOperation({
                  completedAtMs      : startedAtMs + 2500,
                  enqueuedAtMs       : startedAtMs + 200,
                  id                 : `${slot.id}:chat:1`,
                  providerStartedAtMs: startedAtMs + 1500,
                  source             : 'chat'
              })
          ],
          embeddingOperations = buildEmbeddingOperations({slot, startedAtMs});

    return {
        candidate               : slot.candidate,
        completedAtMs,
        compositionReceiptDigest: profile.compositionReceiptDigest,
        executionIndex          : slot.executionIndex,
        lanes                   : {
            chat: {
                operations     : chatOperations,
                resourceSamples: buildResourceSamples({cpuPercent: 180, rssBytes: 2_500_000_000, startedAtMs}),
                runtimeProfile : {...profile.lanes.chat},
                sourceCalls    : buildSourceCalls(chatOperations)
            },
            embedding: {
                operations     : embeddingOperations,
                resourceSamples: buildResourceSamples({cpuPercent: 190, rssBytes: 4_000_000_000, startedAtMs}),
                runtimeProfile : {...profile.lanes.embedding},
                sourceCalls    : buildSourceCalls(embeddingOperations)
            }
        },
        residencyBefore: {
            lanes: {
                chat     : {modelDigest: CHAT_MODEL_DIGEST, resident: true},
                embedding: {modelDigest: null, resident: false}
            },
            observedAtMs: startedAtMs - 1
        },
        scheduleId    : slot.id,
        startedAtMs,
        workloadDigest: WORKLOAD_DIGEST
    }
}

/**
 * @summary Shapes one candidate-level context observation and refusal pair outside workload timing.
 */
function buildContextEvidence({candidate, plan}) {
    const profile       = plan.candidateProfiles.find(item => item.embeddingSlots === candidate),
          startedAtMs   = candidate * 1000,
          completedAtMs = startedAtMs + 500;

    return {
        candidate,
        completedAtMs,
        compositionReceiptDigest: profile.compositionReceiptDigest,
        lanes                   : {
            chat: {
                observedContextTokensPerSlot: 131_072,
                overLimitProbe              : buildOverLimitProbe({
                    candidate,
                    completedAtMs,
                    laneName             : 'chat',
                    observedContextTokens: 131_072,
                    profile,
                    startedAtMs
                })
            },
            embedding: {
                observedContextTokensPerSlot: 8192,
                overLimitProbe              : buildOverLimitProbe({
                    candidate,
                    completedAtMs,
                    laneName             : 'embedding',
                    observedContextTokens: 8192,
                    profile,
                    startedAtMs
                })
            }
        },
        startedAtMs
    }
}

/**
 * @summary Shapes a raw, identity-bound provider refusal receipt for one over-limit request.
 */
function buildOverLimitProbe({candidate, completedAtMs, laneName, observedContextTokens, profile, startedAtMs}) {
    return {
        completedAtMs         : completedAtMs - 10,
        id                    : `candidate-${candidate}:${laneName}:over-limit`,
        modelDigest           : profile.lanes[laneName].modelDigest,
        observedOutputTokens  : 0,
        protocolAdapter       : profile.lanes[laneName].protocolAdapter,
        requestedContextTokens: observedContextTokens + 1,
        responseBodyDigest    : `sha256:${'8'.repeat(64)}`,
        responseClass         : 'context-limit-refusal',
        serviceKey            : profile.lanes[laneName].serviceKey,
        startedAtMs           : completedAtMs - 100,
        transportStatus       : 400
    }
}

/**
 * @summary Shapes four embedding operations whose provider concurrency matches the candidate.
 */
function buildEmbeddingOperations({slot, startedAtMs}) {
    const sources           = ['knowledge-base', 'memory-core', 'orchestrator', 'orchestrator'],
          startsByCandidate = {
              1: [300, 1300, 2300, 3300],
              2: [300, 300, 1300, 1300],
              4: [300, 300, 300, 1300]
          };

    return sources.map((source, index) => {
        const providerStartedAtMs = startedAtMs + startsByCandidate[slot.candidate][index];

        return buildOperation({
            completedAtMs: providerStartedAtMs + 900,
            enqueuedAtMs : startedAtMs + 150 + index * 10,
            id           : `${slot.id}:${source}:${index}`,
            providerStartedAtMs,
            source
        })
    })
}

/**
 * @summary Shapes one queued provider lifecycle row.
 */
function buildOperation({completedAtMs, enqueuedAtMs, id, providerStartedAtMs, source}) {
    return {
        callId          : `${id}:call`,
        completedAtMs,
        enqueuedAtMs,
        id,
        outcome         : 'completed',
        providerStartedAtMs,
        queueDisposition: 'queued',
        source
    }
}

/**
 * @summary Projects caller-visible progress separately from provider-operation timing.
 */
function buildSourceCalls(operations) {
    return operations.map(operation => ({
        completedAtMs: operation.completedAtMs,
        demandAtMs   : operation.enqueuedAtMs ?? operation.providerStartedAtMs,
        id           : operation.callId,
        outcome      : operation.outcome,
        source       : operation.source
    }))
}

/**
 * @summary Shapes raw chronological CPU/RSS samples covering one 5-second trial.
 */
function buildResourceSamples({cpuPercent, rssBytes, startedAtMs}) {
    return Array.from({length: 6}, (_, index) => ({
        atMs      : startedAtMs + index * 1000,
        cpuPercent: cpuPercent + index,
        rssBytes  : rssBytes + index
    }))
}

test.describe('providerLaneElectionCore', () => {
    test('builds one genuinely counterbalanced continuous stream across all sequence boundaries', () => {
        const schedule = buildProviderLaneCandidateSchedule({blocks: 1}),
              counts   = new Map();

        expect(schedule).toHaveLength(18);
        expect(new Set(schedule.map(slot => slot.id)).size).toBe(18);
        expect(schedule.filter(slot => slot.candidate === 1)).toHaveLength(6);
        expect(schedule.filter(slot => slot.candidate === 2)).toHaveLength(6);
        expect(schedule.filter(slot => slot.candidate === 4)).toHaveLength(6);

        for (let index = 1; index < schedule.length; index++) {
            const prior = schedule[index - 1].candidate,
                  next  = schedule[index].candidate,
                  key   = `${prior}->${next}`;

            expect(next).not.toBe(prior);
            counts.set(key, (counts.get(key) ?? 0) + 1)
        }

        const pairCounts = ['1->2', '1->4', '2->1', '2->4', '4->1', '4->2'].map(key => counts.get(key));
        expect(Math.max(...pairCounts) - Math.min(...pairCounts)).toBe(1)
    });

    test('computes the smallest measured winner without minting deployment authority', () => {
        const fixture            = buildFixture(),
              firstCandidateCall = fixture.trials.find(trial => trial.candidate === 1)
                  .lanes.embedding.sourceCalls[0];

        firstCandidateCall.outcome = 'error';

        const result = evaluateProviderLaneElection(fixture);

        expect(result.winnerCandidate).toBe(2);
        expect(result.authority).toBeUndefined();
        expect(result.electedCandidate).toBeUndefined();
        expect(result.immutableInputs).toBeUndefined();
        expect(result.planCoordinates.workloadOfferedOperations).toEqual(fixture.plan.workload.offeredOperations);
        expect(result.jointSlo.lanes.embedding.minContextTokensPerSlot).toBe(8192);
        expect(result.candidates[0].trials[0].compositionReceiptDigest).toBe(
            fixture.trials[0].compositionReceiptDigest
        );
        expect(result.candidates[0].trials[0].lanes.embedding.resourceSamples).toEqual(
            fixture.trials[0].lanes.embedding.resourceSamples
        );
        expect(result.candidates.map(candidate => [candidate.candidate, candidate.status])).toEqual([
            [1, 'FAIL'],
            [2, 'PASS'],
            [4, 'PASS']
        ])
    });

    test('does not accept or echo caller-supplied authority and deployment-input envelopes', () => {
        const fixture = buildFixture(),
              call    = fixture.trials.find(trial => trial.candidate === 1).lanes.embedding.sourceCalls[0];

        call.outcome = 'error';
        fixture.plan.evidence = {canonicalPlane: true, token: 'AUTHORITY_SECRET'};
        fixture.plan.candidateProfiles[1].deploymentInputs = {
            embeddingParallelSlots: {
                env  : 'NEO_PROVIDER_LANE_EMBEDDING_SLOT_COUNT',
                value: 2
            }
        };

        const result     = evaluateProviderLaneElection(fixture),
              serialized = JSON.stringify(result);

        expect(result.winnerCandidate).toBe(2);
        expect(serialized).not.toContain('AUTHORITY_SECRET');
        expect(serialized).not.toContain('NEO_PROVIDER_LANE_EMBEDDING_SLOT_COUNT');
        expect(result.authority).toBeUndefined();
        expect(result.immutableInputs).toBeUndefined()
    });

    test('returns no measured winner without fallback or clamp when every candidate fails', () => {
        const fixture = buildFixture();

        for (const candidate of [1, 2, 4]) {
            fixture.trials.find(trial => trial.candidate === candidate).lanes.chat.sourceCalls[0].outcome = 'error'
        }

        const result = evaluateProviderLaneElection(fixture);

        expect(result.winnerCandidate).toBeNull();
        expect(result.candidates.every(candidate => candidate.status === 'FAIL')).toBe(true)
    });

    test('derives queue/provider/throughput/progress and preserves not-applicable queue wait as null', () => {
        const fixture = buildFixture();

        fixture.plan.slo.lanes.embedding.requiredQueueDisposition = 'not-applicable';
        for (const trial of fixture.trials) {
            for (const operation of trial.lanes.embedding.operations) {
                operation.enqueuedAtMs = null;
                operation.queueDisposition = 'not-applicable'
            }
        }

        const result = evaluateProviderLaneElection(fixture),
              trial  = result.candidates[0].trials[0].lanes.embedding,
              queue  = result.candidates[0].uncertainty.embedding.maxNeoQueueWaitMs;

        expect(trial.maxNeoQueueWaitMs).toBeNull();
        expect(trial.maxProviderDurationMs).toBe(900);
        expect(trial.throughputPerSecond).toBe(0.8);
        expect(queue).toEqual({max: null, median: null, min: null, n: 0, observedRange: null, p95: null})
    });

    test('derives durable progress from source calls while retaining every provider chunk', () => {
        const fixture    = buildFixture(),
              trial      = fixture.trials.find(item => item.candidate === 4),
              lane       = trial.lanes.embedding,
              memoryCall = lane.sourceCalls.find(call => call.source === 'memory-core');

        const memoryOperation = lane.operations.find(operation => operation.source === 'memory-core');
        lane.operations.push(
            {...memoryOperation, completedAtMs: trial.startedAtMs + 2100, id: `${memoryOperation.id}:chunk-2`, providerStartedAtMs: trial.startedAtMs + 1300},
            {...memoryOperation, completedAtMs: trial.startedAtMs + 3000, id: `${memoryOperation.id}:chunk-3`, providerStartedAtMs: trial.startedAtMs + 2200},
            {...memoryOperation, completedAtMs: trial.startedAtMs + 3900, id: `${memoryOperation.id}:chunk-4`, providerStartedAtMs: trial.startedAtMs + 3100}
        );
        memoryCall.completedAtMs = trial.startedAtMs + 4000;

        const result    = evaluateProviderLaneElection(fixture),
              candidate = result.candidates.find(item => item.candidate === 4),
              observed  = candidate.trials[0].lanes.embedding;

        expect(observed.providerOperationCount).toBe(7);
        expect(observed.completedOperations).toBe(4);
        expect(observed.throughputPerSecond).toBe(0.8);
        expect(observed.sourceCalls.filter(call => call.source === 'memory-core')).toHaveLength(1);

        const failedFixture = buildFixture(),
              failedTrial   = failedFixture.trials.find(item => item.candidate === 4),
              failedCall    = failedTrial.lanes.embedding.sourceCalls.find(call => call.source === 'memory-core');

        failedCall.outcome = 'error';

        const failedCandidate = evaluateProviderLaneElection(failedFixture).candidates.find(item => item.candidate === 4),
              failedObserved  = failedCandidate.trials[0].lanes.embedding;

        expect(failedObserved.providerOperationCount).toBe(4);
        expect(failedObserved.completedOperations).toBe(3);
        expect(failedObserved.errorCount).toBe(1);
        expect(failedCandidate.failures.map(failure => failure.code)).toContain('ERROR_BUDGET_EXCEEDED')
    });

    test('derives CPU/RSS coverage from raw chronological samples and fails real coverage gaps', () => {
        const fixture = buildFixture(),
              trial   = fixture.trials.find(item => item.candidate === 2);

        trial.lanes.embedding.resourceSamples = [
            trial.lanes.embedding.resourceSamples[0],
            trial.lanes.embedding.resourceSamples.at(-1)
        ];

        const result    = evaluateProviderLaneElection(fixture),
              candidate = result.candidates.find(item => item.candidate === 2),
              codes     = candidate.failures.map(failure => failure.code);

        expect(codes).toEqual(expect.arrayContaining([
            'RESOURCE_COVERAGE_BELOW_SLO',
            'RESOURCE_GAPS_EXCEEDED'
        ]));
        expect(candidate.trials[0].lanes.embedding.resourceSampleCount).toBe(2);
        expect(candidate.trials[0].lanes.embedding.resourceCoverageRatio).toBe(0)
    });

    test('fails runtime allocation, CPU, and RSS containment independently of the joint SLO', () => {
        const fixture = buildFixture(),
              trial   = fixture.trials.find(item => item.candidate === 4);

        trial.lanes.embedding.resourceSamples[2].cpuPercent = 201;
        trial.lanes.embedding.resourceSamples[2].rssBytes = 5_000_000_001;

        const result = evaluateProviderLaneElection(fixture),
              codes  = result.candidates.find(item => item.candidate === 4).failures.map(failure => failure.code);

        expect(codes).toEqual(expect.arrayContaining([
            'CPU_ALLOCATION_EXCEEDED',
            'RSS_ALLOCATION_EXCEEDED'
        ]));

        trial.lanes.embedding.runtimeProfile.cpuCores = 3;
        expect(() => evaluateProviderLaneElection(fixture)).toThrow(/runtime profile does not match declared cpuCores/)
    });

    test('requires exact workload identity, per-source cardinality, and lifecycle-proven concurrency', () => {
        const digestDrift = buildFixture();
        digestDrift.trials[0].workloadDigest = `sha256:${'9'.repeat(64)}`;
        expect(() => evaluateProviderLaneElection(digestDrift)).toThrow(/changed the immutable workload digest/);

        const missingSource = buildFixture();
        const removedCall   = missingSource.trials[0].lanes.embedding.sourceCalls.pop();
        missingSource.trials[0].lanes.embedding.operations = missingSource.trials[0].lanes.embedding.operations
            .filter(operation => operation.callId !== removedCall.id);
        expect(() => evaluateProviderLaneElection(missingSource)).toThrow(/source orchestrator offered 1; fixed workload requires 2/);

        const sequential = buildFixture(),
              trial      = sequential.trials.find(item => item.candidate === 2),
              operations = trial.lanes.embedding.operations.filter(item => item.source === 'orchestrator');

        operations.forEach((operation, index) => {
            operation.enqueuedAtMs = trial.startedAtMs + 2600 + index * 900;
            operation.providerStartedAtMs = trial.startedAtMs + 2700 + index * 900;
            operation.completedAtMs = trial.startedAtMs + 3500 + index * 900;

            const sourceCall = trial.lanes.embedding.sourceCalls.find(item => item.id === operation.callId);

            sourceCall.completedAtMs = operation.completedAtMs;
            sourceCall.demandAtMs = operation.enqueuedAtMs
        });

        const result = evaluateProviderLaneElection(sequential),
              codes  = result.candidates.find(item => item.candidate === 2).failures.map(failure => failure.code);

        expect(codes).toContain('WORKLOAD_NOT_CONCURRENT')
    });

    test('requires chronological execution timestamps matching the real counterbalanced stream', () => {
        const relabeled = buildFixture();
        [relabeled.trials[0], relabeled.trials[1]] = [relabeled.trials[1], relabeled.trials[0]];
        expect(() => evaluateProviderLaneElection(relabeled)).toThrow(/does not match counterbalanced slot/);

        const overlapping = buildFixture();
        overlapping.trials[1].startedAtMs = overlapping.trials[0].completedAtMs - 1;
        expect(() => evaluateProviderLaneElection(overlapping)).toThrow(/overlaps the previous candidate trial/)
    });

    test('rejects provider execution which exceeds the observed candidate parallelism', () => {
        const fixture = buildFixture(),
              trial   = fixture.trials.find(item => item.candidate === 1);

        trial.lanes.embedding.operations[1].providerStartedAtMs = trial.lanes.embedding.operations[0].providerStartedAtMs;

        expect(() => evaluateProviderLaneElection(fixture)).toThrow(/exceeds its runtime parallelism/)
    });

    test('separates provisioned slots from the three-process workload concurrency ceiling', () => {
        const fixture = buildFixture(),
              trial   = fixture.trials.find(item => item.candidate === 4);

        const result    = evaluateProviderLaneElection(fixture),
              candidate = result.candidates.find(item => item.candidate === 4),
              lane      = candidate.trials[0].lanes.embedding;

        expect(candidate.status).toBe('PASS');
        expect(lane.runtimeProfile.parallelism).toBe(4);
        expect(lane.observedMaxProviderConcurrency).toBe(3)
    });

    test('fails context/refusal/progress from derived receipts rather than configured knobs', () => {
        const fixture = buildFixture(),
              context = fixture.contextEvidence.find(item => item.candidate === 2),
              trial   = fixture.trials.find(item => item.candidate === 2);

        context.lanes.embedding.observedContextTokensPerSlot = 4096;
        Object.assign(context.lanes.embedding.overLimitProbe, {
            observedOutputTokens: 32,
            responseClass       : 'completed',
            transportStatus     : 200
        });
        trial.lanes.embedding.sourceCalls.forEach(call => {
            call.outcome = 'error'
        });

        const result = evaluateProviderLaneElection(fixture),
              codes  = result.candidates.find(item => item.candidate === 2).failures.map(failure => failure.code);

        expect(codes).toEqual(expect.arrayContaining([
            'CONTEXT_BELOW_SLO',
            'OVER_LIMIT_NOT_REFUSED',
            'ERROR_BUDGET_EXCEEDED',
            'PROGRESS_BELOW_SLO'
        ]))
    });

    test('cannot lower the joint SLO beneath the composition-required per-slot context', () => {
        const fixture = buildFixture();

        fixture.plan.slo.lanes.embedding.minContextTokensPerSlot = 4096;
        for (const context of fixture.contextEvidence) {
            context.lanes.embedding.observedContextTokensPerSlot = 4096;
            context.lanes.embedding.overLimitProbe.requestedContextTokens = 4097
        }

        expect(() => evaluateProviderLaneElection(fixture)).toThrow(
            /embedding context floor must equal the composition-required per-slot context/
        )
    });

    test('aborts on fixed-envelope, identity, service-separation, or allocation drift', () => {
        const envelope = buildFixture();
        envelope.plan.candidateProfiles[2].totalResources.cpuCores = 5;
        envelope.plan.candidateProfiles[2].lanes.embedding.cpuCores = 3;
        expect(() => evaluateProviderLaneElection(envelope)).toThrow(/changed the fixed total CPU\/memory envelope/);

        const identity = buildFixture();
        identity.plan.candidateProfiles[2].lanes.embedding.modelDigest = `sha256:${'8'.repeat(64)}`;
        expect(() => evaluateProviderLaneElection(identity)).toThrow(/changed embedding\.modelDigest/);

        const sameService = buildFixture();
        sameService.plan.candidateProfiles[0].lanes.embedding.serviceKey = 'chat-model';
        sameService.plan.candidateProfiles[0].lanes.embedding.baseUrl = 'http://chat-model:8080';
        expect(() => evaluateProviderLaneElection(sameService)).toThrow(/distinct chat and embedding service identities/);

        const allocation = buildFixture();
        allocation.plan.candidateProfiles[0].lanes.embedding.memoryBytes--;
        expect(() => evaluateProviderLaneElection(allocation)).toThrow(/must exactly consume/)
    });

    test('binds the canonical plan digest to complete measurement coordinates', () => {
        const fixture = buildFixture(),
              before  = createProviderLanePlanDigest(fixture.plan);

        fixture.plan.slo.lanes.embedding.maxProviderDurationMs++;

        expect(createProviderLanePlanDigest(fixture.plan)).not.toBe(before)
    });

    test('binds each captured trial to its exact candidate composition receipt', () => {
        const fixture = buildFixture(),
              trial   = fixture.trials.find(item => item.candidate === 2);

        fixture.plan.candidateProfiles[1].compositionReceiptDigest = `sha256:${'9'.repeat(64)}`;
        fixture.contextEvidence.find(item => item.candidate === 2).compositionReceiptDigest =
            fixture.plan.candidateProfiles[1].compositionReceiptDigest;

        expect(() => evaluateProviderLaneElection(fixture)).toThrow(
            /does not match candidate 2's composition receipt/
        );
        expect(trial.compositionReceiptDigest).not.toBe(
            fixture.plan.candidateProfiles[1].compositionReceiptDigest
        )
    });

    test('rejects alternate spellings of canonical sha256 digests', () => {
        const missingPrefix = buildFixture();
        missingPrefix.plan.candidateProfiles[0].compositionReceiptDigest = '1'.repeat(64);
        expect(() => createProviderLanePlanDigest(missingPrefix.plan)).toThrow(
            /requires immutable validated composition provenance/
        );

        const uppercase = buildFixture();
        uppercase.plan.candidateProfiles[0].compositionReceiptDigest = `sha256:${'A'.repeat(64)}`;
        expect(() => createProviderLanePlanDigest(uppercase.plan)).toThrow(
            /requires immutable validated composition provenance/
        )
    });

    test('requires a normalized identity-bound refusal receipt instead of an asserted boolean', () => {
        const fixture = buildFixture(),
              probe   = fixture.contextEvidence[0].lanes.embedding.overLimitProbe;

        probe.serviceKey = 'wrong-provider';
        expect(() => evaluateProviderLaneElection(fixture)).toThrow(/truthful identity-bound context evidence/);

        const inconsistent = buildFixture();
        inconsistent.contextEvidence[0].lanes.embedding.overLimitProbe.transportStatus = 200;
        expect(() => evaluateProviderLaneElection(inconsistent)).toThrow(/inconsistent over-limit provider response/)
    });

    test('treats a runner-normalized provider error as a failed over-limit probe', () => {
        const fixture = buildFixture(),
              probe   = fixture.contextEvidence.find(item => item.candidate === 2).lanes.embedding.overLimitProbe;

        Object.assign(probe, {
            responseClass  : 'provider-error',
            transportStatus: 429
        });

        const result = evaluateProviderLaneElection(fixture),
              lane   = result.candidates.find(item => item.candidate === 2).contextEvidence.lanes.embedding,
              codes  = result.candidates.find(item => item.candidate === 2).failures.map(failure => failure.code);

        expect(lane.overLimitProbe.responseClass).toBe('provider-error');
        expect(codes).toContain('OVER_LIMIT_NOT_REFUSED')
    });

    test('binds immutable composition coordinates without owning deployment inputs', () => {
        const endpointDrift = buildFixture();
        endpointDrift.plan.candidateProfiles[2].lanes.embedding.endpointDigest = `sha256:${'9'.repeat(64)}`;
        expect(() => evaluateProviderLaneElection(endpointDrift)).toThrow(/changed embedding\.endpointDigest/);

        const receiptDrift = buildFixture();
        receiptDrift.plan.candidateProfiles[2].compositionReceiptDigest = `sha256:${'9'.repeat(64)}`;
        expect(createProviderLanePlanDigest(receiptDrift.plan)).not.toBe(createProviderLanePlanDigest(buildFixture().plan))
    });

    test('projects allowlisted fields and hashes caller-owned request identifiers', () => {
        const fixture = buildFixture(),
              trial   = fixture.trials[0];

        fixture.plan.slo.lanes.embedding.token = 'SLO_SECRET';
        fixture.plan.resourceSampling.token = 'SAMPLER_SECRET';
        trial.lanes.embedding.runtimeProfile.token = 'RUNTIME_SECRET';
        trial.lanes.embedding.operations[0].id = '/tenant/private/corpus/row';
        fixture.contextEvidence[0].lanes.embedding.overLimitProbe.id = 'sk-private-provider-token';

        const result     = evaluateProviderLaneElection(fixture),
              serialized = JSON.stringify(result),
              lane       = result.candidates[0].trials[0].lanes.embedding,
              context    = result.candidates[0].contextEvidence.lanes.embedding;

        expect(serialized).not.toContain('SECRET');
        expect(serialized).not.toContain('/tenant/private/corpus/row');
        expect(serialized).not.toContain('sk-private-provider-token');
        expect(result.jointSlo.lanes.embedding.token).toBeUndefined();
        expect(result.planCoordinates.resourceSampling.token).toBeUndefined();
        expect(lane.runtimeProfile.token).toBeUndefined();
        expect(lane.operations[0].id).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(context.overLimitProbe.id).toMatch(/^sha256:[0-9a-f]{64}$/)
    });
});
