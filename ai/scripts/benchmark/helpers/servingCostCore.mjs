/**
 * @module ai/scripts/benchmark/helpers/servingCostCore
 * @summary The pure aggregation core of the serving-cost meter: process-resource samples in,
 * phase-classified duty-cycle aggregates and validated `METRIC` property bags out.
 *
 * **Why a pure module**: the meter's CLI is a thread-entrypoint (it may import `AiConfig` to
 * resolve the resident-model endpoints); THIS module is not — it holds every function whose
 * correctness a unit spec must pin (phase classification, window aggregation, metric-bag
 * shaping) as pure data transforms over injected samples. No Neo import, no config read, no
 * clock read — callers inject timestamps, so identical inputs are identical outputs forever.
 *
 * **Honesty contract** (the `[UNMEASURED]` discipline this leaf exists to serve):
 * - phases are classified by a CPU-activity THRESHOLD heuristic; the threshold travels into
 *   every produced metric's `confoundDisclaimer` — a consumer can never mistake the split for
 *   ground-truth request tracing;
 * - every metric bag carries `claimClass: 'measured'` plus the `falsifyingQuery` that re-runs
 *   the measurement — a figure without its falsifier is refused upstream by the business
 *   schema's own validation, and this module never fabricates one;
 * - aggregation reports COVERAGE (`sampleCount`, `gapCount`, window bounds) so a sparse or
 *   interrupted run reads as exactly that, never as a clean day.
 * @plane in-plane
 */

/**
 * One resource sample of one process at one instant. `cpuPercent` is the scheduler-reported
 * utilization since the previous observation (the `ps pcpu` semantic); `rssBytes` is resident
 * set size.
 * @typedef {Object} ResourceSample
 * @property {Number} atMs        Injected epoch timestamp (the caller owns the clock).
 * @property {Number} cpuPercent  0..(100 * cores)
 * @property {Number} rssBytes    Resident set size in bytes.
 * @property {String} role        The sampled process role (e.g. 'chat-model', 'embedding-model').
 */

/**
 * Classifies one sample against the activity threshold — the meter's honest phase heuristic.
 * @param {ResourceSample} sample
 * @param {Number} activeCpuThreshold CPU percent at/above which the instant counts as active.
 * @returns {'active'|'idle'}
 */
export function classifySample(sample, activeCpuThreshold) {
    if (!Number.isFinite(sample?.cpuPercent) || sample.cpuPercent < 0) {
        throw new Error(`classifySample: cpuPercent must be a finite non-negative number, got ${sample?.cpuPercent}`)
    }

    if (!Number.isFinite(activeCpuThreshold) || activeCpuThreshold <= 0) {
        throw new Error(`classifySample: activeCpuThreshold must be a positive finite number, got ${activeCpuThreshold}`)
    }

    return sample.cpuPercent >= activeCpuThreshold ? 'active' : 'idle'
}

/**
 * Aggregates one role's sample stream into the duty-cycle figures the results doc publishes.
 *
 * Gap accounting: any inter-sample interval exceeding `expectedIntervalMs * gapFactor` counts
 * as a coverage gap — its duration is EXCLUDED from phase time (never guessed into idle), and
 * the gap count is reported so the window's honesty is inspectable.
 *
 * Boundary accounting: without the REQUESTED bounds, "covered" only spans first→last sample —
 * a nominal 1h run whose endpoint appeared for its final 10s would read as a clean 10s window
 * with zero gaps. Passing `windowBounds` makes the absence VISIBLE: leading/trailing
 * unavailable durations plus a coverage ratio against the nominal window.
 *
 * @param {ResourceSample[]} samples Chronologically ordered samples of ONE role.
 * @param {Object} options
 * @param {Number} options.activeCpuThreshold The phase heuristic threshold (travels into disclaimers).
 * @param {Number} options.expectedIntervalMs The sampler's nominal tick.
 * @param {Number} [options.gapFactor=3] Multiples of the nominal tick that constitute a gap.
 * @param {Object} [options.windowBounds] The REQUESTED sampling window `{startMs, endMs}`.
 * @returns {{
 *     activeMs: Number, idleMs: Number, coveredMs: Number, windowStartMs: Number, windowEndMs: Number,
 *     dutyCycle: Number, sampleCount: Number, gapCount: Number, gapMs: Number,
 *     rssHighWaterBytes: Number, rssMeanBytes: Number, cpuMeanPercent: Number, cpuActiveMeanPercent: Number,
 *     leadingUnavailableMs: Number|null, trailingUnavailableMs: Number|null, nominalWindowMs: Number|null, coverageRatio: Number|null
 * }}
 */
export function aggregateWindow(samples, {activeCpuThreshold, expectedIntervalMs, gapFactor = 3, windowBounds = null}) {
    if (!Array.isArray(samples) || samples.length < 2) {
        throw new Error('aggregateWindow: at least two chronologically ordered samples are required')
    }

    if (!Number.isFinite(expectedIntervalMs) || expectedIntervalMs <= 0) {
        throw new Error(`aggregateWindow: expectedIntervalMs must be a positive finite number, got ${expectedIntervalMs}`)
    }

    if (windowBounds !== null && (!Number.isFinite(windowBounds.startMs) || !Number.isFinite(windowBounds.endMs) || windowBounds.endMs <= windowBounds.startMs)) {
        throw new Error('aggregateWindow: windowBounds requires finite startMs < endMs')
    }

    let activeMs         = 0,
        idleMs           = 0,
        gapCount         = 0,
        gapMs            = 0,
        rssHighWater     = 0,
        rssSum           = 0,
        cpuSum           = 0,
        cpuActiveSum     = 0,
        activeSampleHits = 0;

    const gapLimitMs = expectedIntervalMs * gapFactor;

    samples.forEach((sample, index) => {
        if (index > 0 && sample.atMs <= samples[index - 1].atMs) {
            throw new Error('aggregateWindow: samples must be strictly chronological')
        }

        rssHighWater = Math.max(rssHighWater, sample.rssBytes);
        rssSum      += sample.rssBytes;
        cpuSum      += sample.cpuPercent;

        const phase = classifySample(sample, activeCpuThreshold);

        if (phase === 'active') {
            activeSampleHits++;
            cpuActiveSum += sample.cpuPercent
        }

        if (index === 0) {
            return
        }

        const intervalMs = sample.atMs - samples[index - 1].atMs;

        if (intervalMs > gapLimitMs) {
            // a coverage hole is REPORTED, never guessed into a phase
            gapCount++;
            gapMs += intervalMs;
            return
        }

        // the interval is attributed to the phase of its CLOSING sample — a fixed, documented
        // convention (the alternative attributions differ by at most one tick per transition)
        phase === 'active' ? (activeMs += intervalMs) : (idleMs += intervalMs)
    });

    const coveredMs     = activeMs + idleMs,
          firstSampleMs = samples[0].atMs,
          lastSampleMs  = samples[samples.length - 1].atMs;

    let coverageRatio         = null,
        leadingUnavailableMs  = null,
        nominalWindowMs       = null,
        trailingUnavailableMs = null;

    if (windowBounds !== null) {
        nominalWindowMs       = windowBounds.endMs - windowBounds.startMs;
        leadingUnavailableMs  = Math.max(0, firstSampleMs - windowBounds.startMs);
        trailingUnavailableMs = Math.max(0, windowBounds.endMs - lastSampleMs);
        coverageRatio         = coveredMs / nominalWindowMs
    }

    return {
        activeMs,
        coverageRatio,
        coveredMs,
        cpuActiveMeanPercent: activeSampleHits > 0 ? cpuActiveSum / activeSampleHits : 0,
        cpuMeanPercent      : cpuSum / samples.length,
        dutyCycle           : coveredMs > 0 ? activeMs / coveredMs : 0,
        gapCount,
        gapMs,
        idleMs,
        leadingUnavailableMs,
        nominalWindowMs,
        rssHighWaterBytes   : rssHighWater,
        rssMeanBytes        : rssSum / samples.length,
        sampleCount         : samples.length,
        trailingUnavailableMs,
        windowEndMs         : lastSampleMs,
        windowStartMs       : firstSampleMs
    }
}

/**
 * Shapes one role's aggregate into the `METRIC` property bags the business schema accepts —
 * identity fields for `createMetricId`, plus the full required-property set with the
 * falsifying re-run command and the heuristic disclaimer. Emits one bag per published figure
 * (duty cycle, rss high-water, active-phase cpu mean) so each number is independently
 * falsifiable and independently ingestible.
 *
 * This module does NOT write the graph: the bags flow to the tenant-ingestion path, and the
 * schema's own `validateBusinessProperties` remains the gate — a bag this function produces
 * with a missing falsifier is a bug the unit spec pins, not a runtime possibility.
 *
 * @param {Object} aggregate One `aggregateWindow` result.
 * @param {Object} identity
 * @param {String} identity.role             The sampled process role.
 * @param {String} identity.hardwareId       The named reference hardware slug (provenance, not marketing).
 * @param {String} identity.periodStart      ISO date of the window start (identity field).
 * @param {String} identity.windowSemantics  e.g. 'institution-day-rolling'.
 * @param {String} identity.rerunCommand     The exact CLI invocation that reproduces the figures.
 * @param {Number} identity.activeCpuThreshold The heuristic threshold (for the disclaimer).
 * @returns {Object[]} property bags, each `{metricName, source, windowSemantics, periodStart, properties}`
 */
export function buildMetricBags(aggregate, identity) {
    const required = ['role', 'hardwareId', 'periodStart', 'windowSemantics', 'rerunCommand', 'activeCpuThreshold'];

    for (const key of required) {
        if (identity?.[key] === undefined || identity[key] === null || identity[key] === '') {
            throw new Error(`buildMetricBags: identity field "${key}" is required — provenance is not optional`)
        }
    }

    const boundary = aggregate.nominalWindowMs !== null
              ? `; requested window ${aggregate.nominalWindowMs}ms, coverage ratio ${(aggregate.coverageRatio ?? 0).toFixed(4)}, ` +
                `leading/trailing unavailable ${aggregate.leadingUnavailableMs}ms/${aggregate.trailingUnavailableMs}ms`
              : '',
          source     = `serving-cost-meter:${identity.hardwareId}`,
          disclaimer = `phase split is a cpu-threshold heuristic (active >= ${identity.activeCpuThreshold}% pcpu), ` +
                       `not request tracing; co-resident load on the reference machine is not isolated; ` +
                       `coverage: ${aggregate.sampleCount} samples, ${aggregate.gapCount} gaps (${aggregate.gapMs}ms excluded)${boundary}`;

    const bag = (metricName, value, unit) => ({
        metricName,
        periodStart: identity.periodStart,
        properties : {
            claimClass        : 'measured',
            confoundDisclaimer: disclaimer,
            falsifyingQuery   : identity.rerunCommand,
            publicFlag        : true,
            role              : identity.role,
            unit,
            value,
            windowEndMs       : aggregate.windowEndMs,
            windowSemantics   : identity.windowSemantics,
            windowStartMs     : aggregate.windowStartMs
        },
        source,
        windowSemantics: identity.windowSemantics
    });

    return [
        bag(`${identity.role}.dutyCycle`,            aggregate.dutyCycle,            'fraction'),
        bag(`${identity.role}.rssHighWater`,         aggregate.rssHighWaterBytes,    'bytes'),
        bag(`${identity.role}.cpuActiveMean`,        aggregate.cpuActiveMeanPercent, 'pcpu-percent'),
        bag(`${identity.role}.coveredWindow`,        aggregate.coveredMs,            'ms')
    ]
}
