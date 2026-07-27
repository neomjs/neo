import {test, expect} from '@playwright/test';
import {
    PILOT_TERMINALS,
    evaluateDemotion,
    evaluatePromotion,
    isEligibilityOpen
} from '../../../../../../ai/scripts/diagnostics/pilotPlaneTerminal.mjs';

// AC5's parenthetical — "never a silent abandon" — is the whole specification. So the assertions here are
// mostly about the ABSENCE of exits: every path must name a terminal, an unprovable claim must deny
// eligibility, and no caller may hand in the verdict.
//
// The demotion suite additionally guards a false-positive that a fingerprint-equality proof would have
// shipped: the durable plane has other writers, so its digest is EXPECTED to move during a pilot.

const cleanDemotion = {durableOverlayTaggedSegments: [], preCloneSegmentCount: 100, postPilotSegmentCount: 140};

test.describe('terminal set and eligibility gate', () => {
    test('every terminal is named, and only the two proven ones open eligibility', () => {
        expect(PILOT_TERMINALS).toEqual(['committed', 'demoted-clean', 'failed-contained']);

        expect(isEligibilityOpen('committed')).toBe(true);
        expect(isEligibilityOpen('demoted-clean')).toBe(true);
        expect(isEligibilityOpen('failed-contained')).toBe(false);
    });

    test('an unknown terminal does not open eligibility', () => {
        // Fails closed on anything it does not recognise, so a future terminal added without revisiting
        // this gate cannot silently grant consumption rights.
        for (const value of ['completed', 'ok', 'COMMITTED', '', null, undefined]) {
            expect(isEligibilityOpen(value)).toBe(false);
        }
    });
});

test.describe('evaluatePromotion — forward-only, and unprovable settles contained', () => {
    test('monotonic continuity commits and carries the receipt through', () => {
        const receipt = {requiredStages: ['embedded', 'graph'], plannedTotal: 7, unrelatedTotal: 0},
              result  = evaluatePromotion({continuity: {ok: true, monotonic: true, receipt}});

        expect(result.terminal).toBe('committed');
        expect(result.eligibilityOpen).toBe(true);
        expect(result.receipt).toBe(receipt);
    });

    test('a refused continuity verdict settles contained and surfaces the verifier reason', () => {
        const result = evaluatePromotion({continuity: {ok: false, reason: 'duplicate source ids in payload'}});

        expect(result.terminal).toBe('failed-contained');
        expect(result.eligibilityOpen).toBe(false);
        expect(result.reason).toContain('duplicate source ids');
    });

    test('ok:true without monotonic:true does NOT commit', () => {
        // The claim being relied on is monotonicity, not the presence of an `ok` flag. A verdict that
        // verified something else must not stand in for one that excluded loss and double-apply.
        const result = evaluatePromotion({continuity: {ok: true, receipt: {plannedTotal: 3}}});

        expect(result.terminal).toBe('failed-contained');
        expect(result.reason).toContain('monotonic');
    });

    test('absent evidence settles contained rather than refusing — the refusal WOULD BE the abandon', () => {
        for (const continuity of [undefined, null, 'ok', 42]) {
            const result = evaluatePromotion({continuity});

            expect(result.terminal).toBe('failed-contained');
            expect(result.eligibilityOpen).toBe(false);
        }

        // Called with nothing at all: a promotion that died before producing any evidence.
        expect(evaluatePromotion().terminal).toBe('failed-contained');
    });

    test('a caller cannot supply the terminal', () => {
        // Derived, never accepted: an audit fact the caller can pre-seed attests to belief, not evidence.
        const result = evaluatePromotion({
            continuity     : {ok: false, reason: 'replay incomplete'},
            terminal       : 'committed',
            eligibilityOpen: true
        });

        expect(result.terminal).toBe('failed-contained');
        expect(result.eligibilityOpen).toBe(false);
    });
});

test.describe('evaluateDemotion — proves no leak, NOT an unchanged durable plane', () => {
    test('concurrent growth from other seats is clean, not a failure', () => {
        // The load-bearing case. A pilot occupies one seat for 1-2 weeks while the institution keeps
        // writing, so +40 durable segments is the EXPECTED shape of a healthy demotion. A fingerprint
        // equality proof would have called this contained and been disabled within one pilot.
        const result = evaluateDemotion(cleanDemotion);

        expect(result.terminal).toBe('demoted-clean');
        expect(result.eligibilityOpen).toBe(true);
        expect(result.receipt.concurrentGrowth).toBe(40);
        expect(result.receipt.overlayTaggedTotal).toBe(0);
    });

    test('zero concurrent growth is also clean', () => {
        const result = evaluateDemotion({...cleanDemotion, postPilotSegmentCount: 100});

        expect(result.terminal).toBe('demoted-clean');
        expect(result.receipt.concurrentGrowth).toBe(0);
    });

    test('an overlay-tagged segment in the durable corpus settles contained and says do not delete', () => {
        const result = evaluateDemotion({
            ...cleanDemotion,
            durableOverlayTaggedSegments: ['wal-2026-07-20.jsonl', 'wal-2026-07-21.jsonl']
        });

        expect(result.terminal).toBe('failed-contained');
        expect(result.eligibilityOpen).toBe(false);
        expect(result.reason).toContain('wal-2026-07-20.jsonl');
        // Quarantine over deletion: the overlay is the only surviving evidence of what leaked.
        expect(result.reason).toContain('Quarantine');
        expect(result.receipt.overlayTaggedTotal).toBe(2);
    });

    test('a shrinking durable corpus settles contained — writers explain growth, never loss', () => {
        const result = evaluateDemotion({...cleanDemotion, postPilotSegmentCount: 99});

        expect(result.terminal).toBe('failed-contained');
        expect(result.reason).toContain('shrank');
    });

    test('an unscanned durable plane is unproven, not clean', () => {
        // Omitting the scan is the likeliest real-world shortcut, and the one that would quietly convert
        // "we did not look" into "nothing was there".
        for (const durableOverlayTaggedSegments of [undefined, null, 0, 'none']) {
            const result = evaluateDemotion({...cleanDemotion, durableOverlayTaggedSegments});

            expect(result.terminal).toBe('failed-contained');
            expect(result.reason).toContain('unproven');
        }
    });

    test('missing or malformed segment counts settle contained', () => {
        for (const counts of [
            {preCloneSegmentCount: undefined, postPilotSegmentCount: 140},
            {preCloneSegmentCount: 100, postPilotSegmentCount: undefined},
            {preCloneSegmentCount: 1.5, postPilotSegmentCount: 140},
            {preCloneSegmentCount: -1, postPilotSegmentCount: 140},
            {preCloneSegmentCount: '100', postPilotSegmentCount: 140}
        ]) {
            const result = evaluateDemotion({durableOverlayTaggedSegments: [], ...counts});

            expect(result.terminal).toBe('failed-contained');
            expect(result.eligibilityOpen).toBe(false);
        }

        expect(evaluateDemotion().terminal).toBe('failed-contained');
    });

    test('the leak check outranks the count check', () => {
        // Both wrong at once: the report must lead with the leak, since that is the fact that changes
        // what the operator does next.
        const result = evaluateDemotion({
            durableOverlayTaggedSegments: ['wal-2026-07-22.jsonl'],
            preCloneSegmentCount        : 100,
            postPilotSegmentCount       : 99
        });

        expect(result.terminal).toBe('failed-contained');
        expect(result.reason).toContain('overlay-tagged');
    });
});

test.describe('no path exits without a named terminal', () => {
    test('both evaluators always return a member of PILOT_TERMINALS', () => {
        const inputs = [
            undefined, null, {}, {continuity: {}}, {continuity: {ok: true}},
            {durableOverlayTaggedSegments: []}, {preCloneSegmentCount: 5},
            {durableOverlayTaggedSegments: [], preCloneSegmentCount: 5, postPilotSegmentCount: 5}
        ];

        for (const input of inputs) {
            for (const evaluate of [evaluatePromotion, evaluateDemotion]) {
                const result = evaluate(input);

                expect(PILOT_TERMINALS).toContain(result.terminal);
                expect(typeof result.reason).toBe('string');
                expect(result.reason.length).toBeGreaterThan(0);
                expect(result.eligibilityOpen).toBe(isEligibilityOpen(result.terminal));
            }
        }
    });
});
