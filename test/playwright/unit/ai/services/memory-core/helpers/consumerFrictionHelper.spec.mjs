import {setup} from '../../../../../setup.mjs';

const appName = 'ConsumerFrictionHelperTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';

/**
 * @summary Unit coverage for the Brain-Pillar Consumer-Friction Helper (#11447 V1).
 *
 * The helper is module-singleton state — tests MUST `clearAggregatedFrictions()` in
 * `beforeEach` to prevent cross-test pollution. Per `feedback_symmetric_spec_cleanup`,
 * shared mutable state across tests requires symmetric reset discipline.
 *
 * Schema verified against Discussion #11444 graduation contract (Round-2 + Round-3
 * consensus): structured `ConsumerFriction` with `suggestionKind`, token-based durable
 * metrics, `(assetRef, consumer, symptom)` aggregation tuple, `serviceDomain` provenance,
 * `firstSeenAt`/`lastSeenAt`/`count` aggregation fields.
 *
 * @see ai/services/memory-core/helpers/consumerFrictionHelper.mjs
 */
test.describe.serial('Neo.ai.services.memory-core.helpers.ConsumerFrictionHelper (#11447)', () => {
    let helper;

    test.beforeAll(async () => {
        helper = await import('../../../../../../../ai/services/memory-core/helpers/consumerFrictionHelper.mjs');
    });

    test.beforeEach(() => {
        helper.clearAggregatedFrictions();
    });

    test('bytesToTokens applies the conservative dense-text heuristic', () => {
        const {bytesToTokens} = helper;
        expect(bytesToTokens(0)).toBe(0);
        expect(bytesToTokens(3)).toBe(1);
        expect(bytesToTokens(4)).toBe(2);
        expect(bytesToTokens(40)).toBe(14);
        expect(bytesToTokens(131072)).toBe(43691);
        // Edge: negative / non-finite → 0
        expect(bytesToTokens(-1)).toBe(0);
        expect(bytesToTokens(NaN)).toBe(0);
        expect(bytesToTokens(undefined)).toBe(0);
    });

    test('categorizeInvocationError maps known patterns to symptoms', () => {
        const {categorizeInvocationError} = helper;

        expect(categorizeInvocationError(new Error('Context window exceeded'))).toBe('context-overflow');
        expect(categorizeInvocationError(new Error('Request was too large'))).toBe('context-overflow');
        expect(categorizeInvocationError(new Error('Maximum input limit'))).toBe('context-overflow');
        expect(categorizeInvocationError(new Error('Request timed out'))).toBe('timeout');
        expect(categorizeInvocationError(new Error('AbortError: operation aborted'))).toBe('timeout');
        expect(categorizeInvocationError(new Error('JSON parse failure'))).toBe('parse-failure');
        expect(categorizeInvocationError(null)).toBe('parse-failure');
        expect(categorizeInvocationError('overflow occurred')).toBe('context-overflow');
    });

    test('deriveSuggestionKind maps symptoms to enum-backed suggestions', () => {
        const {deriveSuggestionKind} = helper;
        expect(deriveSuggestionKind('size-precheck-skip')).toBe('compress-payload');
        expect(deriveSuggestionKind('context-overflow')).toBe('compress-payload');
        expect(deriveSuggestionKind('token-budget-exceeded')).toBe('compress-payload');
        expect(deriveSuggestionKind('parse-failure')).toBe('schema-repair');
        expect(deriveSuggestionKind('semantic-confusion')).toBe('extract-anchor');
        expect(deriveSuggestionKind('timeout')).toBe('unknown');
        expect(deriveSuggestionKind('unrecognized-symptom')).toBe('unknown');
    });

    test('emitConsumerFriction throws on invalid symptom / suggestionKind / serviceDomain', () => {
        const {emitConsumerFriction} = helper;

        expect(() => emitConsumerFriction({})).toThrow(/invalid symptom/);
        expect(() => emitConsumerFriction({symptom: 'bogus'})).toThrow(/invalid symptom/);
        expect(() => emitConsumerFriction({
            symptom       : 'parse-failure',
            suggestionKind: 'invented-kind'
        })).toThrow(/invalid suggestionKind/);
        expect(() => emitConsumerFriction({
            symptom      : 'parse-failure',
            serviceDomain: 'fake-domain'
        })).toThrow(/invalid serviceDomain/);
        expect(() => emitConsumerFriction({
            symptom      : 'parse-failure',
            emissionPoint: 'wrong-point'
        })).toThrow(/invalid emissionPoint/);
    });

    test('emitConsumerFriction surfaces deterministic symptoms on first occurrence', () => {
        const {emitConsumerFriction, getAggregatedFrictions} = helper;

        emitConsumerFriction({
            assetRef          : 'session:abc',
            consumer          : 'SemanticGraphExtractor',
            model             : 'gemma4-31b',
            symptom           : 'size-precheck-skip',
            emissionPoint     : 'pre-invocation',
            inputBytes        : 100000,
            contextLimitTokens: 8192,
            serviceDomain     : 'dream-pipeline'
        });

        const surfaced = getAggregatedFrictions();

        expect(surfaced).toHaveLength(1);
        expect(surfaced[0]).toMatchObject({
            assetRef           : 'session:abc',
            consumer           : 'SemanticGraphExtractor',
            model              : 'gemma4-31b',
            symptom            : 'size-precheck-skip',
            emissionPoint      : 'pre-invocation',
            suggestionKind     : 'compress-payload',
            inputBytes         : 100000,
            inputTokensEstimate: 33334,
            contextLimitTokens : 8192,
            count              : 1,
            serviceDomain      : 'dream-pipeline'
        });
        // Required durable-aggregation fields present
        expect(typeof surfaced[0].firstSeenAt).toBe('string');
        expect(typeof surfaced[0].lastSeenAt).toBe('string');
    });

    test('emitConsumerFriction surfaces context-overflow on first occurrence', () => {
        const {emitConsumerFriction, getAggregatedFrictions} = helper;

        emitConsumerFriction({
            assetRef          : 'session:def',
            consumer          : 'SessionService',
            model             : 'gemma4-31b',
            symptom           : 'context-overflow',
            emissionPoint     : 'post-invocation-failure',
            inputBytes        : 50000,
            contextLimitTokens: 8192,
            serviceDomain     : 'memory-core'
        });

        const surfaced = getAggregatedFrictions();
        expect(surfaced).toHaveLength(1);
        expect(surfaced[0].symptom).toBe('context-overflow');
        expect(surfaced[0].serviceDomain).toBe('memory-core');
    });

    test('emitConsumerFriction aggregates probabilistic symptoms and surfaces at threshold', () => {
        const {emitConsumerFriction, getAggregatedFrictions, _testConstants} = helper;
        const threshold = _testConstants.PROBABILISTIC_EMIT_THRESHOLD;

        const baseFriction = {
            assetRef          : 'session:ghi',
            consumer          : 'SemanticGraphExtractor',
            model             : 'gemma4-31b',
            symptom           : 'parse-failure',
            emissionPoint     : 'post-invocation-failure',
            inputBytes        : 5000,
            contextLimitTokens: 8192,
            serviceDomain     : 'dream-pipeline'
        };

        // Below threshold: do not surface
        for (let i = 1; i < threshold; i++) {
            emitConsumerFriction({...baseFriction});
        }
        expect(getAggregatedFrictions()).toHaveLength(0);

        // Threshold-th emission: surface
        emitConsumerFriction({...baseFriction});
        const surfaced = getAggregatedFrictions();
        expect(surfaced).toHaveLength(1);
        expect(surfaced[0].count).toBe(threshold);
        expect(surfaced[0].suggestionKind).toBe('schema-repair');
    });

    test('emitConsumerFriction aggregates by (assetRef, consumer, symptom) tuple — different assetRefs do not collide', () => {
        const {emitConsumerFriction, getAggregatedFrictions, _testConstants} = helper;
        const threshold = _testConstants.PROBABILISTIC_EMIT_THRESHOLD;

        const base = {
            consumer          : 'SemanticGraphExtractor',
            model             : 'gemma4-31b',
            symptom           : 'parse-failure',
            emissionPoint     : 'post-invocation-failure',
            inputBytes        : 5000,
            contextLimitTokens: 8192,
            serviceDomain     : 'dream-pipeline'
        };

        for (let i = 0; i < threshold; i++) {
            emitConsumerFriction({...base, assetRef: 'session:tuple-a'});
            emitConsumerFriction({...base, assetRef: 'session:tuple-b'});
        }

        const surfaced = getAggregatedFrictions();
        expect(surfaced).toHaveLength(2);
        expect(new Set(surfaced.map(f => f.assetRef))).toEqual(new Set(['session:tuple-a', 'session:tuple-b']));
    });

    test('getAggregatedFrictions prunes entries past AGGREGATOR_TTL_MS', () => {
        const {emitConsumerFriction, getAggregatedFrictions, _testConstants} = helper;
        const ttl = _testConstants.AGGREGATOR_TTL_MS;

        emitConsumerFriction({
            assetRef          : 'session:ttl',
            consumer          : 'SemanticGraphExtractor',
            model             : 'gemma4-31b',
            symptom           : 'size-precheck-skip',
            emissionPoint     : 'pre-invocation',
            inputBytes        : 100000,
            contextLimitTokens: 8192,
            serviceDomain     : 'dream-pipeline'
        });

        expect(getAggregatedFrictions({now: Date.now()})).toHaveLength(1);

        // Future-clock past TTL — entry should be pruned
        const futureNow = Date.now() + ttl + 1000;
        expect(getAggregatedFrictions({now: futureNow})).toHaveLength(0);
        expect(getAggregatedFrictions({now: Date.now()})).toHaveLength(0);
    });

    test('invokeWithGuardrail Angle 2 — pre-check skips invocation when input tokens exceed safeProcessingLimitTokens', async () => {
        const {invokeWithGuardrail, getAggregatedFrictions} = helper;

        let   invoked = false;
        const result  = await invokeWithGuardrail({
            invocationFn             : async () => { invoked = true; return 'should not run'; },
            inputPayload             : 'x'.repeat(50000), // 50000 bytes = 16667 tokens estimate
            model                    : 'gemma4-31b',
            assetRef                 : 'session:precheck',
            consumer                 : 'SemanticGraphExtractor',
            contextLimitTokens       : 10000,
            safeProcessingLimitTokens: 7500,
            serviceDomain            : 'dream-pipeline'
        });

        expect(invoked).toBe(false);
        expect(result.result).toBeNull();
        expect(result.friction).not.toBeNull();
        expect(result.friction).toMatchObject({
            symptom                  : 'size-precheck-skip',
            emissionPoint            : 'pre-invocation',
            inputBytes               : 50000,
            inputTokensEstimate      : 16667,
            contextLimitTokens       : 10000,
            safeProcessingLimitTokens: 7500,
            suggestionKind           : 'compress-payload',
            serviceDomain            : 'dream-pipeline'
        });

        expect(getAggregatedFrictions()).toHaveLength(1);
    });

    test('invokeWithGuardrail skips incident-shaped dense REM payload before provider invocation (#13918)', async () => {
        const {invokeWithGuardrail} = helper;

        let   invoked = false;
        const result  = await invokeWithGuardrail({
            invocationFn             : async () => { invoked = true; return 'should not run'; },
            inputPayload             : 'x'.repeat(400000),
            model                    : 'google/gemma-4-26b-a4b',
            assetRef                 : 'session:incident-13918',
            consumer                 : 'SemanticGraphExtractor',
            contextLimitTokens       : 131072,
            safeProcessingLimitTokens: 100000,
            serviceDomain            : 'dream-pipeline'
        });

        expect(invoked).toBe(false);
        expect(result.result).toBeNull();
        expect(result.friction).toMatchObject({
            assetRef                 : 'session:incident-13918',
            symptom                  : 'size-precheck-skip',
            emissionPoint            : 'pre-invocation',
            inputBytes               : 400000,
            inputTokensEstimate      : 133334,
            contextLimitTokens       : 131072,
            safeProcessingLimitTokens: 100000
        });
    });

    test('invokeWithGuardrail still invokes payloads that remain inside the safe band (#13918)', async () => {
        const {invokeWithGuardrail} = helper;

        let   invoked = false;
        const result  = await invokeWithGuardrail({
            invocationFn             : async () => {
                invoked = true;
                return {content: 'ok'};
            },
            inputPayload             : 'x'.repeat(21000), // 21000 bytes = 7000 tokens estimate
            model                    : 'gemma4-31b',
            assetRef                 : 'session:under-band',
            consumer                 : 'SemanticGraphExtractor',
            contextLimitTokens       : 10000,
            safeProcessingLimitTokens: 7500,
            serviceDomain            : 'dream-pipeline'
        });

        expect(invoked).toBe(true);
        expect(result.result).toEqual({content: 'ok'});
        expect(result.friction).toBeNull();
    });

    test('invokeWithGuardrail Angle 2 — safeProcessingLimitTokens defaults to 75% of contextLimitTokens', async () => {
        const {invokeWithGuardrail} = helper;

        let invoked = false;
        // 33000 bytes ≈ 11000 tokens; contextLimitTokens 10000; default safe = 7500; input EXCEEDS safe
        const result = await invokeWithGuardrail({
            invocationFn      : async () => { invoked = true; return 'should not run'; },
            inputPayload      : 'x'.repeat(33000),
            model             : 'gemma4-31b',
            assetRef          : 'session:precheck-default',
            consumer          : 'SemanticGraphExtractor',
            contextLimitTokens: 10000,
            serviceDomain     : 'dream-pipeline'
            // safeProcessingLimitTokens omitted → uses 75% default = 7500
        });

        expect(invoked).toBe(false);
        expect(result.friction.symptom).toBe('size-precheck-skip');
        expect(result.friction.safeProcessingLimitTokens).toBe(7500);
        expect(result.friction.inputTokensEstimate).toBe(11000);
    });

    test('invokeWithGuardrail Angle 1 — success path returns result without friction', async () => {
        const {invokeWithGuardrail, getAggregatedFrictions} = helper;

        const result = await invokeWithGuardrail({
            invocationFn      : async () => ({content: 'ok', model: 'gemma4-31b'}),
            inputPayload      : 'small input',
            model             : 'gemma4-31b',
            assetRef          : 'session:success',
            consumer          : 'SemanticGraphExtractor',
            contextLimitTokens: 10000,
            serviceDomain     : 'dream-pipeline'
        });

        expect(result.result).toEqual({content: 'ok', model: 'gemma4-31b'});
        expect(result.friction).toBeNull();
        expect(getAggregatedFrictions()).toHaveLength(0);
    });

    test('invokeWithGuardrail Angle 1 — parse-failure aggregates and surfaces at threshold', async () => {
        const {invokeWithGuardrail, getAggregatedFrictions, _testConstants} = helper;
        const threshold = _testConstants.PROBABILISTIC_EMIT_THRESHOLD;

        for (let i = 0; i < threshold; i++) {
            const result = await invokeWithGuardrail({
                invocationFn      : async () => { throw new Error('Malformed JSON response'); },
                inputPayload      : 'small input',
                model             : 'gemma4-31b',
                assetRef          : 'session:fail-parse',
                consumer          : 'SemanticGraphExtractor',
                contextLimitTokens: 10000,
                serviceDomain     : 'dream-pipeline'
            });
            expect(result.result).toBeNull();
            expect(result.friction).not.toBeNull();
            expect(result.friction.symptom).toBe('parse-failure');
            expect(result.friction.suggestionKind).toBe('schema-repair');
            expect(result.friction.emissionPoint).toBe('post-invocation-failure');
        }

        const surfaced = getAggregatedFrictions();
        expect(surfaced).toHaveLength(1);
        expect(surfaced[0].count).toBe(threshold);
    });

    test('invokeWithGuardrail Angle 1 — context-overflow error surfaces immediately (deterministic)', async () => {
        const {invokeWithGuardrail, getAggregatedFrictions} = helper;

        const result = await invokeWithGuardrail({
            invocationFn      : async () => { throw new Error('Context window exceeded'); },
            inputPayload      : 'medium input',
            model             : 'gemma4-31b',
            assetRef          : 'session:fail-overflow',
            consumer          : 'SessionService',
            contextLimitTokens: 10000,
            serviceDomain     : 'memory-core'
        });

        expect(result.friction.symptom).toBe('context-overflow');
        expect(result.friction.suggestionKind).toBe('compress-payload');
        expect(getAggregatedFrictions()).toHaveLength(1);
    });

    test('invokeWithGuardrail honors caller-provided suggestionKind + note overrides', async () => {
        const {invokeWithGuardrail} = helper;

        const result = await invokeWithGuardrail({
            invocationFn      : async () => { throw new Error('JSON malformed'); },
            inputPayload      : 'tiny',
            model             : 'gemma4-31b',
            assetRef          : 'session:hint',
            consumer          : 'SemanticGraphExtractor',
            contextLimitTokens: 10000,
            serviceDomain     : 'dream-pipeline',
            suggestionKind    : 'extract-anchor',
            note              : 'Switch to qwen3-8b for stricter JSON output.'
        });

        expect(result.friction.suggestionKind).toBe('extract-anchor');
        expect(result.friction.note).toBe('Switch to qwen3-8b for stricter JSON output.');
    });

    test('emitConsumerFriction loud-fails on non-positive-finite contextLimitTokens (#12116 AC2)', () => {
        const {emitConsumerFriction, getAggregatedFrictions} = helper;

        // Direct emitter contract: #12116 AC2 requires the same loud-fail discipline
        // on emitConsumerFriction itself, not only on the invokeWithGuardrail wrapper.
        // Pre-fix the emitter happily recorded a friction entry with undefined
        // contextLimitTokens, silently corrupting the friction-feed downstream
        // (cross-family reviewer's empirical falsifier on PR #12121 cycle-1).
        const baseInput = {
            assetRef     : 'session:emit-loud-fail',
            consumer     : 'SemanticGraphExtractor',
            model        : 'gemma4-31b',
            symptom      : 'size-precheck-skip',
            emissionPoint: 'pre-invocation',
            inputBytes   : 100,
            serviceDomain: 'dream-pipeline'
        };

        for (const badValue of [undefined, null, 0, -1, NaN, Infinity, -Infinity, '10000']) {
            expect(() => emitConsumerFriction({
                ...baseInput,
                contextLimitTokens: badValue
            })).toThrow(/contextLimitTokens must be a positive finite number/);
        }

        // Aggregator stays untouched — the throw fires BEFORE any `_aggregator.set()`.
        expect(getAggregatedFrictions()).toHaveLength(0);
    });

    test('invokeWithGuardrail loud-fails on non-positive-finite contextLimitTokens (#12116 AC1)', async () => {
        const {invokeWithGuardrail, getAggregatedFrictions} = helper;

        // Pre-#12116 the NaN-silent-skip hole let undefined/null/NaN bypass the
        // Angle-2 pre-check (Math.floor(undefined * 0.75) === NaN; `n > NaN`
        // === false), then the invocation proceeded unguarded and the friction
        // record stored undefined for contextLimitTokens — silently corrupting
        // the friction feed. Loud-fail at entry forbids the silent-skip path
        // entirely; mirrors emitConsumerFriction's TypeError validation
        // discipline at lines 198-212.
        const baseInput = {
            invocationFn : async () => 'should not reach here',
            inputPayload : 'small',
            model        : 'gemma4-31b',
            assetRef     : 'session:loud-fail',
            consumer     : 'SemanticGraphExtractor',
            serviceDomain: 'dream-pipeline'
        };

        for (const badValue of [undefined, null, 0, -1, NaN, Infinity, -Infinity, '10000']) {
            let invoked = false;
            await expect(invokeWithGuardrail({
                ...baseInput,
                invocationFn      : async () => { invoked = true; return 'reached'; },
                contextLimitTokens: badValue
            })).rejects.toThrow(/contextLimitTokens must be a positive finite number/);
            expect(invoked).toBe(false);
        }

        // Aggregator must remain untouched — the throw fires BEFORE
        // emitConsumerFriction could record anything against the bad-input run.
        expect(getAggregatedFrictions()).toHaveLength(0);
    });

    test('renderConsumerFrictionSection returns empty string when no frictions surface', () => {
        const {renderConsumerFrictionSection} = helper;
        expect(renderConsumerFrictionSection()).toBe('');
    });

    test('renderConsumerFrictionSection emits structured Markdown with token metrics + suggestionKind', () => {
        const {emitConsumerFriction, renderConsumerFrictionSection} = helper;

        emitConsumerFriction({
            assetRef                 : 'session:render',
            consumer                 : 'SemanticGraphExtractor',
            model                    : 'gemma4-31b',
            symptom                  : 'size-precheck-skip',
            emissionPoint            : 'pre-invocation',
            inputBytes               : 100000,
            contextLimitTokens       : 8192,
            safeProcessingLimitTokens: 6144,
            serviceDomain            : 'dream-pipeline'
        });

        const section = renderConsumerFrictionSection();

        expect(section).toContain('### 🧠 Substrate-Consumer Friction');
        expect(section).toContain('**size-precheck-skip**');
        expect(section).toContain('`SemanticGraphExtractor`');
        expect(section).toContain('`session:render`');
        expect(section).toContain('`gemma4-31b`');
        expect(section).toContain('`dream-pipeline`');
        expect(section).toContain('33334 tokens');
        expect(section).toContain('safe 6144');
        expect(section).toContain('context 8192');
        expect(section).toContain('(`compress-payload`)');
    });

    test('renderConsumerFrictionSection groups multiple symptoms', () => {
        const {emitConsumerFriction, renderConsumerFrictionSection, _testConstants} = helper;
        const threshold = _testConstants.PROBABILISTIC_EMIT_THRESHOLD;

        emitConsumerFriction({
            assetRef          : 'session:overflow-1',
            consumer          : 'SemanticGraphExtractor',
            model             : 'gemma4-31b',
            symptom           : 'context-overflow',
            emissionPoint     : 'post-invocation-failure',
            inputBytes        : 50000,
            contextLimitTokens: 8192,
            serviceDomain     : 'dream-pipeline'
        });

        for (let i = 0; i < threshold; i++) {
            emitConsumerFriction({
                assetRef          : 'session:parse-1',
                consumer          : 'SessionService',
                model             : 'qwen3-8b',
                symptom           : 'parse-failure',
                emissionPoint     : 'post-invocation-failure',
                inputBytes        : 8000,
                contextLimitTokens: 8192,
                serviceDomain     : 'memory-core'
            });
        }

        const section = renderConsumerFrictionSection();

        expect(section).toContain('**context-overflow**');
        expect(section).toContain('**parse-failure**');
        expect(section).toContain('`SemanticGraphExtractor`');
        expect(section).toContain('`SessionService`');
        expect(section).toContain('`dream-pipeline`');
        expect(section).toContain('`memory-core`');
    });
});
