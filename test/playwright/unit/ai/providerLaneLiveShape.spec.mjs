import {setup} from '../../setup.mjs';

const appName = 'ProviderLaneLiveShapeTest';

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
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import {
    classifyProviderLaneLiveShape,
    parseEmbeddingLaneSlots,
    PROVIDER_LANE_DECLARATION,
    PROVIDER_LANE_SHAPE_MISMATCH,
    PROVIDER_LANE_SHAPE_UNOBSERVABLE
}                     from '../../../../ai/providerLaneLiveShape.mjs';

/**
 * Boot-time provider-lane shape observation.
 *
 * A vendored Compose substitutes the canonical `${…:?}` placeholders with literals, so the
 * fail-closed guard never runs and the engine reports healthy on whatever shape it was given.
 * This module supplies the missing comparison — and its correctness is mostly about which
 * comparisons it declines to make.
 *
 * The contract under test, per @neo-opus-vega on the ticket: the DECLARED arm fires only against an
 * explicit declaration and records `not-declared` otherwise, while the safe-band FLOOR arm always
 * runs. The consumption-namespace leaves (`localModels.embedding.*`) are contractually never a
 * comparison authority because they carry non-null operational defaults.
 */

/** The canonical embedding lane: 4 slots × 32,768 tokens, which holds a 28,672-token safe-band input. */
const BAND       = 28672,
      HEALTHY    = [{n_ctx: 32768}, {n_ctx: 32768}, {n_ctx: 32768}, {n_ctx: 32768}],
      UNDERSIZED = [{n_ctx: 8192}, {n_ctx: 8192}, {n_ctx: 8192}, {n_ctx: 8192}];

test.describe('Neo.ai.providerLaneLiveShape — parser', () => {
    test('reads a uniform lane into {parallelism, contextTokensPerSlot}', () => {
        expect(parseEmbeddingLaneSlots(HEALTHY)).toEqual({
            observable          : true,
            parallelism         : 4,
            contextTokensPerSlot: 32768
        })
    });

    test('a non-array, empty, or non-uniform payload is unobservable rather than guessed', () => {
        // Each of these could be "salvaged" by inferring a shape from part of the payload. That
        // inference is the silent wrong answer this check exists to replace, so all three refuse.
        expect(parseEmbeddingLaneSlots(null).reason).toBe(PROVIDER_LANE_SHAPE_UNOBSERVABLE.notAnArray);
        expect(parseEmbeddingLaneSlots({slots: HEALTHY}).reason).toBe(PROVIDER_LANE_SHAPE_UNOBSERVABLE.notAnArray);
        expect(parseEmbeddingLaneSlots([]).reason).toBe(PROVIDER_LANE_SHAPE_UNOBSERVABLE.empty);
        expect(parseEmbeddingLaneSlots([{n_ctx: 32768}, {n_ctx: 8192}]).reason)
            .toBe(PROVIDER_LANE_SHAPE_UNOBSERVABLE.nonUniformSlots)
    });

    test('a slot whose n_ctx is absent, zero, negative or non-integer is unobservable', () => {
        [undefined, null, 0, -1, 1.5, '32768', {}].forEach(value => {
            expect(parseEmbeddingLaneSlots([{n_ctx: 32768}, {n_ctx: value}]).reason)
                .toBe(PROVIDER_LANE_SHAPE_UNOBSERVABLE.invalidContext)
        })
    });

    test('never throws — an unreadable lane at boot must not become a restart lever', () => {
        // The election runner's `observeLaneContext` raises EMBEDDING_CONTEXT_UNAVAILABLE, which suits
        // a benchmark that should abort. At orchestrator boot an exception degrades container
        // liveness into a restart. Positive control: the pre-existing expression DOES throw.
        expect(() => { throw Object.assign(new Error('x'), {code: 'EMBEDDING_CONTEXT_UNAVAILABLE'}) }).toThrow();

        [null, undefined, [], {}, 'slots', 0, [{}], [{n_ctx: NaN}]].forEach(payload => {
            expect(() => parseEmbeddingLaneSlots(payload)).not.toThrow()
        })
    });
});

test.describe('Neo.ai.providerLaneLiveShape — the declared arm fires only on explicit declarations', () => {
    test('a correctly-sized lane that declared NOTHING is clean, not degraded', () => {
        const receipt = classifyProviderLaneLiveShape({
            observed                 : parseEmbeddingLaneSlots(HEALTHY),
            safeProcessingLimitTokens: BAND
        });

        expect(receipt.degraded).toBe(false);
        expect(receipt.reasons).toEqual([]);
        expect(receipt.declaration).toBe(PROVIDER_LANE_DECLARATION.notDeclared);
        expect(receipt.declared).toEqual({parallelSlots: null, contextTokensPerSlot: null})
    });

    test('THE REGRESSION: the same lane compared against consumption-leaf DEFAULTS degrades', () => {
        // This is the false positive the contract exists to prevent, pinned so a future refactor that
        // "simplifies" by reading `localModels.embedding.*` fails here instead of in a deployment.
        // 1 is the shipped default of `localModels.embedding.parallel` — chosen for LM Studio
        // residency, and matching essentially no real multi-slot lane.
        const receipt = classifyProviderLaneLiveShape({
            observed                    : parseEmbeddingLaneSlots(HEALTHY),
            safeProcessingLimitTokens   : BAND,
            declaredParallelSlots       : 1,
            declaredContextTokensPerSlot: 32768
        });

        expect(receipt.degraded).toBe(true);
        expect(receipt.reasons).toContain(PROVIDER_LANE_SHAPE_MISMATCH.slotCountMismatch)
    });

    test('an explicit matching declaration is clean and records `declared`', () => {
        const receipt = classifyProviderLaneLiveShape({
            observed                    : parseEmbeddingLaneSlots(HEALTHY),
            safeProcessingLimitTokens   : BAND,
            declaredParallelSlots       : 4,
            declaredContextTokensPerSlot: 32768
        });

        expect(receipt.degraded).toBe(false);
        expect(receipt.declaration).toBe(PROVIDER_LANE_DECLARATION.declared)
    });

    test('an explicit MISMATCHING declaration names which condition fired and both numbers', () => {
        const receipt = classifyProviderLaneLiveShape({
            observed                    : parseEmbeddingLaneSlots(HEALTHY),
            safeProcessingLimitTokens   : BAND,
            declaredParallelSlots       : 4,
            declaredContextTokensPerSlot: 65536
        });

        expect(receipt.reasons).toEqual([PROVIDER_LANE_SHAPE_MISMATCH.contextMismatch]);
        expect(receipt.observed.contextTokensPerSlot).toBe(32768);
        expect(receipt.declared.contextTokensPerSlot).toBe(65536)
    });

    test('a malformed declaration reads as not-declared rather than degrading a healthy lane', () => {
        // Failing toward silence is deliberate: degrading a live lane because its DECLARATION was
        // unreadable reports the fault on the wrong side of the comparison.
        [0, -4, 'four', NaN, 1.5, ''].forEach(value => {
            const receipt = classifyProviderLaneLiveShape({
                observed                 : parseEmbeddingLaneSlots(HEALTHY),
                safeProcessingLimitTokens: BAND,
                declaredParallelSlots    : value
            });

            expect(receipt.declaration).toBe(PROVIDER_LANE_DECLARATION.notDeclared);
            expect(receipt.degraded).toBe(false)
        })
    });
});

test.describe('Neo.ai.providerLaneLiveShape — the floor arm needs no declaration', () => {
    test('an undersized lane degrades even when NOTHING was declared', () => {
        // The load-bearing pair with the first test above: dropping the default-comparison must not
        // cost the safety property. Same undeclared state, opposite verdict, because the floor
        // depends on the band rather than on the operator having said anything.
        const receipt = classifyProviderLaneLiveShape({
            observed                 : parseEmbeddingLaneSlots(UNDERSIZED),
            safeProcessingLimitTokens: BAND
        });

        expect(receipt.degraded).toBe(true);
        expect(receipt.reasons).toContain(PROVIDER_LANE_SHAPE_MISMATCH.belowSafeBand);
        expect(receipt.declaration).toBe(PROVIDER_LANE_DECLARATION.notDeclared);
        expect(receipt.observed.contextTokensPerSlot).toBe(8192);
        expect(receipt.safeProcessingLimitTokens).toBe(BAND)
    });

    test('both arms can fire together and each is named', () => {
        const receipt = classifyProviderLaneLiveShape({
            observed                    : parseEmbeddingLaneSlots(UNDERSIZED),
            safeProcessingLimitTokens   : BAND,
            declaredParallelSlots       : 4,
            declaredContextTokensPerSlot: 32768
        });

        expect(receipt.reasons).toContain(PROVIDER_LANE_SHAPE_MISMATCH.belowSafeBand);
        expect(receipt.reasons).toContain(PROVIDER_LANE_SHAPE_MISMATCH.contextMismatch)
    });

    test('an unobservable lane is neither healthy nor degraded, and says why', () => {
        const receipt = classifyProviderLaneLiveShape({
            observed                 : parseEmbeddingLaneSlots('not-a-payload'),
            safeProcessingLimitTokens: BAND
        });

        expect(receipt.observable).toBe(false);
        expect(receipt.degraded).toBe(false);
        expect(receipt.unobservable).toBe(PROVIDER_LANE_SHAPE_UNOBSERVABLE.notAnArray);
        expect(receipt.observed).toEqual({parallelism: null, contextTokensPerSlot: null})
    });
});

test.describe('Neo.ai.configBase — the declaration leaves resolve null when undeclared', () => {
    test('an undeclared lane resolves BOTH declaration leaves to null', async () => {
        // First null-numeric leaves in the tree, so their resolution is proven rather than assumed.
        // `null` is what makes `not-declared` a property of the deployment instead of a heuristic.
        const AiConfig = (await import('../../../../ai/config.template.mjs')).default;

        expect(AiConfig.providerLaneDeclaration.embedding.parallelSlots).toBeNull();
        expect(AiConfig.providerLaneDeclaration.embedding.contextTokensPerSlot).toBeNull()
    });

    test('the consumption leaves carry the non-null defaults that must never be a comparison authority', async () => {
        // Pins WHY the declaration subtree exists. If these ever became null-defaulting, the
        // separation would be redundant — and if `parallel` ever changed away from 1, the regression
        // test above would silently stop reproducing the false positive it guards.
        const AiConfig = (await import('../../../../ai/config.template.mjs')).default;

        expect(AiConfig.localModels.embedding.parallel).toBe(1);
        expect(AiConfig.localModels.embedding.safeProcessingLimitTokens).toBe(BAND)
    });
});
