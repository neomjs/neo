import {setup} from '../../../../setup.mjs';

const appName = 'KBEmbeddingAdmissionBandTest';

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
 * Admission-band coverage: an embedding input is admitted against the SMALLER of the engine's
 * per-slot ceiling and the safe-processing band, compared in estimate space.
 *
 * The oversize splitter measures every provider and cuts correctly. It could still fail to fire on a
 * deployment whose engine slot is narrower than the safe band, because the three admission sites
 * compared a `bytes/3` ESTIMATE against the safe band alone (28,672) while the engine refuses above
 * its per-slot ceiling (16,384). Two faults stacked: the wrong ceiling, and a comparison across two
 * different units.
 *
 * The band gap is the region under test. A fixture above 28,672 estimated tokens splits on `main`
 * already and proves nothing — every case here sits BETWEEN the two ceilings, where pre-fix code
 * admits and the provider refuses.
 *
 * Measured inputs: against the Qwen3 embedding tokenizer over generated-TypeScript declaration
 * headers, `actual / estimate` ranged 0.80 – 1.28 across the ten largest units. The two chunks that
 * the affected deployment could not embed measured 14,923 and 13,047 estimated tokens (17,197 and
 * 16,726 actual) — both under the 28,672 band, both over the 16,384 slot.
 */
test.describe.configure({mode: 'serial'});

test.describe('VectorService — embedding admission band (#17343)', () => {
    let KB_VectorService, resolveEmbeddingAdmissionBand, EMBEDDING_TOKEN_ESTIMATE_DRIFT_FACTOR;

    // The affected deployment's geometry: a 16,384-token engine slot under the shipped 28,672 band.
    const narrowSlotGuardrail = {
        recognized               : true,
        contextLimitTokens       : 16384,
        safeProcessingLimitTokens: 28672,
        model                    : 'unit-test-embedding-model'
    };

    /** Builds a text whose `bytes/3` estimate is the requested token count. */
    const textOfEstimatedTokens = tokens => 'x'.repeat(tokens * 3);

    test.beforeAll(async () => {
        KB_VectorService = (await import('../../../../../../ai/services/knowledge-base/VectorService.mjs')).default;

        ({resolveEmbeddingAdmissionBand, EMBEDDING_TOKEN_ESTIMATE_DRIFT_FACTOR} =
            await import('../../../../../../ai/embeddingSafeBand.mjs'));
    });

    test('RED-PROOF: an input between the engine slot and the safe band is refused, not admitted', () => {
        // 14,923 estimated tokens — the larger of the two chunks the deployment could not embed.
        // Pre-fix this compared 14,923 > 28,672 => false => admitted => provider HTTP 400.
        const evaluation = KB_VectorService.measureEmbeddingInput({
            text     : textOfEstimatedTokens(14923),
            guardrail: narrowSlotGuardrail
        });

        expect(evaluation.measured).toBe(true);
        expect(evaluation.skip, 'an input over the engine slot must not be admitted').toBe(true);

        // The band is derived from the SMALLER ceiling, not the safe band.
        expect(evaluation.admissionCeilingTokens).toBe(16384);
        expect(evaluation.estimateBandTokens).toBeLessThan(16384);

        // The control that makes the assertion mean something: under the pre-fix rule this same
        // input passes. If this ever fails, the fixture stopped exercising the band gap.
        expect(evaluation.inputTokensEstimate).toBeLessThan(narrowSlotGuardrail.safeProcessingLimitTokens);
    });

    test('CONTROL: an input comfortably inside the engine slot is still admitted', () => {
        // 4,096 estimated tokens => ~5,243 actual at the measured 1.28 worst case, well under 16,384.
        const evaluation = KB_VectorService.measureEmbeddingInput({
            text     : textOfEstimatedTokens(4096),
            guardrail: narrowSlotGuardrail
        });

        expect(evaluation).toMatchObject({skip: false, measured: true});
    });

    test('the drift factor covers the measured worst case, so a band-legal input stays under the ceiling', () => {
        const {estimateBandTokens, admissionCeilingTokens} = resolveEmbeddingAdmissionBand(narrowSlotGuardrail),
              measuredWorstCaseRatio                       = 1.28;

        expect(EMBEDDING_TOKEN_ESTIMATE_DRIFT_FACTOR).toBeGreaterThanOrEqual(measuredWorstCaseRatio);

        // The property the factor exists for: the largest admissible ESTIMATE, expanded by the worst
        // observed drift, still fits the REAL ceiling. This is the assertion that would catch someone
        // lowering the factor to buy throughput.
        expect(estimateBandTokens * measuredWorstCaseRatio).toBeLessThanOrEqual(admissionCeilingTokens);
    });

    test('the splitter cuts to the SAME band the measurement refused against', () => {
        const chunk = {
            id     : 'admission-band-chunk', type: 'doc', name: 'oversized', className: '',
            content: textOfEstimatedTokens(14923)
        };

        const parts = KB_VectorService.splitOversizedEmbeddingChunk({chunk, guardrail: narrowSlotGuardrail});

        expect(parts.length, 'an over-ceiling chunk must actually split').toBeGreaterThan(1);

        // Every part must now pass the same gate that refused the parent. Cutting to a different
        // band than the measurement used is how a "fixed" splitter silently re-refuses its own output.
        for (const part of parts) {
            const evaluation = KB_VectorService.measureEmbeddingInput({
                text     : KB_VectorService.buildEmbeddingInputText ? KB_VectorService.buildEmbeddingInputText(part) : part.content,
                guardrail: narrowSlotGuardrail
            });

            expect(evaluation.skip, `part ${part.oversizedSplitIndex} still exceeds the band`).toBe(false);
        }
    });

    test('a DECLARED-but-invalid ceiling refuses; an ABSENT one lets its sibling govern', () => {
        // Absent is not a defect: a deployment that never set the engine slot is governed by the band.
        const absent = resolveEmbeddingAdmissionBand({safeProcessingLimitTokens: 28672});

        expect(absent.resolved).toBe(true);
        expect(absent.admissionCeilingTokens).toBe(28672);

        // Declared-but-invalid IS a defect, and the sibling must not rescue it — otherwise
        // "cannot check" reads as "checked, tiny", the reading this boundary's guard exists to refuse.
        for (const invalid of [Number.NaN, 0, -1]) {
            expect(
                resolveEmbeddingAdmissionBand({contextLimitTokens: 16384, safeProcessingLimitTokens: invalid}).resolved,
                `safeProcessingLimitTokens=${invalid} must not be rescued by a valid slot`
            ).toBe(false);

            expect(
                resolveEmbeddingAdmissionBand({contextLimitTokens: invalid, safeProcessingLimitTokens: 28672}).resolved,
                `contextLimitTokens=${invalid} must not be rescued by a valid band`
            ).toBe(false);
        }
    });

    test('an unresolvable band REFUSES to split rather than cutting to the sibling ceiling', () => {
        // The defect this covers: the splitter previously fell back to safeProcessingLimitTokens
        // when the band did not resolve, so a declared-invalid ceiling cut against the very band
        // admission had stopped trusting — silently shipping parts nobody validated.
        const chunk = {
            id     : 'unresolvable-band-chunk', type: 'doc', name: 'oversized', className: '',
            content: textOfEstimatedTokens(14923)
        };

        for (const invalid of [Number.NaN, 0, -1]) {
            const parts = KB_VectorService.splitOversizedEmbeddingChunk({
                chunk,
                guardrail: {...narrowSlotGuardrail, safeProcessingLimitTokens: invalid}
            });

            expect(parts, `safeProcessingLimitTokens=${invalid} must not plan a split`).toHaveLength(1);
            expect(parts[0].oversizedSplit, 'the chunk must come back whole and unmarked').toBeUndefined();
        }
    });

    test('the shipped default geometry is unchanged — the safe band still governs a 32,768 slot', () => {
        // Regression fence: this change must not narrow deployments that were already correct.
        const {admissionCeilingTokens} = resolveEmbeddingAdmissionBand({
            contextLimitTokens       : 32768,
            safeProcessingLimitTokens: 28672
        });

        expect(admissionCeilingTokens).toBe(28672);
    });
});
