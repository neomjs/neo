/**
 * @module ai/scripts/benchmark/helpers/providerLaneElectionCore
 * @summary Pure evidence validation and election core for the fixed-envelope provider-lane benchmark.
 *
 * The live runner owns composition, workload dispatch, resource sampling, and artifact
 * authority. This module owns only a deterministic counterbalanced schedule plus pure
 * validation/aggregation over injected, already-normalized receipts. It selects the smallest
 * passing measured candidate, but never emits deployment inputs or an authoritative verdict.
 *
 * @see https://github.com/neomjs/neo/issues/17024
 * @see learn/agentos/decisions/0014-cloud-deployment-topology-and-scheduler-task-taxonomy.md
 */

import {createHash}         from 'node:crypto';

import {aggregateWindow}    from './servingCostCore.mjs';
import {median, percentile} from './stats.mjs';

const
    CANDIDATES             = Object.freeze([1, 2, 4]),
    COMPOSITION_SCHEMA     = 'provider-lane-composition.v1',
    DIGEST_PATTERN         = /^sha256:[0-9a-f]{64}$/,
    EMBED_SOURCES          = Object.freeze(['knowledge-base', 'memory-core', 'orchestrator']),
    LANE_NAMES             = Object.freeze(['chat', 'embedding']),
    OUTCOMES               = Object.freeze(['completed', 'error', 'unexpected-refusal']),
    PROVIDER_OUTCOMES      = Object.freeze(['completed', 'error']),
    PROBE_RESPONSE_CLASSES = Object.freeze(['completed', 'context-limit-refusal', 'provider-error']),
    QUEUE_DISPOSITIONS     = Object.freeze(['not-applicable', 'queued']),
    SAFE_PUBLIC_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/,
    SOURCE_NAMES           = Object.freeze(['chat', ...EMBED_SOURCES]),

    // Six permutations ordered as one continuous stream. Across all 17 real boundaries no
    // candidate follows itself and the six directed pair counts differ by at most one.
    COUNTERBALANCE_BLOCK = Object.freeze([
        1, 2, 4,
        1, 4, 2,
        4, 2, 1,
        2, 1, 4,
        2, 4, 1,
        4, 1, 2
    ]),

    SLO_FIELDS = Object.freeze([
        'maxCpuHighWaterPercent',
        'maxErrors',
        'maxNeoQueueWaitMs',
        'maxProgressGapMs',
        'maxProviderDurationMs',
        'maxResourceGapCount',
        'maxRssHighWaterBytes',
        'maxUnexpectedRefusals',
        'minCompletedOperations',
        'minContextTokensPerSlot',
        'minResourceCoverageRatio',
        'minThroughputPerSecond'
    ]),

    SUMMARY_FIELDS = Object.freeze([
        'cpuHighWaterPercent',
        'maxNeoQueueWaitMs',
        'maxProgressGapMs',
        'maxProviderDurationMs',
        'resourceCoverageRatio',
        'resourceGapCount',
        'resourceSampleCount',
        'rssHighWaterBytes',
        'throughputPerSecond'
    ]);

/**
 * @summary Builds complete counterbalance blocks for the candidate matrix.
 *
 * The output is the actual continuous execution order, not grouped candidate buckets. One
 * block runs every candidate six times, covers all six permutations, has no equal-candidate
 * transition, and balances directed adjacency across sequence boundaries.
 *
 * @param {Object} options
 * @param {Number} [options.blocks=1] Positive number of complete counterbalance blocks.
 * @returns {ReadonlyArray<{blockIndex: Number, candidate: Number, executionIndex: Number, id: String}>}
 */
export function buildProviderLaneCandidateSchedule({blocks = 1} = {}) {
    if (!Number.isInteger(blocks) || blocks <= 0) {
        throw new Error('provider-lane schedule requires a positive integer block count')
    }

    const schedule = [];

    for (let blockIndex = 0; blockIndex < blocks; blockIndex++) {
        COUNTERBALANCE_BLOCK.forEach(candidate => {
            const executionIndex = schedule.length;

            schedule.push(Object.freeze({
                blockIndex,
                candidate,
                executionIndex,
                id: `block-${blockIndex}:trial-${executionIndex % COUNTERBALANCE_BLOCK.length}`
            }))
        })
    }

    return Object.freeze(schedule)
}

/**
 * @summary Creates the canonical digest binding candidate profiles, workload, SLO, and
 * resource-sampling coordinates into one exact election plan identity.
 * @param {Object} plan Candidate election plan.
 * @returns {String} `sha256:`-prefixed canonical plan digest.
 */
export function createProviderLanePlanDigest(plan) {
    validatePlan(plan);

    return deriveProviderLanePlanDigest(plan)
}

/**
 * @summary Validates one complete fixed-envelope matrix and evaluates the smallest passing
 * candidate.
 *
 * Evidence-integrity failures throw because an incomplete or incomparable matrix cannot
 * support even a measured comparison. Measured SLO failures remain in candidate receipts. The
 * returned winner is deliberately non-authoritative: the live runner owns exact composition
 * validation, protocol adaptation, artifact provenance, and deployment-input publication.
 *
 * @param {Object} options
 * @param {Object} options.plan Immutable candidate profiles, workload, SLO, and sampling.
 * @param {Object[]} options.contextEvidence One runtime context/refusal receipt per candidate.
 * @param {Object[]} options.trials Chronological raw operation/resource receipts.
 * @returns {Object} Bounded election receipt.
 */
export function evaluateProviderLaneElection({contextEvidence, plan, trials} = {}) {
    const schedule   = validatePlan(plan),
          planDigest = deriveProviderLanePlanDigest(plan),
          ids        = new Set(),
          contexts   = validateContextEvidence({evidence: contextEvidence, ids, plan}),
          derived    = validateAndDeriveTrials({ids, plan, schedule, trials});

    const candidates = CANDIDATES.map(candidate => evaluateCandidate({
              candidate,
              contextEvidence: contexts.find(receipt => receipt.candidate === candidate),
              plan,
              trials         : derived.filter(trial => trial.candidate === candidate)
          })),
          winner = candidates.find(candidate => candidate.status === 'PASS') ?? null;

    return {
        candidates,
        jointSlo: {
            lanes: Object.fromEntries(LANE_NAMES.map(laneName => [laneName, projectLaneSlo(plan.slo.lanes[laneName])]))
        },
        planCoordinates: {
            blocks                   : plan.blocks,
            candidateRunCount        : COUNTERBALANCE_BLOCK.filter(candidate => candidate === 1).length * plan.blocks,
            planDigest,
            resourceSampling         : projectResourceSampling(plan.resourceSampling),
            totalRunCount            : schedule.length,
            uncertaintyMethod        : 'observed-range-and-nearest-rank-p95',
            workloadDigest           : plan.workload.digest,
            workloadOfferedOperations: {...plan.workload.offeredOperations}
        },
        winnerCandidate: winner?.candidate ?? null
    }
}

/**
 * @summary Projects the exact joint-SLO allowlist carried by the public receipt.
 * @param {Object} lane SLO lane.
 * @returns {Object}
 */
function projectLaneSlo(lane) {
    return Object.fromEntries([
        ...SLO_FIELDS.map(field => [field, lane[field]]),
        ['requiredQueueDisposition', lane.requiredQueueDisposition]
    ])
}

/**
 * @summary Projects the exact resource-sampling allowlist carried by the public receipt.
 * @param {Object} sampling Sampling plan.
 * @returns {Object}
 */
function projectResourceSampling(sampling) {
    return {
        activeCpuThreshold: sampling.activeCpuThreshold,
        expectedIntervalMs: sampling.expectedIntervalMs,
        gapFactor         : sampling.gapFactor
    }
}

/**
 * @summary Hashes only semantic plan coordinates in a stable candidate/key order.
 * @param {Object} plan Validated candidate election plan.
 * @returns {String}
 */
function deriveProviderLanePlanDigest(plan) {
    const coordinates = {
        blocks           : plan.blocks,
        candidateProfiles: [...plan.candidateProfiles]
            .sort((a, b) => a.embeddingSlots - b.embeddingSlots)
            .map(projectCandidateProfile),
        resourceSampling: projectResourceSampling(plan.resourceSampling),
        slo             : {lanes: Object.fromEntries(LANE_NAMES.map(laneName => [
            laneName,
            projectLaneSlo(plan.slo.lanes[laneName])
        ]))},
        workload: {
            digest           : plan.workload.digest,
            offeredOperations: Object.fromEntries(SOURCE_NAMES.map(source => [
                source,
                plan.workload.offeredOperations[source]
            ]))
        }
    };

    return `sha256:${createHash('sha256').update(stableSerialize(coordinates)).digest('hex')}`
}

/**
 * @summary Projects the exact candidate-profile fields which define one election plan.
 * @param {Object} profile Candidate profile.
 * @returns {Object}
 */
function projectCandidateProfile(profile) {
    return {
        compositionReceiptDigest: profile.compositionReceiptDigest,
        compositionSchemaVersion: profile.compositionSchemaVersion,
        embeddingSlots          : profile.embeddingSlots,
        lanes                   : Object.fromEntries(LANE_NAMES.map(laneName => [laneName, {
            baseUrl                     : profile.lanes[laneName].baseUrl,
            contextTokensPerSlotRequired: profile.lanes[laneName].contextTokensPerSlotRequired,
            cpuCores                    : profile.lanes[laneName].cpuCores,
            endpointDigest              : profile.lanes[laneName].endpointDigest,
            imageDigest                 : profile.lanes[laneName].imageDigest,
            imageReference              : profile.lanes[laneName].imageReference,
            memoryBytes                 : profile.lanes[laneName].memoryBytes,
            modelCoordinate             : profile.lanes[laneName].modelCoordinate,
            modelDigest                 : profile.lanes[laneName].modelDigest,
            modelDigestKind             : profile.lanes[laneName].modelDigestKind,
            modelId                     : profile.lanes[laneName].modelId,
            parallelism                 : profile.lanes[laneName].parallelism,
            protocolAdapter             : profile.lanes[laneName].protocolAdapter,
            provider                    : profile.lanes[laneName].provider,
            serviceKey                  : profile.lanes[laneName].serviceKey,
            totalContextTokens          : profile.lanes[laneName].totalContextTokens
        }])),
        roleMapDigest : profile.roleMapDigest,
        totalResources: {
            cpuCores   : profile.totalResources.cpuCores,
            memoryBytes: profile.totalResources.memoryBytes
        }
    }
}

/**
 * @summary Serializes JSON-compatible evidence with recursively sorted object keys.
 * @param {*} value JSON-compatible value.
 * @returns {String}
 */
function stableSerialize(value) {
    const normalize = item => {
        if (Array.isArray(item)) {
            return item.map(normalize)
        }

        if (item && typeof item === 'object') {
            return Object.fromEntries(Object.keys(item).sort().map(key => [key, normalize(item[key])]))
        }

        return item
    };

    return JSON.stringify(normalize(value))
}

/**
 * @summary Validates immutable plan coordinates and returns the matching schedule.
 * @param {Object} plan Candidate plan.
 * @returns {ReadonlyArray<Object>}
 */
function validatePlan(plan) {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
        throw new Error('provider-lane election requires an explicit plan')
    }

    const schedule = buildProviderLaneCandidateSchedule({blocks: plan.blocks});

    validateCandidateProfiles(plan.candidateProfiles);
    validateSlo(plan.slo);
    validateContextContract(plan);
    validateWorkload(plan.workload);
    validateResourceSampling(plan.resourceSampling);

    return schedule
}

/**
 * @summary Binds the joint-SLO context floor to the canonical composition requirement.
 * @param {Object} plan Validated election plan.
 */
function validateContextContract(plan) {
    const baseline = getProfile(plan, CANDIDATES[0]);

    for (const laneName of LANE_NAMES) {
        if (plan.slo.lanes[laneName].minContextTokensPerSlot !==
            baseline.lanes[laneName].contextTokensPerSlotRequired) {
            throw new Error(`provider-lane SLO ${laneName} context floor must equal the composition-required per-slot context`)
        }
    }
}

/**
 * @summary Validates exact `{1,2,4}` profiles under one fixed total envelope and identity set.
 * @param {Object[]} profiles Candidate profiles.
 */
function validateCandidateProfiles(profiles) {
    if (!Array.isArray(profiles) || profiles.length !== CANDIDATES.length) {
        throw new Error('provider-lane plan requires exactly three candidate profiles: 1, 2, and 4')
    }

    const sorted = [...profiles].sort((a, b) => a?.embeddingSlots - b?.embeddingSlots);

    if (sorted.some((profile, index) => profile?.embeddingSlots !== CANDIDATES[index])) {
        throw new Error('provider-lane plan requires each candidate 1, 2, and 4 exactly once')
    }

    for (const profile of sorted) {
        validateCandidateProfile(profile)
    }

    const baseline = sorted[0];

    for (const profile of sorted.slice(1)) {
        if (profile.totalResources.cpuCores !== baseline.totalResources.cpuCores ||
            profile.totalResources.memoryBytes !== baseline.totalResources.memoryBytes) {
            throw new Error(`candidate ${profile.embeddingSlots} changed the fixed total CPU/memory envelope`)
        }

        if (profile.compositionSchemaVersion !== baseline.compositionSchemaVersion ||
            profile.roleMapDigest !== baseline.roleMapDigest) {
            throw new Error(`candidate ${profile.embeddingSlots} changed the composition schema or role map`)
        }

        for (const laneName of LANE_NAMES) {
            for (const field of [
                'baseUrl',
                'endpointDigest',
                'imageDigest',
                'imageReference',
                'modelCoordinate',
                'modelDigest',
                'modelDigestKind',
                'modelId',
                'protocolAdapter',
                'provider',
                'serviceKey'
            ]) {
                if (profile.lanes[laneName][field] !== baseline.lanes[laneName][field]) {
                    throw new Error(`candidate ${profile.embeddingSlots} changed ${laneName}.${field}; profile mismatch aborts the election`)
                }
            }

            if (profile.lanes[laneName].contextTokensPerSlotRequired !==
                baseline.lanes[laneName].contextTokensPerSlotRequired) {
                throw new Error(`candidate ${profile.embeddingSlots} changed ${laneName}.contextTokensPerSlotRequired`)
            }
        }

        if (profile.lanes.chat.totalContextTokens !== baseline.lanes.chat.totalContextTokens) {
            throw new Error(`candidate ${profile.embeddingSlots} changed chat.totalContextTokens`)
        }
    }
}

/**
 * @summary Validates one candidate profile and its per-lane allocation.
 * @param {Object} profile Candidate profile.
 */
function validateCandidateProfile(profile) {
    if (profile?.compositionSchemaVersion !== COMPOSITION_SCHEMA ||
        !DIGEST_PATTERN.test(profile?.compositionReceiptDigest ?? '') ||
        !DIGEST_PATTERN.test(profile?.roleMapDigest ?? '')) {
        throw new Error(`candidate ${profile?.embeddingSlots} requires immutable validated composition provenance`)
    }

    assertPositiveFinite(profile?.totalResources?.cpuCores, `candidate ${profile?.embeddingSlots} totalResources.cpuCores`);
    assertPositiveInteger(profile?.totalResources?.memoryBytes, `candidate ${profile?.embeddingSlots} totalResources.memoryBytes`);

    let allocatedCpu    = 0,
        allocatedMemory = 0;

    for (const laneName of LANE_NAMES) {
        const lane = profile?.lanes?.[laneName];

        if (!lane || !SAFE_PUBLIC_ID_PATTERN.test(lane.serviceKey ?? '') ||
            !SAFE_PUBLIC_ID_PATTERN.test(lane.provider ?? '') ||
            !SAFE_PUBLIC_ID_PATTERN.test(lane.modelId ?? '') ||
            !SAFE_PUBLIC_ID_PATTERN.test(lane.modelDigestKind ?? '')) {
            throw new Error(`candidate ${profile?.embeddingSlots} lanes.${laneName}.serviceKey is required`)
        }
        if (!DIGEST_PATTERN.test(lane.imageDigest ?? '') || !DIGEST_PATTERN.test(lane.modelDigest ?? '') ||
            !DIGEST_PATTERN.test(lane.endpointDigest ?? '') || typeof lane.imageReference !== 'string' ||
            lane.imageReference.length === 0 || lane.imageReference.length > 512 ||
            typeof lane.modelCoordinate !== 'string' || lane.modelCoordinate.length === 0 ||
            lane.modelCoordinate.length > 512) {
            throw new Error(`candidate ${profile?.embeddingSlots} lanes.${laneName} requires immutable image and model digests`)
        }
        try {
            const url = new URL(lane.baseUrl);

            if (url.protocol !== 'http:' || url.hostname !== lane.serviceKey || url.pathname !== '/' || url.search || url.hash) {
                throw new Error()
            }
        } catch {
            throw new Error(`candidate ${profile?.embeddingSlots} lanes.${laneName} requires an internal receipt-bound base URL`)
        }
        if (!SAFE_PUBLIC_ID_PATTERN.test(lane.protocolAdapter ?? '')) {
            throw new Error(`candidate ${profile?.embeddingSlots} lanes.${laneName} requires a bounded provider protocol adapter identity`)
        }

        assertPositiveFinite(lane.cpuCores, `candidate ${profile.embeddingSlots} lanes.${laneName}.cpuCores`);
        assertPositiveInteger(lane.memoryBytes, `candidate ${profile.embeddingSlots} lanes.${laneName}.memoryBytes`);
        assertPositiveInteger(lane.totalContextTokens, `candidate ${profile.embeddingSlots} lanes.${laneName}.totalContextTokens`);
        assertPositiveInteger(lane.contextTokensPerSlotRequired, `candidate ${profile.embeddingSlots} lanes.${laneName}.contextTokensPerSlotRequired`);

        allocatedCpu    += lane.cpuCores;
        allocatedMemory += lane.memoryBytes
    }

    if (profile.lanes.chat.serviceKey === profile.lanes.embedding.serviceKey) {
        throw new Error(`candidate ${profile.embeddingSlots} must name distinct chat and embedding service identities`)
    }
    if (Math.abs(allocatedCpu - profile.totalResources.cpuCores) > Number.EPSILON * 16 ||
        allocatedMemory !== profile.totalResources.memoryBytes) {
        throw new Error(`candidate ${profile.embeddingSlots} lane allocations must exactly consume the declared total envelope`)
    }
    if (profile.lanes.chat.parallelism !== 1 || profile.lanes.embedding.parallelism !== profile.embeddingSlots) {
        throw new Error(`candidate ${profile.embeddingSlots} must keep chat parallelism 1 and embedding parallelism equal to the candidate`)
    }
    if (profile.lanes.chat.totalContextTokens !== profile.lanes.chat.contextTokensPerSlotRequired ||
        profile.lanes.embedding.totalContextTokens <
            profile.lanes.embedding.parallelism * profile.lanes.embedding.contextTokensPerSlotRequired) {
        throw new Error(`candidate ${profile.embeddingSlots} has incoherent total and per-slot context coordinates`)
    }
}

/**
 * @summary Validates the explicit joint SLO without inventing defaults.
 * @param {Object} slo Joint SLO.
 */
function validateSlo(slo) {
    for (const laneName of LANE_NAMES) {
        const lane = slo?.lanes?.[laneName];

        if (!lane || !QUEUE_DISPOSITIONS.includes(lane.requiredQueueDisposition)) {
            throw new Error(`provider-lane SLO requires lanes.${laneName} with an explicit queue disposition`)
        }

        for (const field of SLO_FIELDS) {
            if (!Number.isFinite(lane[field]) || lane[field] < 0) {
                throw new Error(`provider-lane SLO lanes.${laneName}.${field} must be finite and non-negative`)
            }
        }

        for (const field of [
            'maxErrors',
            'maxResourceGapCount',
            'maxUnexpectedRefusals',
            'minCompletedOperations',
            'minContextTokensPerSlot'
        ]) {
            if (!Number.isInteger(lane[field])) {
                throw new Error(`provider-lane SLO lanes.${laneName}.${field} must be an integer`)
            }
        }

        if (lane.minCompletedOperations <= 0 || lane.minContextTokensPerSlot <= 0 || lane.minThroughputPerSecond <= 0 ||
            lane.minResourceCoverageRatio <= 0 || lane.minResourceCoverageRatio > 1) {
            throw new Error(`provider-lane SLO lanes.${laneName} requires positive progress, context, throughput, and coverage targets`)
        }
    }
}

/**
 * @summary Validates one immutable workload identity and exact offered-operation counts.
 * @param {Object} workload Workload coordinate.
 */
function validateWorkload(workload) {
    if (!DIGEST_PATTERN.test(workload?.digest ?? '')) {
        throw new Error('provider-lane workload requires an immutable digest')
    }

    for (const source of SOURCE_NAMES) {
        assertPositiveInteger(workload?.offeredOperations?.[source], `workload.offeredOperations.${source}`)
    }

    const embeddingOffers = EMBED_SOURCES.reduce((sum, source) => sum + workload.offeredOperations[source], 0);

    if (embeddingOffers < Math.max(...CANDIDATES)) {
        throw new Error('provider-lane workload must offer enough embedding operations to exercise candidate 4')
    }

    if (Object.keys(workload.offeredOperations).some(source => !SOURCE_NAMES.includes(source))) {
        throw new Error('provider-lane workload contains an unknown demand source')
    }
}

/**
 * @summary Validates the raw resource sampler contract used by `aggregateWindow`.
 * @param {Object} sampling Sampling coordinate.
 */
function validateResourceSampling(sampling) {
    assertPositiveFinite(sampling?.activeCpuThreshold, 'resourceSampling.activeCpuThreshold');
    assertPositiveFinite(sampling?.expectedIntervalMs, 'resourceSampling.expectedIntervalMs');
    assertPositiveFinite(sampling?.gapFactor, 'resourceSampling.gapFactor')
}

/**
 * @summary Validates chronological trial receipts and derives all election metrics.
 * @param {Object} options
 * @returns {Object[]}
 */
function validateAndDeriveTrials({ids, plan, schedule, trials}) {
    if (!Array.isArray(trials) || trials.length !== schedule.length) {
        throw new Error(`provider-lane matrix requires ${schedule.length} chronological trials`)
    }

    const derived = [];

    trials.forEach((trial, index) => {
        const slot    = schedule[index],
              profile = getProfile(plan, slot.candidate);

        if (trial?.scheduleId !== slot.id || trial?.candidate !== slot.candidate || trial?.executionIndex !== index) {
            throw new Error(`trial ${index} does not match counterbalanced slot ${slot.id} candidate ${slot.candidate}`)
        }
        if (!Number.isFinite(trial.startedAtMs) || !Number.isFinite(trial.completedAtMs) || trial.completedAtMs <= trial.startedAtMs) {
            throw new Error(`trial ${index} requires finite startedAtMs < completedAtMs`)
        }
        if (index > 0 && trial.startedAtMs < trials[index - 1].completedAtMs) {
            throw new Error(`trial ${index} overlaps the previous candidate trial`)
        }
        if (trial.workloadDigest !== plan.workload.digest) {
            throw new Error(`trial ${index} changed the immutable workload digest`)
        }
        if (trial.compositionReceiptDigest !== profile.compositionReceiptDigest) {
            throw new Error(`trial ${index} does not match candidate ${slot.candidate}'s composition receipt`)
        }

        const lanes = Object.fromEntries(LANE_NAMES.map(laneName => [
            laneName,
            deriveLaneReceipt({ids, lane: trial.lanes?.[laneName], laneName, plan, profile, trial})
        ]));

        validateSourceCardinality(lanes, plan.workload.offeredOperations, index);

        derived.push({
            candidate               : trial.candidate,
            completedAtMs           : trial.completedAtMs,
            compositionReceiptDigest: trial.compositionReceiptDigest,
            executionIndex          : index,
            lanes,
            residencyBefore         : validateResidencyReceipt(
                trial.residencyBefore,
                trial,
                index,
                index > 0 ? trials[index - 1].completedAtMs : Number.NEGATIVE_INFINITY
            ),
            scheduleId : trial.scheduleId,
            startedAtMs: trial.startedAtMs,
            workload   : {
                concurrent       : hasCommonDemandOverlap(lanes),
                digest           : trial.workloadDigest,
                offeredOperations: {...plan.workload.offeredOperations}
            }
        })
    });

    return derived
}

/**
 * @summary Derives one lane's queue/provider/progress/resource metrics from raw receipts.
 * @param {Object} options
 * @returns {Object}
 */
function deriveLaneReceipt({ids, lane, laneName, plan, profile, trial}) {
    if (!lane || !Array.isArray(lane.operations) || !Array.isArray(lane.sourceCalls) ||
        !Array.isArray(lane.resourceSamples) || lane.resourceSamples.length < 2) {
        throw new Error(`trial ${trial.executionIndex} lane ${laneName} requires provider operations, source calls, and resource samples`)
    }

    validateRuntimeProfile(lane.runtimeProfile, profile.lanes[laneName], laneName, trial.executionIndex);

    const sourceCalls = lane.sourceCalls.map(call => validateSourceCall({
              call,
              ids,
              laneName,
              trial
          })),
          sourceCallById = new Map(sourceCalls.map(call => [call.id, call])),
          operations = lane.operations.map(operation => validateOperation({
              ids,
              laneName,
              operation,
              trial
          })),
          resource = aggregateWindow(lane.resourceSamples, {
              activeCpuThreshold: plan.resourceSampling.activeCpuThreshold,
              expectedIntervalMs: plan.resourceSampling.expectedIntervalMs,
              gapFactor         : plan.resourceSampling.gapFactor,
              windowBounds      : {startMs: trial.startedAtMs, endMs: trial.completedAtMs}
          }),
          queueWaits = operations.filter(operation => operation.queueWaitMs !== null).map(operation => operation.queueWaitMs),
          providerDurations = operations.map(operation => operation.providerDurationMs),
          completions = sourceCalls.filter(call => call.outcome === 'completed').map(call => call.completedAtMs),
          windowMs = trial.completedAtMs - trial.startedAtMs,
          maxResourceSamples = Math.ceil(windowMs / plan.resourceSampling.expectedIntervalMs) + 2;

    for (const call of sourceCalls) {
        const linked = operations.filter(operation => operation.callId === call.id);

        if (linked.length === 0 || linked.some(operation => operation.completedAtMs > call.completedAtMs ||
            operation.demandAtMs < call.demandAtMs) ||
            (call.outcome === 'completed' && linked.some(operation => operation.outcome !== 'completed')) ||
            (call.outcome === 'unexpected-refusal' && linked.every(operation => operation.outcome !== 'error'))) {
            throw new Error(`trial ${trial.executionIndex} lane ${laneName} has an incoherent source-call lifecycle`)
        }
    }
    if (operations.some(operation => !sourceCallById.has(operation.callId))) {
        throw new Error(`trial ${trial.executionIndex} lane ${laneName} has an unbound provider operation`)
    }

    if (lane.resourceSamples.length > maxResourceSamples) {
        throw new Error(`trial ${trial.executionIndex} lane ${laneName} exceeds the bounded raw resource sample count`)
    }

    for (const [index, sample] of lane.resourceSamples.entries()) {
        if (!Number.isFinite(sample?.atMs) || !Number.isFinite(sample.cpuPercent) || sample.cpuPercent < 0 ||
            !Number.isFinite(sample.rssBytes) || sample.rssBytes < 0) {
            throw new Error(`trial ${trial.executionIndex} lane ${laneName} has an invalid raw resource sample`)
        }
        if (index > 0 && sample.atMs <= lane.resourceSamples[index - 1].atMs) {
            throw new Error(`trial ${trial.executionIndex} lane ${laneName} resource samples must be chronological`)
        }
    }

    const observedMaxProviderConcurrency = deriveMaxProviderConcurrency(operations);

    if (observedMaxProviderConcurrency > profile.lanes[laneName].parallelism) {
        throw new Error(`trial ${trial.executionIndex} lane ${laneName} exceeds its runtime parallelism`)
    }

    if (lane.resourceSamples.some(sample => sample.atMs < trial.startedAtMs || sample.atMs > trial.completedAtMs)) {
        throw new Error(`trial ${trial.executionIndex} lane ${laneName} has a resource sample outside the measurement window`)
    }

    return {
        completedOperations  : completions.length,
        cpuHighWaterPercent  : Math.max(...lane.resourceSamples.map(sample => sample.cpuPercent)),
        errorCount           : sourceCalls.filter(call => call.outcome === 'error').length,
        maxNeoQueueWaitMs    : queueWaits.length > 0 ? Math.max(...queueWaits) : null,
        maxProgressGapMs     : deriveMaxProgressGap(trial.startedAtMs, trial.completedAtMs, completions),
        maxProviderDurationMs: Math.max(...providerDurations),
        observedMaxProviderConcurrency,
        offeredOperations    : sourceCalls.length,
        operations           : operations.map(operation => ({
            ...operation,
            callId: projectOpaqueId(operation.callId)
        })),
        providerOperationCount: operations.length,
        queueDispositionCounts: {
            'not-applicable': operations.filter(operation => operation.queueDisposition === 'not-applicable').length,
            queued          : operations.filter(operation => operation.queueDisposition === 'queued').length
        },
        resourceCoverageRatio: resource.coverageRatio,
        resourceGapCount     : resource.gapCount,
        resourceSampleCount  : resource.sampleCount,
        resourceSamples      : lane.resourceSamples.map(({atMs, cpuPercent, rssBytes}) => ({atMs, cpuPercent, rssBytes})),
        rssHighWaterBytes    : resource.rssHighWaterBytes,
        runtimeProfile       : projectRuntimeProfile(lane.runtimeProfile),
        sourceCalls          : sourceCalls.map(call => ({
            completedAtMs: call.completedAtMs,
            demandAtMs   : call.demandAtMs,
            id           : projectOpaqueId(call.id),
            outcome      : call.outcome,
            source       : call.source
        })),
        throughputPerSecond   : completions.length / (windowMs / 1000),
        unexpectedRefusalCount: sourceCalls.filter(call => call.outcome === 'unexpected-refusal').length
    }
}

/**
 * @summary Projects only the six validated runtime-profile coordinates.
 * @param {Object} runtime Runtime profile receipt.
 * @returns {Object}
 */
function projectRuntimeProfile(runtime) {
    return {
        cpuCores   : runtime.cpuCores,
        imageDigest: runtime.imageDigest,
        memoryBytes: runtime.memoryBytes,
        modelDigest: runtime.modelDigest,
        parallelism: runtime.parallelism,
        serviceKey : runtime.serviceKey
    }
}

/**
 * @summary Validates exactly one runtime context/refusal receipt per candidate and lane.
 * @param {Object} options Validation inputs.
 * @returns {Object[]} Bounded candidate receipts.
 */
function validateContextEvidence({evidence, ids, plan}) {
    if (!Array.isArray(evidence) || evidence.length !== CANDIDATES.length) {
        throw new Error('provider-lane election requires one context receipt for each candidate 1, 2, and 4')
    }

    const sorted = [...evidence].sort((left, right) => left?.candidate - right?.candidate);

    if (sorted.some((receipt, index) => receipt?.candidate !== CANDIDATES[index])) {
        throw new Error('provider-lane context receipts require each candidate 1, 2, and 4 exactly once')
    }

    return sorted.map(receipt => {
        const profile = getProfile(plan, receipt.candidate);

        if (!Number.isFinite(receipt.startedAtMs) || !Number.isFinite(receipt.completedAtMs) ||
            receipt.completedAtMs <= receipt.startedAtMs ||
            receipt.compositionReceiptDigest !== profile.compositionReceiptDigest) {
            throw new Error(`candidate ${receipt.candidate} requires a receipt-bound context evidence window`)
        }

        return {
            candidate               : receipt.candidate,
            completedAtMs           : receipt.completedAtMs,
            compositionReceiptDigest: receipt.compositionReceiptDigest,
            lanes                   : Object.fromEntries(LANE_NAMES.map(laneName => [laneName, validateContextLane({
                ids,
                lane    : receipt.lanes?.[laneName],
                laneName,
                profile,
                receipt
            })])),
            startedAtMs: receipt.startedAtMs
        }
    })
}

/**
 * @summary Validates one runtime-observed context value and its independent over-limit probe.
 * @param {Object} options Validation inputs.
 * @returns {Object} Bounded, identity-bound lane evidence.
 */
function validateContextLane({ids, lane, laneName, profile, receipt}) {
    const label = `candidate ${receipt.candidate} ${laneName}`,
          probe = lane?.overLimitProbe;

    assertPositiveInteger(lane?.observedContextTokensPerSlot, `${label}.observedContextTokensPerSlot`);
    assertPositiveInteger(probe?.requestedContextTokens, `${label}.overLimitProbe.requestedContextTokens`);

    if (!probe || typeof probe.id !== 'string' || probe.id.length === 0 || probe.id.length > 1024 || ids.has(probe.id)) {
        throw new Error(`${label}.overLimitProbe requires a unique request id`)
    }
    ids.add(probe.id);

    if (!Number.isFinite(probe.startedAtMs) || !Number.isFinite(probe.completedAtMs) ||
        probe.startedAtMs < receipt.startedAtMs || probe.completedAtMs > receipt.completedAtMs ||
        probe.completedAtMs <= probe.startedAtMs ||
        probe.requestedContextTokens <= lane.observedContextTokensPerSlot ||
        probe.serviceKey !== profile.lanes[laneName].serviceKey ||
        probe.modelDigest !== profile.lanes[laneName].modelDigest ||
        probe.protocolAdapter !== profile.lanes[laneName].protocolAdapter ||
        !PROBE_RESPONSE_CLASSES.includes(probe.responseClass) ||
        !DIGEST_PATTERN.test(probe.responseBodyDigest ?? '') ||
        !Number.isInteger(probe.observedOutputTokens) || probe.observedOutputTokens < 0 ||
        !Number.isInteger(probe.transportStatus) || probe.transportStatus < 100 || probe.transportStatus > 599) {
        throw new Error(`candidate ${receipt.candidate} lane ${laneName} requires truthful identity-bound context evidence`)
    }

    if (probe.responseClass === 'completed' && probe.transportStatus >= 400 ||
        probe.responseClass !== 'completed' && probe.transportStatus < 400 ||
        probe.responseClass === 'context-limit-refusal' && probe.observedOutputTokens !== 0) {
        throw new Error(`candidate ${receipt.candidate} lane ${laneName} has an inconsistent over-limit provider response`)
    }

    return {
        observedContextTokensPerSlot: lane.observedContextTokensPerSlot,
        overLimitProbe              : {
            completedAtMs         : probe.completedAtMs,
            id                    : projectOpaqueId(probe.id),
            modelDigest           : probe.modelDigest,
            observedOutputTokens  : probe.observedOutputTokens,
            protocolAdapter       : probe.protocolAdapter,
            requestedContextTokens: probe.requestedContextTokens,
            responseBodyDigest    : probe.responseBodyDigest,
            responseClass         : probe.responseClass,
            serviceKey            : probe.serviceKey,
            startedAtMs           : probe.startedAtMs,
            transportStatus       : probe.transportStatus
        }
    }
}

/**
 * @summary Replaces caller-owned request identifiers with bounded opaque digests.
 * @param {String} id Raw request identifier used only for matrix-local uniqueness.
 * @returns {String}
 */
function projectOpaqueId(id) {
    return `sha256:${createHash('sha256').update(id).digest('hex')}`
}

/**
 * @summary Validates runtime containment against the declared lane allocation.
 * @param {Object} limits Runtime limits.
 * @param {Object} allocation Declared allocation.
 * @param {String} laneName Lane name.
 * @param {Number} trialIndex Trial index.
 */
function validateRuntimeProfile(runtime, allocation, laneName, trialIndex) {
    for (const field of [
        'cpuCores',
        'imageDigest',
        'memoryBytes',
        'modelDigest',
        'parallelism',
        'serviceKey'
    ]) {
        if (runtime?.[field] !== allocation[field]) {
            throw new Error(`trial ${trialIndex} lane ${laneName} runtime profile does not match declared ${field}`)
        }
    }
}

/**
 * @summary Validates one caller-visible source-call timeline used for durable progress.
 * @param {Object} options
 * @returns {Object}
 */
function validateSourceCall({call, ids, laneName, trial}) {
    const allowedSources = laneName === 'chat' ? ['chat'] : EMBED_SOURCES;

    if (typeof call?.id !== 'string' || call.id.length === 0 || call.id.length > 1024 || ids.has(call.id)) {
        throw new Error(`trial ${trial.executionIndex} contains a missing or duplicate source-call id`)
    }
    ids.add(call.id);

    if (!allowedSources.includes(call.source) || !OUTCOMES.includes(call.outcome) ||
        !Number.isFinite(call.demandAtMs) || !Number.isFinite(call.completedAtMs) ||
        call.demandAtMs < trial.startedAtMs || call.completedAtMs <= call.demandAtMs ||
        call.completedAtMs > trial.completedAtMs) {
        throw new Error(`trial ${trial.executionIndex} lane ${laneName} contains an invalid source-call contract`)
    }

    return {
        completedAtMs: call.completedAtMs,
        demandAtMs   : call.demandAtMs,
        id           : call.id,
        outcome      : call.outcome,
        source       : call.source
    }
}

/**
 * @summary Validates one provider-operation timeline and derives queue/provider durations.
 * @param {Object} options
 * @returns {Object}
 */
function validateOperation({ids, laneName, operation, trial}) {
    const allowedSources = laneName === 'chat' ? ['chat'] : EMBED_SOURCES;

    if (typeof operation?.id !== 'string' || operation.id.length === 0 || operation.id.length > 1024 || ids.has(operation.id)) {
        throw new Error(`trial ${trial.executionIndex} contains a missing or duplicate operation id`)
    }
    ids.add(operation.id);

    if (typeof operation.callId !== 'string' || operation.callId.length === 0 || operation.callId.length > 1024 ||
        !allowedSources.includes(operation.source) || !QUEUE_DISPOSITIONS.includes(operation.queueDisposition) ||
        !PROVIDER_OUTCOMES.includes(operation.outcome)) {
        throw new Error(`trial ${trial.executionIndex} lane ${laneName} contains an invalid operation contract`)
    }
    if (!Number.isFinite(operation.providerStartedAtMs) || !Number.isFinite(operation.completedAtMs) ||
        operation.providerStartedAtMs < trial.startedAtMs || operation.completedAtMs <= operation.providerStartedAtMs ||
        operation.completedAtMs > trial.completedAtMs) {
        throw new Error(`trial ${trial.executionIndex} operation ${projectOpaqueId(operation.id)} has an invalid provider timeline`)
    }

    let demandAtMs,
        queueWaitMs;

    if (operation.queueDisposition === 'queued') {
        if (!Number.isFinite(operation.enqueuedAtMs) || operation.enqueuedAtMs < trial.startedAtMs ||
            operation.enqueuedAtMs > operation.providerStartedAtMs) {
            throw new Error(`trial ${trial.executionIndex} queued operation ${projectOpaqueId(operation.id)} requires a valid enqueue timestamp`)
        }
        demandAtMs  = operation.enqueuedAtMs;
        queueWaitMs = operation.providerStartedAtMs - operation.enqueuedAtMs
    } else {
        if (operation.enqueuedAtMs !== null) {
            throw new Error(`trial ${trial.executionIndex} not-applicable operation ${projectOpaqueId(operation.id)} requires enqueuedAtMs=null`)
        }
        demandAtMs  = operation.providerStartedAtMs;
        queueWaitMs = null
    }

    return {
        callId             : operation.callId,
        completedAtMs      : operation.completedAtMs,
        demandAtMs,
        id                 : projectOpaqueId(operation.id),
        outcome            : operation.outcome,
        providerDurationMs : operation.completedAtMs - operation.providerStartedAtMs,
        providerStartedAtMs: operation.providerStartedAtMs,
        queueDisposition   : operation.queueDisposition,
        queueWaitMs,
        source             : operation.source
    }
}

/**
 * @summary Requires the exact fixed workload cardinality in every trial.
 * @param {Object} lanes Derived lane receipts.
 * @param {Object} expected Expected source counts.
 * @param {Number} trialIndex Trial index.
 */
function validateSourceCardinality(lanes, expected, trialIndex) {
    const sourceCalls = [...lanes.chat.sourceCalls, ...lanes.embedding.sourceCalls];

    for (const source of SOURCE_NAMES) {
        const count = sourceCalls.filter(call => call.source === source).length;

        if (count !== expected[source]) {
            throw new Error(`trial ${trialIndex} source ${source} offered ${count}; fixed workload requires ${expected[source]}`)
        }
    }
}

/**
 * @summary Verifies that all four demand sources had an overlapping outstanding interval.
 * @param {Object} lanes Derived lane receipts.
 * @returns {Boolean}
 */
function hasCommonDemandOverlap(lanes) {
    const sourceCalls = [...lanes.chat.sourceCalls, ...lanes.embedding.sourceCalls],
          boundaries  = [...new Set(sourceCalls.flatMap(call => [call.demandAtMs, call.completedAtMs]))]
              .sort((a, b) => a - b);

    return boundaries.slice(0, -1).some((startMs, index) => {
        const probeAtMs = (startMs + boundaries[index + 1]) / 2;

        return SOURCE_NAMES.every(source => sourceCalls.some(call =>
            call.source === source && call.demandAtMs <= probeAtMs && call.completedAtMs > probeAtMs
        ))
    })
}

/**
 * @summary Validates and bounds the pre-trial residency observation.
 * @param {Object} receipt Residency observation.
 * @param {Object} trial Trial receipt.
 * @param {Number} trialIndex Trial index.
 * @returns {Object}
 */
function validateResidencyReceipt(receipt, trial, trialIndex, priorCompletedAtMs) {
    if (!Number.isFinite(receipt?.observedAtMs) || receipt.observedAtMs > trial.startedAtMs ||
        receipt.observedAtMs < priorCompletedAtMs) {
        throw new Error(`trial ${trialIndex} requires a pre-trial residency observation`)
    }

    const lanes = {};

    for (const laneName of LANE_NAMES) {
        const lane = receipt.lanes?.[laneName];

        if (typeof lane?.resident !== 'boolean' ||
            (lane.resident ? !DIGEST_PATTERN.test(lane.modelDigest ?? '') : lane.modelDigest !== null)) {
            throw new Error(`trial ${trialIndex} residency.${laneName} requires resident boolean and bounded model digest`)
        }

        lanes[laneName] = {modelDigest: lane.modelDigest, resident: lane.resident}
    }

    return {lanes, observedAtMs: receipt.observedAtMs}
}

/**
 * @summary Evaluates all trial receipts for one candidate against the joint SLO.
 * @param {Object} options
 * @returns {Object}
 */
function evaluateCandidate({candidate, contextEvidence, plan, trials}) {
    const failures = [],
          profile  = getProfile(plan, candidate);

    for (const laneName of LANE_NAMES) {
        const evidence = contextEvidence.lanes[laneName],
              fail     = code => failures.push({code, lane: laneName, runId: 'context-evidence'});

        evidence.observedContextTokensPerSlot < plan.slo.lanes[laneName].minContextTokensPerSlot &&
            fail('CONTEXT_BELOW_SLO');
        evidence.overLimitProbe.responseClass !== 'context-limit-refusal' &&
            fail('OVER_LIMIT_NOT_REFUSED')
    }

    for (const trial of trials) {
        if (!trial.workload.concurrent) {
            failures.push({code: 'WORKLOAD_NOT_CONCURRENT', runId: trial.scheduleId})
        }

        for (const laneName of LANE_NAMES) {
            evaluateLane({
                allocation: profile.lanes[laneName],
                failures,
                lane      : trial.lanes[laneName],
                laneName,
                runId     : trial.scheduleId,
                slo       : plan.slo.lanes[laneName]
            })
        }
    }

    return {
        candidate,
        contextEvidence,
        failures,
        sampleCount: trials.length,
        status     : failures.length === 0 ? 'PASS' : 'FAIL',
        trials,
        uncertainty: Object.fromEntries(LANE_NAMES.map(laneName => [
            laneName,
            summarizeLaneTrials(trials.map(trial => trial.lanes[laneName]))
        ]))
    }
}

/**
 * @summary Evaluates one lane/run receipt against the explicit SLO and declared containment.
 * @param {Object} options
 */
function evaluateLane({allocation, failures, lane, laneName, runId, slo}) {
    const fail          = code => failures.push({code, lane: laneName, runId}),
          requiredCount = lane.queueDispositionCounts[slo.requiredQueueDisposition];

    requiredCount !== lane.providerOperationCount && fail('QUEUE_DISPOSITION_MISMATCH');
    lane.maxNeoQueueWaitMs !== null && lane.maxNeoQueueWaitMs > slo.maxNeoQueueWaitMs && fail('QUEUE_WAIT_EXCEEDED');
    lane.maxProviderDurationMs > slo.maxProviderDurationMs && fail('PROVIDER_DURATION_EXCEEDED');
    lane.throughputPerSecond < slo.minThroughputPerSecond && fail('THROUGHPUT_BELOW_SLO');
    lane.cpuHighWaterPercent > slo.maxCpuHighWaterPercent && fail('CPU_HIGH_WATER_EXCEEDED');
    lane.rssHighWaterBytes > slo.maxRssHighWaterBytes && fail('RSS_HIGH_WATER_EXCEEDED');
    lane.cpuHighWaterPercent > allocation.cpuCores * 100 && fail('CPU_ALLOCATION_EXCEEDED');
    lane.rssHighWaterBytes > allocation.memoryBytes && fail('RSS_ALLOCATION_EXCEEDED');
    lane.resourceCoverageRatio < slo.minResourceCoverageRatio && fail('RESOURCE_COVERAGE_BELOW_SLO');
    lane.resourceGapCount > slo.maxResourceGapCount && fail('RESOURCE_GAPS_EXCEEDED');
    lane.errorCount > slo.maxErrors && fail('ERROR_BUDGET_EXCEEDED');
    lane.unexpectedRefusalCount > slo.maxUnexpectedRefusals && fail('REFUSAL_BUDGET_EXCEEDED');
    lane.completedOperations < slo.minCompletedOperations && fail('PROGRESS_BELOW_SLO');
    lane.maxProgressGapMs > slo.maxProgressGapMs && fail('PROGRESS_GAP_EXCEEDED')
}

/**
 * @summary Summarizes candidate variability without guessing missing queue waits into zero.
 * @param {Object[]} lanes Derived lane receipts.
 * @returns {Object}
 */
function summarizeLaneTrials(lanes) {
    return Object.fromEntries(SUMMARY_FIELDS.map(field => [
        field,
        summarizeValues(lanes.map(lane => lane[field]))
    ]))
}

/**
 * @summary Projects honest descriptive statistics; p95 appears only with at least five values.
 * @param {Array<Number|null>} values Values.
 * @returns {Object}
 */
function summarizeValues(values) {
    const finite = values.filter(Number.isFinite);

    if (finite.length === 0) {
        return {max: null, median: null, min: null, n: 0, observedRange: null, p95: null}
    }

    const min = Math.min(...finite),
          max = Math.max(...finite);

    return {
        max,
        median       : median(finite),
        min,
        n            : finite.length,
        observedRange: max - min,
        p95          : finite.length >= 5 ? percentile(finite, 0.95) : null
    }
}

/**
 * @summary Resolves one candidate profile.
 * @param {Object} plan Election plan.
 * @param {Number} candidate Candidate value.
 * @returns {Object}
 */
function getProfile(plan, candidate) {
    return plan.candidateProfiles.find(profile => profile.embeddingSlots === candidate)
}

/**
 * @summary Derives the largest no-completion interval across one measured trial.
 * @param {Number} startedAtMs Trial start.
 * @param {Number} completedAtMs Trial completion.
 * @param {Number[]} completions Durable completion timestamps.
 * @returns {Number}
 */
function deriveMaxProgressGap(startedAtMs, completedAtMs, completions) {
    const points = [startedAtMs, ...completions.sort((a, b) => a - b), completedAtMs];

    return Math.max(...points.slice(1).map((point, index) => point - points[index]))
}

/**
 * @summary Derives actual provider concurrency from operation intervals.
 * @param {Object[]} operations Derived operations.
 * @returns {Number}
 */
function deriveMaxProviderConcurrency(operations) {
    const events = operations.flatMap(operation => [
        {atMs: operation.providerStartedAtMs, delta: 1},
        {atMs: operation.completedAtMs, delta: -1}
    ]).sort((a, b) => a.atMs - b.atMs || a.delta - b.delta);

    let active  = 0,
        maximum = 0;

    for (const event of events) {
        active  += event.delta;
        maximum = Math.max(maximum, active)
    }

    return maximum
}

/**
 * @summary Requires a positive finite number.
 * @param {*} value Candidate value.
 * @param {String} label Error label.
 */
function assertPositiveFinite(value, label) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${label} must be a positive finite number`)
    }
}

/**
 * @summary Requires a positive integer.
 * @param {*} value Candidate value.
 * @param {String} label Error label.
 */
function assertPositiveInteger(value, label) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${label} must be a positive integer`)
    }
}
