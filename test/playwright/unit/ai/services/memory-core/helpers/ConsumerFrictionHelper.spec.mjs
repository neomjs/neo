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
 * @see ai/services/memory-core/helpers/ConsumerFrictionHelper.mjs
 */
test.describe.serial('Neo.ai.services.memory-core.helpers.ConsumerFrictionHelper (#11447)', () => {
    let helper;

    test.beforeAll(async () => {
        helper = await import('../../../../../../../ai/services/memory-core/helpers/ConsumerFrictionHelper.mjs');
    });

    test.beforeEach(() => {
        helper.clearAggregatedFrictions();
    });

    test('categorizeInvocationError maps known patterns to symptoms', () => {
        const {categorizeInvocationError} = helper;

        expect(categorizeInvocationError(new Error('Context window exceeded'))).toBe('context-overflow');
        expect(categorizeInvocationError(new Error('Request was too large'))).toBe('context-overflow');
        expect(categorizeInvocationError(new Error('Maximum input limit'))).toBe('context-overflow');
        expect(categorizeInvocationError(new Error('Request timed out'))).toBe('timeout');
        expect(categorizeInvocationError(new Error('AbortError: operation aborted'))).toBe('timeout');
        expect(categorizeInvocationError(new Error('JSON parse failure'))).toBe('parse-failure');
        expect(categorizeInvocationError(new Error('Some other transient failure'))).toBe('parse-failure');
        // Edge: null / undefined / string
        expect(categorizeInvocationError(null)).toBe('parse-failure');
        expect(categorizeInvocationError('overflow occurred')).toBe('context-overflow');
    });

    test('emitConsumerFriction surfaces deterministic symptoms on first occurrence', () => {
        const {emitConsumerFriction, getAggregatedFrictions} = helper;

        const friction = {
            model                   : 'gemma4-31b',
            symptom                 : 'size-precheck-skip',
            emissionPoint           : 'pre-invocation',
            inputBytes              : 100000,
            modelContextLimit       : 50000,
            safeProcessingLimit     : 40000,
            workflowUpdateSuggestion: 'Reduce payload',
            timestamp               : new Date().toISOString(),
            assetRef                : 'session:abc',
            consumer                : 'gemma4-31b'
        };

        emitConsumerFriction(friction);
        const surfaced = getAggregatedFrictions();

        expect(surfaced).toHaveLength(1);
        expect(surfaced[0].count).toBe(1);
        expect(surfaced[0].friction.symptom).toBe('size-precheck-skip');
    });

    test('emitConsumerFriction surfaces context-overflow on first occurrence', () => {
        const {emitConsumerFriction, getAggregatedFrictions} = helper;

        emitConsumerFriction({
            model                   : 'gemma4-31b',
            symptom                 : 'context-overflow',
            emissionPoint           : 'post-invocation-failure',
            inputBytes              : 50000,
            modelContextLimit       : 40000,
            workflowUpdateSuggestion: 'Reduce payload',
            timestamp               : new Date().toISOString(),
            assetRef                : 'session:def',
            consumer                : 'gemma4-31b'
        });

        const surfaced = getAggregatedFrictions();
        expect(surfaced).toHaveLength(1);
        expect(surfaced[0].friction.symptom).toBe('context-overflow');
    });

    test('emitConsumerFriction aggregates probabilistic symptoms and surfaces at threshold', () => {
        const {emitConsumerFriction, getAggregatedFrictions, _testConstants} = helper;
        const threshold = _testConstants.PROBABILISTIC_EMIT_THRESHOLD;

        const friction = {
            model                   : 'gemma4-31b',
            symptom                 : 'parse-failure',
            emissionPoint           : 'post-invocation-failure',
            inputBytes              : 5000,
            modelContextLimit       : 40000,
            workflowUpdateSuggestion: 'Improve response shape',
            timestamp               : new Date().toISOString(),
            assetRef                : 'session:ghi',
            consumer                : 'gemma4-31b'
        };

        // Below threshold: do not surface
        for (let i = 1; i < threshold; i++) {
            emitConsumerFriction({...friction, timestamp: new Date().toISOString()});
        }
        expect(getAggregatedFrictions()).toHaveLength(0);

        // Threshold-th emission: surface
        emitConsumerFriction({...friction, timestamp: new Date().toISOString()});
        const surfaced = getAggregatedFrictions();
        expect(surfaced).toHaveLength(1);
        expect(surfaced[0].count).toBe(threshold);
    });

    test('emitConsumerFriction aggregates by (assetRef, consumer, symptom) tuple — different assetRefs do not collide', () => {
        const {emitConsumerFriction, getAggregatedFrictions, _testConstants} = helper;
        const threshold = _testConstants.PROBABILISTIC_EMIT_THRESHOLD;

        // Same symptom + consumer, different assetRef — independent tuples
        for (let i = 0; i < threshold; i++) {
            emitConsumerFriction({
                model                   : 'gemma4-31b',
                symptom                 : 'parse-failure',
                emissionPoint           : 'post-invocation-failure',
                inputBytes              : 5000,
                modelContextLimit       : 40000,
                workflowUpdateSuggestion: 'Improve response',
                timestamp               : new Date().toISOString(),
                assetRef                : 'session:tuple-a',
                consumer                : 'gemma4-31b'
            });
            emitConsumerFriction({
                model                   : 'gemma4-31b',
                symptom                 : 'parse-failure',
                emissionPoint           : 'post-invocation-failure',
                inputBytes              : 7000,
                modelContextLimit       : 40000,
                workflowUpdateSuggestion: 'Improve response',
                timestamp               : new Date().toISOString(),
                assetRef                : 'session:tuple-b',
                consumer                : 'gemma4-31b'
            });
        }

        const surfaced = getAggregatedFrictions();
        expect(surfaced).toHaveLength(2);
        expect(new Set(surfaced.map(s => s.friction.assetRef))).toEqual(new Set(['session:tuple-a', 'session:tuple-b']));
    });

    test('getAggregatedFrictions prunes entries past AGGREGATOR_TTL_MS', () => {
        const {emitConsumerFriction, getAggregatedFrictions, _testConstants} = helper;
        const ttl = _testConstants.AGGREGATOR_TTL_MS;

        // Emit a deterministic-symptom entry (surfaces immediately)
        emitConsumerFriction({
            model                   : 'gemma4-31b',
            symptom                 : 'size-precheck-skip',
            emissionPoint           : 'pre-invocation',
            inputBytes              : 100000,
            modelContextLimit       : 40000,
            safeProcessingLimit     : 32000,
            workflowUpdateSuggestion: 'Reduce payload',
            timestamp               : new Date().toISOString(),
            assetRef                : 'session:ttl',
            consumer                : 'gemma4-31b'
        });

        // Verify it surfaces NOW
        expect(getAggregatedFrictions({now: Date.now()})).toHaveLength(1);

        // Inject a future-clock past TTL — entry should be pruned
        const futureNow = Date.now() + ttl + 1000;
        expect(getAggregatedFrictions({now: futureNow})).toHaveLength(0);

        // Verify the prune was destructive — subsequent reads also see 0
        expect(getAggregatedFrictions({now: Date.now()})).toHaveLength(0);
    });

    test('invokeWithGuardrail Angle 2 — pre-check skips invocation when input exceeds safeProcessingLimit', async () => {
        const {invokeWithGuardrail, getAggregatedFrictions} = helper;

        let invoked = false;
        const result = await invokeWithGuardrail({
            invocationFn       : async () => { invoked = true; return 'should not run'; },
            inputPayload       : 'x'.repeat(50000),
            model              : 'gemma4-31b',
            assetRef           : 'session:precheck',
            modelContextLimit  : 40000,
            safeProcessingLimit: 30000
        });

        expect(invoked).toBe(false);
        expect(result.result).toBeNull();
        expect(result.friction).not.toBeNull();
        expect(result.friction.symptom).toBe('size-precheck-skip');
        expect(result.friction.emissionPoint).toBe('pre-invocation');
        expect(result.friction.inputBytes).toBe(50000);
        expect(result.friction.safeProcessingLimit).toBe(30000);

        // Verify the friction is in the aggregator (surfaced because deterministic)
        const surfaced = getAggregatedFrictions();
        expect(surfaced).toHaveLength(1);
    });

    test('invokeWithGuardrail Angle 2 — safeProcessingLimit defaults to 80% of modelContextLimit', async () => {
        const {invokeWithGuardrail} = helper;

        let invoked = false;
        // Input is 33000 bytes; modelContextLimit is 40000; default safe = 32000; input EXCEEDS safe
        const result = await invokeWithGuardrail({
            invocationFn      : async () => { invoked = true; return 'should not run'; },
            inputPayload      : 'x'.repeat(33000),
            model             : 'gemma4-31b',
            assetRef          : 'session:precheck-default',
            modelContextLimit : 40000
            // safeProcessingLimit omitted → uses 80% default = 32000
        });

        expect(invoked).toBe(false);
        expect(result.friction.symptom).toBe('size-precheck-skip');
        expect(result.friction.safeProcessingLimit).toBe(32000);
    });

    test('invokeWithGuardrail Angle 1 — success path returns result without friction', async () => {
        const {invokeWithGuardrail, getAggregatedFrictions} = helper;

        const result = await invokeWithGuardrail({
            invocationFn     : async () => ({content: 'ok', model: 'gemma4-31b'}),
            inputPayload     : 'small input',
            model            : 'gemma4-31b',
            assetRef         : 'session:success',
            modelContextLimit: 40000
        });

        expect(result.result).toEqual({content: 'ok', model: 'gemma4-31b'});
        expect(result.friction).toBeNull();
        expect(getAggregatedFrictions()).toHaveLength(0);
    });

    test('invokeWithGuardrail Angle 1 — failure path categorizes error + emits friction', async () => {
        const {invokeWithGuardrail, getAggregatedFrictions, _testConstants} = helper;
        const threshold = _testConstants.PROBABILISTIC_EMIT_THRESHOLD;

        // Probabilistic symptom (parse-failure) — need to fire threshold times to surface
        for (let i = 0; i < threshold; i++) {
            const result = await invokeWithGuardrail({
                invocationFn     : async () => { throw new Error('Malformed JSON response'); },
                inputPayload     : 'small input',
                model            : 'gemma4-31b',
                assetRef         : 'session:fail-parse',
                modelContextLimit: 40000
            });
            expect(result.result).toBeNull();
            expect(result.friction).not.toBeNull();
            expect(result.friction.symptom).toBe('parse-failure');
            expect(result.friction.emissionPoint).toBe('post-invocation-failure');
        }

        const surfaced = getAggregatedFrictions();
        expect(surfaced).toHaveLength(1);
        expect(surfaced[0].count).toBe(threshold);
    });

    test('invokeWithGuardrail Angle 1 — context-overflow error surfaces immediately (deterministic)', async () => {
        const {invokeWithGuardrail, getAggregatedFrictions} = helper;

        const result = await invokeWithGuardrail({
            invocationFn     : async () => { throw new Error('Context window exceeded'); },
            inputPayload     : 'medium input',
            model            : 'gemma4-31b',
            assetRef         : 'session:fail-overflow',
            modelContextLimit: 40000
        });

        expect(result.friction.symptom).toBe('context-overflow');
        // Deterministic symptom — surfaces on first occurrence
        expect(getAggregatedFrictions()).toHaveLength(1);
    });

    test('invokeWithGuardrail honors caller-provided workflowUpdateHint', async () => {
        const {invokeWithGuardrail} = helper;

        const result = await invokeWithGuardrail({
            invocationFn      : async () => { throw new Error('JSON malformed'); },
            inputPayload      : 'tiny',
            model             : 'gemma4-31b',
            assetRef          : 'session:hint',
            modelContextLimit : 40000,
            workflowUpdateHint: 'Switch to qwen3-8b for stricter JSON output.'
        });

        expect(result.friction.workflowUpdateSuggestion).toBe('Switch to qwen3-8b for stricter JSON output.');
    });

    test('renderConsumerFrictionSection returns empty string when no frictions surface', () => {
        const {renderConsumerFrictionSection} = helper;
        expect(renderConsumerFrictionSection()).toBe('');
    });

    test('renderConsumerFrictionSection emits structured Markdown when frictions are surfaced', () => {
        const {emitConsumerFriction, renderConsumerFrictionSection} = helper;

        emitConsumerFriction({
            model                   : 'gemma4-31b',
            symptom                 : 'size-precheck-skip',
            emissionPoint           : 'pre-invocation',
            inputBytes              : 100000,
            modelContextLimit       : 40000,
            safeProcessingLimit     : 32000,
            workflowUpdateSuggestion: 'Reduce payload below 32000 bytes',
            timestamp               : new Date().toISOString(),
            assetRef                : 'session:render',
            consumer                : 'gemma4-31b'
        });

        const section = renderConsumerFrictionSection();

        expect(section).toContain('### 🧠 Substrate-Consumer Friction');
        expect(section).toContain('**size-precheck-skip**');
        expect(section).toContain('`gemma4-31b`');
        expect(section).toContain('`session:render`');
        expect(section).toContain('100000 bytes');
        expect(section).toContain('safe 32000');
        expect(section).toContain('Reduce payload below 32000 bytes');
    });

    test('renderConsumerFrictionSection groups multiple symptoms', () => {
        const {emitConsumerFriction, renderConsumerFrictionSection, _testConstants} = helper;
        const threshold = _testConstants.PROBABILISTIC_EMIT_THRESHOLD;

        // Surface a context-overflow (deterministic, surfaces immediately)
        emitConsumerFriction({
            model                   : 'gemma4-31b',
            symptom                 : 'context-overflow',
            emissionPoint           : 'post-invocation-failure',
            inputBytes              : 50000,
            modelContextLimit       : 40000,
            workflowUpdateSuggestion: 'Reduce',
            timestamp               : new Date().toISOString(),
            assetRef                : 'session:overflow-1',
            consumer                : 'gemma4-31b'
        });

        // Surface a parse-failure (probabilistic, need threshold emissions)
        for (let i = 0; i < threshold; i++) {
            emitConsumerFriction({
                model                   : 'qwen3-8b',
                symptom                 : 'parse-failure',
                emissionPoint           : 'post-invocation-failure',
                inputBytes              : 8000,
                modelContextLimit       : 40000,
                workflowUpdateSuggestion: 'Switch JSON parser',
                timestamp               : new Date().toISOString(),
                assetRef                : 'session:parse-1',
                consumer                : 'qwen3-8b'
            });
        }

        const section = renderConsumerFrictionSection();

        expect(section).toContain('**context-overflow**');
        expect(section).toContain('**parse-failure**');
        expect(section).toContain('`gemma4-31b`');
        expect(section).toContain('`qwen3-8b`');
    });
});
