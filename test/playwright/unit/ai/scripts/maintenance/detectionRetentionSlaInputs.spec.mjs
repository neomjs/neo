import {test, expect}                    from '@playwright/test';
import {evaluateDetectionRetentionSla}   from '../../../../../../ai/scripts/maintenance/detectionRetentionSla.mjs';
import {resolveDetectionRetentionInputs} from '../../../../../../ai/scripts/maintenance/detectionRetentionSlaInputs.mjs';

// Pure input resolution (no I/O / clock / config) — imported directly, mirrors detectionRetentionSla.spec.
// Backup-reliability wiring-half: adapts the live config shapes (an interval leaf in ms + a retention
// object carrying `maxDays`) into the two durations the verdict-half consumes.
//
// The invariant every rejection case defends: an unresolvable input must be a BREACH, never a pass.
// `cleanOldBackups` defaults a missing `maxDays` to 30 because pruning must keep working on partial
// config; reproducing that default here would make the guard invent the window it exists to verify.

const DAY = 86400000;

test.describe('resolveDetectionRetentionInputs (#14030 AC3 wiring-half)', () => {
    test('resolves the live shapes — maxDays becomes a duration, cadence passes through', () => {
        const r = resolveDetectionRetentionInputs({
            dataIntegritySweepCheckMs: 3600000,
            retention                : {keepMinimum: 3, maxDays: 30}
        });

        expect(r.ok).toBe(true);
        expect(r.detectCadenceMs).toBe(3600000);
        expect(r.backupRetentionMs).toBe(30 * DAY);
        expect(r.reason).toBe(undefined);
    });

    test('the resolved pair feeds the verdict-half and reproduces the live verdict', () => {
        // The wiring's whole purpose: these are today's shipped leaf values
        // (`dataIntegritySweepCheckMs` = 1h, `retention.maxDays` = 30), so the guard must be GREEN
        // on current config — a red guard on an unchanged repo would be a broken guard, not a finding.
        const r = resolveDetectionRetentionInputs({
                dataIntegritySweepCheckMs: 3600000,
                retention                : {keepMinimum: 3, maxDays: 30}
            }),
            verdict = evaluateDetectionRetentionSla({
                backupRetentionMs: r.backupRetentionMs,
                detectCadenceMs  : r.detectCadenceMs
            });

        expect(verdict.withinSla).toBe(true);
        expect(verdict.requiredMaxDetectMs).toBe(15 * DAY);
    });

    test('POSITIVE CONTROL — an injected breach must actually fire', () => {
        // A guard that only ever passes is indistinguishable from a guard that cannot fail.
        // Retention shrunk to 10d → ceiling 5d; detect every 6d → the pair must breach.
        const r = resolveDetectionRetentionInputs({
                dataIntegritySweepCheckMs: 6 * DAY,
                retention                : {keepMinimum: 3, maxDays: 10}
            }),
            verdict = evaluateDetectionRetentionSla({
                backupRetentionMs: r.backupRetentionMs,
                detectCadenceMs  : r.detectCadenceMs
            });

        expect(r.ok).toBe(true);
        expect(verdict.withinSla).toBe(false);
        expect(verdict.marginMs).toBeLessThan(0);
    });

    test('a DISABLED detect lane is a breach with an actionable reason, not a throw', () => {
        // `dataIntegritySweep.mjs` treats `<= 0` as "lane disabled". The verdict-half would throw on
        // it; a deliberately disabled lane deserves a sentence naming the policy problem instead.
        for (const disabled of [0, -1, -60000]) {
            const r = resolveDetectionRetentionInputs({
                dataIntegritySweepCheckMs: disabled,
                retention                : {keepMinimum: 3, maxDays: 30}
            });

            expect(r.ok).toBe(false);
            expect(r.reason).toContain('DISABLED');
            expect(r.reason).toContain('unbounded');
            expect(r.backupRetentionMs).toBe(undefined);
        }
    });

    test('rejects a non-numeric / non-finite detect cadence — no silent pass', () => {
        for (const bad of [undefined, null, NaN, Infinity, '3600000', {}]) {
            const r = resolveDetectionRetentionInputs({
                dataIntegritySweepCheckMs: bad,
                retention                : {keepMinimum: 3, maxDays: 30}
            });

            expect(r.ok).toBe(false);
            expect(r.reason).toContain('detect cadence is unresolvable');
        }
    });

    test('rejects a missing / non-object retention policy — no silent pass', () => {
        for (const bad of [undefined, null, 30, 'thirty']) {
            const r = resolveDetectionRetentionInputs({
                dataIntegritySweepCheckMs: 3600000,
                retention                : bad
            });

            expect(r.ok).toBe(false);
            expect(r.reason).toContain('retention policy is unresolvable');
        }
    });

    test('NEVER defaults a missing maxDays to 30 — the guard must not invent its own window', () => {
        // The regression this pins: copying `cleanOldBackups`' `{maxDays = 30}` default into the guard
        // would make it certify a window nobody configured.
        for (const bad of [undefined, null, 0, -5, NaN, Infinity, '30', {}]) {
            const r = resolveDetectionRetentionInputs({
                dataIntegritySweepCheckMs: 3600000,
                retention                : {keepMinimum: 3, maxDays: bad}
            });

            expect(r.ok).toBe(false);
            expect(r.reason).toContain('`maxDays` is unresolvable');
            expect(r.backupRetentionMs).toBe(undefined);
        }
    });

    test('a disabled lane outranks an unresolvable retention policy', () => {
        // Resolution order matters for the message the operator reads: a disabled detect lane is a
        // breach no retention window can rescue, so it must be reported first.
        const r = resolveDetectionRetentionInputs({dataIntegritySweepCheckMs: 0, retention: undefined});

        expect(r.ok).toBe(false);
        expect(r.reason).toContain('DISABLED');
    });

    test('never resolves partially — ok:false carries no durations', () => {
        const r = resolveDetectionRetentionInputs({});

        expect(r.ok).toBe(false);
        expect(r.detectCadenceMs).toBe(undefined);
        expect(r.backupRetentionMs).toBe(undefined);
        expect(typeof r.reason).toBe('string');
    });
});
