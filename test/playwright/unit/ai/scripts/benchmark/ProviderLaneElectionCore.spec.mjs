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
    WORKLOAD_DIGEST        = `sha256:${'e'.repeat(64)}`;

/**
 * @summary Builds a complete synthetic matrix. Synthetic controls intentionally cannot emit
 * deployment inputs; tests mutate causal coordinates and inspect the provisional evaluation.
 */
function buildFixture({evidenceClass = 'synthetic-control'} = {}) {
    const plan = {
        blocks           : 1,
        candidateProfiles: [1, 2, 4].map(embeddingSlots => ({
            embeddingSlots,
            lanes: {
                chat: {
                    contextLimitCode  : 'CONTEXT_LIMIT_EXCEEDED',
                    contextLimitStatus: 400,
                    cpuCores          : 2,
                    imageDigest       : CHAT_IMAGE_DIGEST,
                    memoryBytes       : 3_000_000_000,
                    modelDigest       : CHAT_MODEL_DIGEST,
                    parallelism       : 1,
                    serviceKey        : 'chat-model'
                },
                embedding: {
                    contextLimitCode  : 'CONTEXT_LIMIT_EXCEEDED',
                    contextLimitStatus: 400,
                    cpuCores          : 2,
                    imageDigest       : EMBEDDING_IMAGE_DIGEST,
                    memoryBytes       : 5_000_000_000,
                    modelDigest       : EMBEDDING_MODEL_DIGEST,
                    parallelism       : embeddingSlots,
                    serviceKey        : 'embedding-model'
                }
            },
            totalResources: {cpuCores: 4, memoryBytes: 8_000_000_000}
        })),
        evidence        : {evidenceClass: 'synthetic-control'},
        resourceSampling: {
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

    if (evidenceClass === 'exact-head-candidate') {
        plan.evidence = {
            canonicalPlane: true,
            evidenceClass,
            hardwareId    : 'canonical-cpu-plane',
            profileDigest : createProviderLanePlanDigest(plan),
            repositoryHead: '1'.repeat(40),
            runnerDigest  : `sha256:${'2'.repeat(64)}`
        }
    }

    const schedule = buildProviderLaneCandidateSchedule({blocks: plan.blocks}),
          trials   = schedule.map(slot => buildTrial({plan, slot}));

    return {plan, schedule, trials}
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
    const startedAtMs   = 10_000 + slot.executionIndex * 10_000,
          completedAtMs = startedAtMs + 5000,
          profile       = plan.candidateProfiles.find(item => item.embeddingSlots === slot.candidate);

    return {
        candidate     : slot.candidate,
        completedAtMs,
        executionIndex: slot.executionIndex,
        lanes         : {
            chat: {
                observedContextTokensPerSlot: 131_072,
                operations                  : [
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
                overLimitProbe : buildOverLimitProbe({
                    laneName             : 'chat',
                    observedContextTokens: 131_072,
                    profile,
                    slot,
                    startedAtMs
                }),
                resourceSamples: buildResourceSamples({cpuPercent: 180, rssBytes: 2_500_000_000, startedAtMs}),
                runtimeProfile : {...profile.lanes.chat}
            },
            embedding: {
                observedContextTokensPerSlot: 8192,
                operations                  : buildEmbeddingOperations({slot, startedAtMs}),
                overLimitProbe              : buildOverLimitProbe({
                    laneName             : 'embedding',
                    observedContextTokens: 8192,
                    profile,
                    slot,
                    startedAtMs
                }),
                resourceSamples: buildResourceSamples({cpuPercent: 190, rssBytes: 4_000_000_000, startedAtMs}),
                runtimeProfile : {...profile.lanes.embedding}
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
 * @summary Shapes a raw, identity-bound provider refusal receipt for one over-limit request.
 */
function buildOverLimitProbe({laneName, observedContextTokens, profile, slot, startedAtMs}) {
    return {
        completedAtMs         : startedAtMs + 4400,
        id                    : `${slot.id}:${laneName}:over-limit`,
        modelDigest           : profile.lanes[laneName].modelDigest,
        observedOutputTokens  : 0,
        providerErrorCode     : 'CONTEXT_LIMIT_EXCEEDED',
        requestedContextTokens: observedContextTokens + 1,
        responseClass         : 'provider-error',
        serviceKey            : profile.lanes[laneName].serviceKey,
        startedAtMs           : startedAtMs + 4300,
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
              4: [300, 300, 300, 300]
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

    test('synthetic evidence computes the smallest provisional candidate but cannot mint deployment inputs', () => {
        const fixture                 = buildFixture(),
              firstCandidateOperation = fixture.trials.find(trial => trial.candidate === 1)
                  .lanes.embedding.operations[0];

        firstCandidateOperation.outcome = 'error';

        const result = evaluateProviderLaneElection(fixture);

        expect(result.status).toBe('NON_AUTHORITATIVE');
        expect(result.computedOutcome).toBe('ELECTED');
        expect(result.provisionalCandidate).toBe(2);
        expect(result.electedCandidate).toBeNull();
        expect(result.immutableInputs).toBeNull();
        expect(result.authority).toEqual({authoritative: false, evidenceClass: 'synthetic-control'});
        expect(result.planCoordinates.workloadOfferedOperations).toEqual(fixture.plan.workload.offeredOperations);
        expect(result.jointSlo.lanes.embedding.minContextTokensPerSlot).toBe(8192);
        expect(result.candidates[0].trials[0].lanes.embedding.resourceSamples).toEqual(
            fixture.trials[0].lanes.embedding.resourceSamples
        );
        expect(result.candidates.map(candidate => [candidate.candidate, candidate.status])).toEqual([
            [1, 'FAIL'],
            [2, 'PASS'],
            [4, 'PASS']
        ])
    });

    test('exact-head canonical evidence emits immutable inputs for the smallest passing candidate', () => {
        const fixture   = buildFixture({evidenceClass: 'exact-head-candidate'}),
              operation = fixture.trials.find(trial => trial.candidate === 1).lanes.embedding.operations[0];

        operation.outcome = 'error';

        const result = evaluateProviderLaneElection(fixture);

        expect(result.status).toBe('ELECTED');
        expect(result.electedCandidate).toBe(2);
        expect(result.immutableInputs).toEqual({
            chatParallelism: 1,
            embeddingSlots : 2,
            laneIdentities : {
                chat     : {imageDigest: CHAT_IMAGE_DIGEST, modelDigest: CHAT_MODEL_DIGEST, serviceKey: 'chat-model'},
                embedding: {
                    imageDigest: EMBEDDING_IMAGE_DIGEST,
                    modelDigest: EMBEDDING_MODEL_DIGEST,
                    serviceKey : 'embedding-model'
                }
            },
            laneResources: {
                chat     : {cpuCores: 2, memoryBytes: 3_000_000_000},
                embedding: {cpuCores: 2, memoryBytes: 5_000_000_000}
            },
            perSlotContextTarget: {chat: 131_072, embedding: 8192},
            totalResources      : {cpuCores: 4, memoryBytes: 8_000_000_000}
        });
        expect(result.authority).toMatchObject({
            authoritative : true,
            canonicalPlane: true,
            evidenceClass : 'exact-head-candidate',
            profileDigest : result.planCoordinates.planDigest,
            repositoryHead: '1'.repeat(40)
        })
    });

    test('returns exact-head NO_ELECTION without fallback or clamp when every candidate fails', () => {
        const fixture = buildFixture({evidenceClass: 'exact-head-candidate'});

        for (const candidate of [1, 2, 4]) {
            fixture.trials.find(trial => trial.candidate === candidate).lanes.chat.operations[0].outcome = 'error'
        }

        const result = evaluateProviderLaneElection(fixture);

        expect(result.status).toBe('NO_ELECTION');
        expect(result.electedCandidate).toBeNull();
        expect(result.immutableInputs).toBeNull()
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
        missingSource.trials[0].lanes.embedding.operations.pop();
        expect(() => evaluateProviderLaneElection(missingSource)).toThrow(/source orchestrator offered 1; fixed workload requires 2/);

        const sequential = buildFixture(),
              trial      = sequential.trials.find(item => item.candidate === 2),
              operations = trial.lanes.embedding.operations.filter(item => item.source === 'orchestrator');

        operations.forEach((operation, index) => {
            operation.enqueuedAtMs = trial.startedAtMs + 2600 + index * 900;
            operation.providerStartedAtMs = trial.startedAtMs + 2700 + index * 900;
            operation.completedAtMs = trial.startedAtMs + 3500 + index * 900
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

    test('fails a candidate whose declared embedding slots were never observed concurrently', () => {
        const fixture = buildFixture(),
              trial   = fixture.trials.find(item => item.candidate === 4);

        trial.lanes.embedding.operations.forEach((operation, index) => {
            operation.providerStartedAtMs = trial.startedAtMs + 300 + index * 1000;
            operation.completedAtMs = operation.providerStartedAtMs + 900
        });

        const result = evaluateProviderLaneElection(fixture),
              codes  = result.candidates.find(item => item.candidate === 4).failures.map(failure => failure.code);

        expect(codes).toContain('CANDIDATE_CONCURRENCY_NOT_OBSERVED');
        expect(result.candidates.find(item => item.candidate === 4).trials[0]
            .lanes.embedding.observedMaxProviderConcurrency).toBe(1)
    });

    test('fails context/refusal/progress from derived receipts rather than configured knobs', () => {
        const fixture = buildFixture(),
              trial   = fixture.trials.find(item => item.candidate === 2);

        trial.lanes.embedding.observedContextTokensPerSlot = 4096;
        Object.assign(trial.lanes.embedding.overLimitProbe, {
            observedOutputTokens: 32,
            providerErrorCode   : null,
            responseClass       : 'completed',
            transportStatus     : 200
        });
        trial.lanes.embedding.operations.forEach(operation => {
            operation.outcome = 'error'
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
        expect(() => evaluateProviderLaneElection(sameService)).toThrow(/distinct chat and embedding service identities/);

        const allocation = buildFixture();
        allocation.plan.candidateProfiles[0].lanes.embedding.memoryBytes--;
        expect(() => evaluateProviderLaneElection(allocation)).toThrow(/must exactly consume/)
    });

    test('requires complete exact-head provenance before any authoritative verdict', () => {
        const fixture = buildFixture({evidenceClass: 'exact-head-candidate'});
        delete fixture.plan.evidence.runnerDigest;

        expect(() => evaluateProviderLaneElection(fixture)).toThrow(/requires runnerDigest/)
    });

    test('binds exact-head provenance to the complete canonical plan coordinates', () => {
        const fixture = buildFixture({evidenceClass: 'exact-head-candidate'});

        fixture.plan.slo.lanes.embedding.maxProviderDurationMs++;

        expect(() => evaluateProviderLaneElection(fixture)).toThrow(/profileDigest does not match the canonical election plan digest/)
    });

    test('requires a raw identity-bound refusal receipt instead of an asserted refusal boolean', () => {
        const fixture = buildFixture(),
              probe   = fixture.trials[0].lanes.embedding.overLimitProbe;

        probe.serviceKey = 'wrong-provider';
        expect(() => evaluateProviderLaneElection(fixture)).toThrow(/truthful identity-bound over-limit probe/);

        const inconsistent = buildFixture();
        inconsistent.trials[0].lanes.embedding.overLimitProbe.transportStatus = 200;
        expect(() => evaluateProviderLaneElection(inconsistent)).toThrow(/inconsistent over-limit provider response/)
    });

    test('does not let a caller relabel rate limits or provider failures as context refusals', () => {
        const fixture = buildFixture(),
              probe   = fixture.trials.find(item => item.candidate === 2).lanes.embedding.overLimitProbe;

        Object.assign(probe, {
            providerErrorCode: 'RATE_LIMIT',
            transportStatus  : 429
        });

        const result = evaluateProviderLaneElection(fixture),
              lane   = result.candidates.find(item => item.candidate === 2).trials[0].lanes.embedding,
              codes  = result.candidates.find(item => item.candidate === 2).failures.map(failure => failure.code);

        expect(lane.overLimitProbe.responseClass).toBe('provider-error');
        expect(codes).toContain('OVER_LIMIT_NOT_REFUSED')
    });

    test('projects allowlisted fields and hashes caller-owned request identifiers', () => {
        const fixture = buildFixture(),
              trial   = fixture.trials[0];

        fixture.plan.slo.lanes.embedding.token = 'SLO_SECRET';
        fixture.plan.resourceSampling.token = 'SAMPLER_SECRET';
        trial.lanes.embedding.runtimeProfile.token = 'RUNTIME_SECRET';
        trial.lanes.embedding.operations[0].id = '/tenant/private/corpus/row';
        trial.lanes.embedding.overLimitProbe.id = 'sk-private-provider-token';

        const result     = evaluateProviderLaneElection(fixture),
              serialized = JSON.stringify(result),
              lane       = result.candidates[0].trials[0].lanes.embedding;

        expect(serialized).not.toContain('SECRET');
        expect(serialized).not.toContain('/tenant/private/corpus/row');
        expect(serialized).not.toContain('sk-private-provider-token');
        expect(result.jointSlo.lanes.embedding.token).toBeUndefined();
        expect(result.planCoordinates.resourceSampling.token).toBeUndefined();
        expect(lane.runtimeProfile.token).toBeUndefined();
        expect(lane.operations[0].id).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(lane.overLimitProbe.id).toMatch(/^sha256:[0-9a-f]{64}$/)
    });
});
