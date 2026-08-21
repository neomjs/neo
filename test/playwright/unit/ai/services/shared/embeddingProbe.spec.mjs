import {expect, test} from '@playwright/test';
import {
    buildEmbeddingProbeBlock,
    buildEmbeddingProbeInput,
    describeEmbeddingProbeFailure,
    EMBEDDING_PROBE_BAND_FRACTION
}                                       from '../../../../../../ai/services/shared/embeddingProbe.mjs';
import {resolveEmbeddingAdmissionBand}  from '../../../../../../ai/embeddingSafeBand.mjs';

/**
 * A probe that cannot fail the way its subject fails is not a control.
 *
 * The recovery probe sent a 44-byte constant while production inputs ran to ~14,000 tokens, and peak
 * memory for one non-causal embedding request scales with the SQUARE of the token count. So the probe
 * certified a property nobody asked about — can the HTTP plane answer at all — while the property
 * under question went unmeasured, and its `healthy` was the green light that re-dispatched the batch
 * that killed the engine. 36 restarts, three repositories backoff-suppressed, and a probe reporting
 * `failureStreak: 0` two seconds after the sweep's own `lastErrorAt`.
 */

// The shipped embedding leaves, so the fixtures are the real geometry rather than round numbers.
const SHIPPED_BAND = resolveEmbeddingAdmissionBand({
    contextLimitTokens       : 32768,
    safeProcessingLimitTokens: 28672
});

const cfg = {embeddingProvider: 'openAiCompatible', vectorDimension: 4096};

/**
 * @summary A provider that succeeds below a token threshold and DIES above it.
 *
 * The threshold is the whole point. A stub failing on every input would report unhealthy before and
 * after the change and prove nothing; a stub failing on none would do the reverse. Only a
 * size-dependent failure can show that the probe's SIZE is what decides the verdict.
 */
const dyingAbove = thresholdEstimateTokens => async text => {
    if (text.length / 3 > thresholdEstimateTokens) {
        const error = new Error('connection reset by peer');
        error.code  = 'ECONNRESET';
        throw error
    }

    return new Array(cfg.vectorDimension).fill(0.1)
};

test.describe('buildEmbeddingProbeInput — the probe is sized from the band (#17337)', () => {
    test('the input derives from the admitted band, not from a constant', () => {
        const sized = buildEmbeddingProbeInput({estimateBandTokens: SHIPPED_BAND.estimateBandTokens});

        expect(SHIPPED_BAND.resolved).toBe(true);
        expect(sized.sized).toBe(true);
        expect(sized.fraction).toBe(EMBEDDING_PROBE_BAND_FRACTION);
        expect(sized.estimateTokens).toBe(Math.floor(SHIPPED_BAND.estimateBandTokens * EMBEDDING_PROBE_BAND_FRACTION));

        // Bounded and stated: the byte cost is exactly the estimate-token budget times the
        // bytes-per-token heuristic, so a reader can price a cadence probe without running one.
        expect(sized.input.length).toBe(sized.estimateTokens * 3);

        // A narrower deployment gets a proportionally narrower probe — the band is the authority,
        // never a number chosen here. Without this, "derives from the band" passes on a constant
        // that happens to equal the default band.
        const narrow = buildEmbeddingProbeInput({estimateBandTokens: Math.floor(SHIPPED_BAND.estimateBandTokens / 4)});

        expect(narrow.estimateTokens).toBeLessThan(sized.estimateTokens);
    });

    test('the fraction is honoured, and a full-band probe is reachable', () => {
        const quarter = buildEmbeddingProbeInput({estimateBandTokens: 4000, fraction: 0.25}),
              full    = buildEmbeddingProbeInput({estimateBandTokens: 4000, fraction: 1});

        expect(quarter.estimateTokens).toBe(1000);
        expect(full.estimateTokens).toBe(4000);
    });

    test('an unresolvable band still probes, and SAYS it probed unsized', () => {
        // Refusing to probe would remove a signal; probing silently at marker size would recreate the
        // defect. The third option is the honest one: probe, and report the coverage.
        for (const estimateBandTokens of [null, undefined, 0, -1, Number.NaN]) {
            const unsized = buildEmbeddingProbeInput({estimateBandTokens});

            expect(unsized.sized).toBe(false);
            expect(unsized.fraction).toBeNull();
            expect(unsized.input.length).toBeGreaterThan(0);
        }

        // An out-of-range fraction is a caller defect, and it must read as unsized rather than as a
        // silent clamp — a clamped probe would report a fraction it did not exercise.
        expect(buildEmbeddingProbeInput({estimateBandTokens: 4000, fraction: 1.5}).sized).toBe(false);
        expect(buildEmbeddingProbeInput({estimateBandTokens: 4000, fraction: 0}).sized).toBe(false);
    });

    test('the generated text is varied, because a repeated character is not a workload', () => {
        // A run-length-trivial input collapses in the tokenizer, which would put the real token count
        // far below the estimate the caller believes it asked for — a sized probe that is not.
        const {input} = buildEmbeddingProbeInput({estimateBandTokens: 3000});

        expect(new Set(input).size).toBeGreaterThan(10);
        expect(input.startsWith('neo-embedding-probe')).toBe(true);
    });
});

test.describe('buildEmbeddingProbeBlock — no verdict is unqualified about its size (#17337)', () => {
    test('RED-PROOF: the tiny constant reports healthy where the band-sized input dies', async () => {
        // The incident, reproduced against a provider that dies above ~1,000 estimate-tokens — the
        // same shape as an engine OOM-killed by a real batch while answering 9- and 10-token inputs.
        const
            embedText = dyingAbove(1000),
            legacy    = await buildEmbeddingProbeBlock({
                cfg, embedText, input: 'neo-tenant-repo-sync-embedding-recovery-canary',
                operationLabel: 'probe', timeoutMs: 5_000
            }),
            sized     = buildEmbeddingProbeInput({estimateBandTokens: SHIPPED_BAND.estimateBandTokens}),
            current   = await buildEmbeddingProbeBlock({
                cfg, embedText, input: sized.input, operationLabel: 'probe', probeSize: sized, timeoutMs: 5_000
            });

        expect(legacy.status).toBe('healthy');
        expect(current.status).toBe('failed');
        expect(current.errorClassification).toBe('provider-died');

        // CONTROL: a provider that dies on EVERYTHING reports failed both ways, so it could not have
        // shown that size is what decides. The threshold is the proof, not the failure.
        const alwaysDies = dyingAbove(0);

        expect((await buildEmbeddingProbeBlock({
            cfg, embedText: alwaysDies, input: 'tiny', operationLabel: 'probe', timeoutMs: 5_000
        })).status).toBe('failed');
    });

    test('the size travels on EVERY verdict, healthy included', async () => {
        const
            sized   = buildEmbeddingProbeInput({estimateBandTokens: 8000}),
            healthy = await buildEmbeddingProbeBlock({
                cfg, embedText: async () => new Array(cfg.vectorDimension).fill(0.1),
                input: sized.input, operationLabel: 'probe', probeSize: sized, timeoutMs: 5_000
            }),
            failed  = await buildEmbeddingProbeBlock({
                cfg, embedText: dyingAbove(1), input: sized.input, operationLabel: 'probe',
                probeSize: sized, timeoutMs: 5_000
            }),
            short   = await buildEmbeddingProbeBlock({
                cfg, embedText: async () => new Array(8).fill(0.1),
                input: sized.input, operationLabel: 'probe', probeSize: sized, timeoutMs: 5_000
            });

        // The healthy path is the one that mattered: an unqualified `healthy` is exactly what a
        // consumer read as readiness for admitted-size work.
        for (const result of [healthy, failed, short]) {
            expect(result.probeEstimateTokens).toBe(2000);
            expect(result.probeBandFraction).toBe(0.25);
            expect(result.probeSized).toBe(true);
        }

        expect(healthy.status).toBe('healthy');
        expect(failed.status).toBe('failed');
        expect(short.status).toBe('failed');
    });

    test('a caller supplying no size leaves the payload untouched', async () => {
        // The other consumers of this helper are healthcheck WRITE CANARIES — deliberately
        // liveness-only, deliberately tiny, not read as readiness for real work. Emitting the
        // coverage fields as nulls there would change two other services' public health contracts to
        // describe a size they never claimed to exercise. The surface that IS read as readiness
        // declares them explicitly at its own projection instead.
        const result = await buildEmbeddingProbeBlock({
            cfg, embedText: async () => new Array(cfg.vectorDimension).fill(0.1),
            input: 'x', operationLabel: 'probe', timeoutMs: 5_000
        });

        expect(result.status).toBe('healthy');
        expect(Object.hasOwn(result, 'probeSized')).toBe(false);
        expect(Object.hasOwn(result, 'probeEstimateTokens')).toBe(false);
        expect(Object.hasOwn(result, 'probeBandFraction')).toBe(false);
    });
});

test.describe('describeEmbeddingProbeFailure — death is not the same fact as failure (#17337)', () => {
    test('a provider that DIES mid-answer is classified apart from one that never answered', () => {
        // The discrimination a recovery probe needs. `provider-unreachable` means the connection
        // never came up — ambient, and the lane may be fine once it does. `provider-died` means the
        // request was accepted and the process went away, which is what an OOM kill leaves behind:
        // direct evidence that this lane cannot serve this input.
        const classify = code => {
            const error = new Error('x');
            error.code  = code;

            return describeEmbeddingProbeFailure(error).errorClassification
        };

        for (const code of ['ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET', 'ERR_STREAM_PREMATURE_CLOSE']) {
            expect(classify(code)).toBe('provider-died');
        }

        // CONTROL: the neighbouring classifications are unchanged, so "death" did not swallow them.
        expect(classify('ECONNREFUSED')).toBe('provider-unreachable');
        expect(classify('PROVIDER_TIMEOUT')).toBe('provider-timeout');
        expect(classify('EMBEDDING_MODEL_NOT_RESIDENT')).toBe('model-not-resident');
        expect(classify('SOMETHING_UNMAPPED')).toBe('provider-failure');
    });
});
