import {setup} from '../../setup.mjs';

const appName = 'EmbeddingServiceabilityTest';

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
    classifyEmbeddingAdmission,
    EMBEDDING_ADMISSION,
    resolveServiceabilityCeilingTokens
}                     from '../../../../ai/embeddingServiceability.mjs';

/**
 * Admission by serviceability rather than slot fit.
 *
 * The guardrail admits anything that fits the engine slot, but fit is a property of the slot and
 * deliverability is a property of the lane. On a slow lane a slot-legal chunk needs minutes of service
 * time against a seconds-long enforced clock: admitted, ground on, abandoned, re-submitted. Every
 * component behaves correctly and the work never lands.
 *
 * The numbers below are the observed constrained-lane case: ~26 tok/s against the shipped 300s
 * per-request clock, with a 28,672 safe band. They are used because a hand-picked pair can be made to
 * prove anything — this one is known to have produced the defect.
 */
const RATE     = 26,
      DEADLINE = 300_000,
      SLOT     = 28672,
      /** Slot-legal by a wide margin, and ~352s of service — outside the clock it runs under. */
      UNDELIVERABLE_TOKENS = 9144;

test.describe('Neo.ai.embeddingServiceability — the ceiling', () => {
    test('derives tokens from rate x deadline x margin', () => {
        // 26 tok/s over 300s at 0.8 margin = 6240. Asserted as a number rather than recomputed from
        // the same expression, so a change to the formula fails here instead of agreeing with itself.
        expect(resolveServiceabilityCeilingTokens({declaredTokensPerSecond: RATE, deadlineMs: DEADLINE})).toBe(6240)
    });

    test('an UNDECLARED rate yields no opinion — never a fabricated default', () => {
        // The load-bearing default. A ceiling invented for a plane that declared nothing would refuse
        // legal work, and a false refusal is silent where grind is at least visible.
        [null, undefined, ''].forEach(value => {
            expect(resolveServiceabilityCeilingTokens({declaredTokensPerSecond: value, deadlineMs: DEADLINE})).toBeNull()
        })
    });

    test('a malformed or non-positive rate reads as undeclared, not as a lane that serves nothing', () => {
        // A declared 0 is a mis-stated value, not a lane with zero throughput. Treating it literally
        // would refuse every chunk on a typo.
        [0, -26, NaN, Infinity, 'twenty-six', {}].forEach(value => {
            expect(resolveServiceabilityCeilingTokens({declaredTokensPerSecond: value, deadlineMs: DEADLINE})).toBeNull()
        })
    });

    test('a non-positive deadline or out-of-range margin throws rather than inventing a ceiling', () => {
        expect(() => resolveServiceabilityCeilingTokens({declaredTokensPerSecond: RATE, deadlineMs: 0})).toThrow(/positive deadline/);
        expect(() => resolveServiceabilityCeilingTokens({declaredTokensPerSecond: RATE, deadlineMs: DEADLINE, marginFactor: 0})).toThrow(/margin/);
        expect(() => resolveServiceabilityCeilingTokens({declaredTokensPerSecond: RATE, deadlineMs: DEADLINE, marginFactor: 1.5})).toThrow(/margin/)
    });

    test('the margin leaves real headroom under the clock', () => {
        // A ceiling at the raw product is wrong exactly at the boundary, and wrong there costs a whole
        // request: queueing, tokenizer drift, and a request finishing ON the deadline still loses.
        const ceiling = resolveServiceabilityCeilingTokens({declaredTokensPerSecond: RATE, deadlineMs: DEADLINE});

        expect((ceiling / RATE) * 1000).toBeLessThan(DEADLINE)
    });
});

test.describe('Neo.ai.embeddingServiceability — admission', () => {
    const ceiling = resolveServiceabilityCeilingTokens({declaredTokensPerSecond: RATE, deadlineMs: DEADLINE});

    test('THE DEFECT: a slot-legal chunk that cannot be delivered is refused, and says which ceiling it failed', () => {
        const verdict = classifyEmbeddingAdmission({
            tokens                     : UNDELIVERABLE_TOKENS,
            slotCeilingTokens          : SLOT,
            serviceabilityCeilingTokens: ceiling
        });

        // Slot-legal by a factor of three, and still inadmissible.
        expect(UNDELIVERABLE_TOKENS).toBeLessThan(SLOT);
        expect(verdict.admissible).toBe(false);
        expect(verdict.reason).toBe(EMBEDDING_ADMISSION.exceedsService);
        expect(verdict.serviceabilityCeilingTokens).toBe(ceiling)
    });

    test('THE NEGATIVE CONTROL: the same chunk on an UNDECLARED lane is admitted exactly as today', () => {
        // Not in the ticket's four cells, and the one that matters most: every listed cell assumes a
        // declared rate, so a regression that fabricates a default ceiling would pass all four while
        // silently refusing legal work on every plane that declared nothing.
        const verdict = classifyEmbeddingAdmission({
            tokens                     : UNDELIVERABLE_TOKENS,
            slotCeilingTokens          : SLOT,
            serviceabilityCeilingTokens: resolveServiceabilityCeilingTokens({declaredTokensPerSecond: null, deadlineMs: DEADLINE})
        });

        expect(verdict.admissible).toBe(true);
        expect(verdict.reason).toBe(EMBEDDING_ADMISSION.admissible);
        expect(verdict.serviceabilityCeilingTokens, 'and the receipt says the lane declared nothing').toBeNull()
    });

    test('an over-slot unit reports SLOT, not serviceability — the remedies are opposite', () => {
        // Over-slot is inadmissible on every deployment of this model; unserviceable is legal
        // everywhere and undeliverable only here. Conflating them tells an operator to re-chunk their
        // corpus when the answer is to fix the lane.
        const verdict = classifyEmbeddingAdmission({
            tokens                     : SLOT + 1,
            slotCeilingTokens          : SLOT,
            serviceabilityCeilingTokens: ceiling
        });

        expect(verdict.reason).toBe(EMBEDDING_ADMISSION.exceedsSlot)
    });

    test('a serviceable unit is admitted, and both ceilings are on the receipt', () => {
        const verdict = classifyEmbeddingAdmission({
            tokens                     : 2000,
            slotCeilingTokens          : SLOT,
            serviceabilityCeilingTokens: ceiling
        });

        expect(verdict.admissible).toBe(true);
        expect(verdict.slotCeilingTokens).toBe(SLOT);
        expect(verdict.serviceabilityCeilingTokens).toBe(ceiling)
    });

    test('the boundary is inclusive at the ceiling and refuses one token past it', () => {
        expect(classifyEmbeddingAdmission({tokens: ceiling, slotCeilingTokens: SLOT, serviceabilityCeilingTokens: ceiling}).admissible).toBe(true);
        expect(classifyEmbeddingAdmission({tokens: ceiling + 1, slotCeilingTokens: SLOT, serviceabilityCeilingTokens: ceiling}).reason)
            .toBe(EMBEDDING_ADMISSION.exceedsService)
    });

    test('a faster lane admits what a slow one refuses — the SAME chunk, no corpus change', () => {
        // The property that proves these are lane facts rather than chunk facts, and the reason the
        // declaration must be restated whenever the lane's CPU allocation changes.
        const fastCeiling = resolveServiceabilityCeilingTokens({declaredTokensPerSecond: 200, deadlineMs: DEADLINE});

        expect(classifyEmbeddingAdmission({
            tokens: UNDELIVERABLE_TOKENS, slotCeilingTokens: SLOT, serviceabilityCeilingTokens: fastCeiling
        }).admissible).toBe(true)
    });
});
