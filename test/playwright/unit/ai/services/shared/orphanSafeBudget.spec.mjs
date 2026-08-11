import {expect, test}     from '@playwright/test';
import {orphanSafeBudget} from '../../../../../../ai/services/shared/orphanSafeBudget.mjs';

/**
 * Ollama does not cancel on client disconnect (`ollama/ollama#11889`, open upstream), so a budget (ticket-ref-ok: upstream provider behaviour, not a Neo tracking ref — the mechanism this guard exists for)
 * larger than the caller's deadline dispatches work that can never be recalled. On a single-slot
 * provider those orphans hold the slot and pin the CPU cap.
 *
 * Measured live 2026-08-11T09:18Z: three operations SUCCEEDED after 961,609ms / 662,615ms /
 * 1,010,684ms with their callers gone 5-15 minutes earlier; fresh probes then took ~1.4s.
 */
test.describe('orphanSafeBudget — never dispatch work that outlives its caller (#16853)', () => {
    test('clamps the production pairing: a 15-minute canary against a 45-second caller', () => {
        // The exact external-plane configuration. 900000ms budget, 45000ms container timeout.
        const {budgetMs, clamped, reason} = orphanSafeBudget({configuredMs: 900000, callerDeadlineMs: 45000});

        expect(budgetMs).toBe(45000);
        expect(clamped).toBe(true);
        expect(reason).toContain('11889');
    });

    test('NON-VACUITY — a budget INSIDE the caller deadline passes through untouched', () => {
        // Without this arm a guard that clamped everything to the deadline would pass the arm above.
        const {budgetMs, clamped} = orphanSafeBudget({configuredMs: 30000, callerDeadlineMs: 45000});

        expect(budgetMs).toBe(30000);
        expect(clamped).toBe(false);
    });

    test('an EQUAL budget is not clamped — the boundary is inclusive', () => {
        const {budgetMs, clamped} = orphanSafeBudget({configuredMs: 45000, callerDeadlineMs: 45000});

        expect(budgetMs).toBe(45000);
        expect(clamped).toBe(false);
    });

    test('an UNKNOWN caller deadline passes through — the guard narrows, it never invents a bound', () => {
        // Fabricating a ceiling would shorten deadlines on deployments whose callers genuinely wait
        // longer, which is a different outage. Absence of a bound is not permission to impose one.
        for (const callerDeadlineMs of [undefined, null, 0, -1, NaN]) {
            expect(orphanSafeBudget({configuredMs: 900000, callerDeadlineMs}))
                .toEqual({budgetMs: 900000, clamped: false, reason: null});
        }
    });

    test('a non-positive or non-finite CONFIGURED budget is returned unchanged, never clamped', () => {
        // These are configuration errors owned by config validation. Silently rewriting them here
        // would hide the defect behind a plausible number.
        for (const configuredMs of [0, -1, NaN, undefined]) {
            expect(orphanSafeBudget({configuredMs, callerDeadlineMs: 45000}).clamped).toBe(false);
        }
    });

    test('the reason names the mechanism, so an operator can act without reading this module', () => {
        const {reason} = orphanSafeBudget({configuredMs: 300000, callerDeadlineMs: 45000});

        expect(reason).toContain('300000');
        expect(reason).toContain('45000');
        expect(reason).toContain('does not cancel');
    });
});
