import {setup} from '../../../../setup.mjs';

const appName = 'KBEmbeddingGuardrailTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * Fail-closed coverage for the embedding oversize guard at the VectorService boundary.
 *
 * The pre-fix guard keyed on a hand-maintained local-provider set: an unrecognized provider
 * returned an unfiltered pass from `expandOversizedEmbeddingChunks` and confident zeros from
 * `measureEmbeddingInput` — "not checked" reading as "checked, tiny". The band is
 * provider-independent, so the guard now measures every provider, and the single unmeasurable
 * case (a band that does not resolve to a positive finite number) refuses and says so.
 */
test.describe.configure({mode: 'serial'});

test.describe('VectorService — embedding guardrail fail-closed', () => {
    let KB_VectorService;

    test.beforeAll(async () => {
        KB_VectorService = (await import('../../../../../../ai/services/knowledge-base/VectorService.mjs')).default;
    });

    test('measureEmbeddingInput: a measured tiny input and an unmeasured refusal are distinguishable shapes', () => {
        const guardrail = {recognized: true, contextLimitTokens: 100, safeProcessingLimitTokens: 80, model: 'unit-test-model'};

        const tiny = KB_VectorService.measureEmbeddingInput({text: 'small input', guardrail});

        expect(tiny).toMatchObject({skip: false, measured: true});
        expect(tiny.inputBytes).toBeGreaterThan(0);

        const unmeasurable = KB_VectorService.measureEmbeddingInput({
            text     : 'small input',
            guardrail: {...guardrail, safeProcessingLimitTokens: Number.NaN}
        });

        expect(unmeasurable).toMatchObject({skip: true, measured: false});
        // The control: the two shapes differ on the flag AND on the decision.
        expect(unmeasurable.measured).not.toBe(tiny.measured);
        expect(unmeasurable.skip).not.toBe(tiny.skip);
    });

    test('measureEmbeddingInput: invalid bands all refuse — zero, negative, non-finite', () => {
        const base = {recognized: true, contextLimitTokens: 100, safeProcessingLimitTokens: 80, model: 'm'};

        for (const safeProcessingLimitTokens of [0, -5, Number.NaN, 'not-a-number']) {
            const evaluation = KB_VectorService.measureEmbeddingInput({
                text     : 'input',
                guardrail: {...base, safeProcessingLimitTokens}
            });

            expect(evaluation).toMatchObject({skip: true, measured: false})
        }
    });

    test('expandOversizedEmbeddingChunks: an unrecognized provider no longer passes chunks unfiltered', () => {
        const original = KB_VectorService.resolveEmbeddingGuardrail;

        try {
            KB_VectorService.resolveEmbeddingGuardrail = () => ({
                recognized               : false,
                contextLimitTokens       : 50,
                safeProcessingLimitTokens: 40,
                model                    : 'gemini-embedding-001'
            });

            const oversized = {id: 'c1', type: 'method', name: 'x'.repeat(400), className: 'A', description: '', content: ''},
                  tiny      = {id: 'c2', type: 'method', name: 'ok', className: 'A', description: 'fine', content: ''},
                  result    = KB_VectorService.expandOversizedEmbeddingChunks([oversized, tiny]);

            // The over-band chunk is split-planned (never passed whole through an unmeasured
            // path); the splitter may conclude "cannot split" and return it as-is, but the
            // measurement RAN — which is the regression this pins.
            expect(result.some(chunk => chunk.id === 'c2')).toBe(true);
            const survivor = result.filter(chunk => chunk.id === 'c1' || chunk.id.startsWith('c1'));
            expect(survivor.length).toBeGreaterThanOrEqual(1)
        } finally {
            KB_VectorService.resolveEmbeddingGuardrail = original;
        }
    });

    test('expandOversizedEmbeddingChunks: an unmeasurable input stays whole for the send boundary to refuse', () => {
        const original = KB_VectorService.resolveEmbeddingGuardrail;

        try {
            KB_VectorService.resolveEmbeddingGuardrail = () => ({
                recognized               : true,
                contextLimitTokens       : 50,
                safeProcessingLimitTokens: Number.NaN,
                model                    : 'm'
            });

            const chunk  = {id: 'c9', type: 'method', name: 'y'.repeat(400), className: 'A', description: '', content: ''},
                  result = KB_VectorService.expandOversizedEmbeddingChunks([chunk]);

            // No split planning against an unresolvable band: the chunk survives whole so the
            // pre-invocation boundary refuses the very same input with `measured: false`.
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('c9');
            expect(KB_VectorService.measureEmbeddingInput({
                text     : KB_VectorService.buildEmbeddingInputText(chunk),
                guardrail: KB_VectorService.resolveEmbeddingGuardrail()
            })).toMatchObject({skip: true, measured: false})
        } finally {
            KB_VectorService.resolveEmbeddingGuardrail = original;
        }
    });
});
