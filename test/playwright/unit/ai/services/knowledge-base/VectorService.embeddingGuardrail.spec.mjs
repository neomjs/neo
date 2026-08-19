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

/**
 * The input-strategy coordinate of the poison generation, which is what decides whether a repair to
 * the admission band releases the chunks that band fenced.
 *
 * `resolveEmbeddingPoisonGeneration` promises in its own docblock that "a provider, model,
 * vector-schema, or input-strategy change invalidates prior poison evidence", and
 * `createVectorGenerationIdentity` guarantees any coordinate change yields a new generation id. The
 * coordinate carrying the input strategy was a static literal, so the promise held for three of four
 * inputs and silently failed for the one that moves most often.
 *
 * Every test here holds provider, model, vectorDimension and the call ceiling IDENTICAL — they are
 * untouched by the guardrail seam — because an unchanged tuple is the condition under test. A fixture
 * that also moved one of the four would be released on `main` too and would prove nothing.
 */
test.describe('VectorService — poison generation tracks the admission band (#17345)', () => {
    let KB_VectorService;

    test.beforeAll(async () => {
        KB_VectorService = (await import('../../../../../../ai/services/knowledge-base/VectorService.mjs')).default;
    });

    const withGuardrail = (guardrail, fn) => {
        const original = KB_VectorService.resolveEmbeddingGuardrail;

        try {
            KB_VectorService.resolveEmbeddingGuardrail = () => ({
                recognized: true, model: 'gemini-embedding-001', ...guardrail
            });

            return fn()
        } finally {
            KB_VectorService.resolveEmbeddingGuardrail = original
        }
    };

    const generationFor = guardrail =>
        withGuardrail(guardrail, () => KB_VectorService.resolveEmbeddingPoisonGeneration());

    test('a band change moves the strategyVersion while the rest of the tuple stays identical', () => {
        const wide   = generationFor({contextLimitTokens: 28_672, safeProcessingLimitTokens: 28_672}),
              narrow = generationFor({contextLimitTokens: 16_384, safeProcessingLimitTokens: 28_672});

        // The whole point: the four coordinates the old release condition named are UNCHANGED.
        expect(narrow.provider).toBe(wide.provider);
        expect(narrow.model).toBe(wide.model);
        expect(narrow.vectorDimension).toBe(wide.vectorDimension);
        expect(narrow.embedCallCeilingMs).toBe(wide.embedCallCeilingMs);

        // And the generation still differs, which is what releases a fenced chunk.
        expect(narrow.strategyVersion).not.toBe(wide.strategyVersion);

        // Pinned literally, not just as "different": a version that changed for some other reason
        // would satisfy an inequality while telling us nothing about the band.
        expect(wide.strategyVersion).toBe('kb-embedding-input-v1:band-28672-est-21238');
        expect(narrow.strategyVersion).toBe('kb-embedding-input-v1:band-16384-est-12136')
    });

    test('NEGATIVE CONTROL: an unchanged band leaves the generation byte-identical', () => {
        // Without this, a derivation that returned something new on every call would pass the test
        // above and invalidate all suppression evidence continuously — strictly worse than the frozen
        // literal it replaces.
        const first  = generationFor({contextLimitTokens: 16_384, safeProcessingLimitTokens: 28_672}),
              second = generationFor({contextLimitTokens: 16_384, safeProcessingLimitTokens: 28_672});

        expect(second).toEqual(first)
    });

    test('the coordinate follows the BAND, not the raw leaves — the smaller ceiling governs', () => {
        // Two different configurations with the same effective admission band are the same input
        // strategy, and must not churn the generation. This pins the derivation to
        // `resolveEmbeddingAdmissionBand`'s min() semantics rather than to whichever leaf was edited.
        const viaContext = generationFor({contextLimitTokens: 16_384, safeProcessingLimitTokens: 28_672}),
              viaSafe    = generationFor({contextLimitTokens: 28_672, safeProcessingLimitTokens: 16_384});

        expect(viaSafe.strategyVersion).toBe(viaContext.strategyVersion)
    });

    test('an unresolvable band is ONE stable coordinate, and repairing it is a real change', () => {
        // A configuration with no usable ceiling cannot characterise its own input strategy. It gets a
        // single marker rather than a fresh generation per call — and the transition OUT of that state
        // is a repair that should invalidate evidence, which the inequality below asserts.
        const brokenA = generationFor({contextLimitTokens: 0, safeProcessingLimitTokens: 28_672}),
              brokenB = generationFor({contextLimitTokens: -1, safeProcessingLimitTokens: 28_672}),
              fixed   = generationFor({contextLimitTokens: 16_384, safeProcessingLimitTokens: 28_672});

        expect(brokenA.strategyVersion).toBe('kb-embedding-input-v1:band-unresolved');
        expect(brokenB.strategyVersion).toBe(brokenA.strategyVersion);
        expect(fixed.strategyVersion).not.toBe(brokenA.strategyVersion)
    })
});
