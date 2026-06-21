import {test, expect}                from '@playwright/test';
import {
    getRemCycleStaleness,
    evaluateConsolidationStallAlarm,
    getDueTask
}                                     from '../../../../../../../ai/daemons/orchestrator/scheduling/remConsolidationLivenessWatchdog.mjs';

test.describe('orchestrator/scheduling/remConsolidationLivenessWatchdog', () => {
    // ── getRemCycleStaleness (read-only, fail-soft) ──────────────────────────────────────────────
    test('getRemCycleStaleness derives staleness from the latest cycle completedAt', async () => {
        const readRecent = async () => [{completedAt: 1000, outcome: 'completed'}];
        expect(await getRemCycleStaleness({remRunStateDir: '/x', now: 5000, readRecent}))
            .toEqual({hasCycle: true, lastCompletedAt: 1000, stalenessMs: 4000});
    });

    test('getRemCycleStaleness fails SOFT to no-cycle on a read error (never a false stall, never a throw)', async () => {
        const readRecent = async () => { throw new Error('fs fault'); };
        expect(await getRemCycleStaleness({remRunStateDir: '/x', now: 5000, readRecent}))
            .toEqual({hasCycle: false, lastCompletedAt: null, stalenessMs: 0});
    });

    test('getRemCycleStaleness reports no-cycle for an empty store', async () => {
        const readRecent = async () => [];
        expect(await getRemCycleStaleness({remRunStateDir: '/x', now: 5000, readRecent}))
            .toEqual({hasCycle: false, lastCompletedAt: null, stalenessMs: 0});
    });

    test('getRemCycleStaleness reports no-cycle when the latest entry lacks a finite completedAt', async () => {
        const readRecent = async () => [{outcome: 'failed'}];
        expect(await getRemCycleStaleness({remRunStateDir: '/x', now: 5000, readRecent}))
            .toEqual({hasCycle: false, lastCompletedAt: null, stalenessMs: 0});
    });

    // ── evaluateConsolidationStallAlarm (pure, one-shot latch) ───────────────────────────────────
    test('alarms on stall-onset: a stale cycle (older than the threshold)', () => {
        const r = evaluateConsolidationStallAlarm({hasCycle: true, stalenessMs: 10_000, thresholdMs: 6_000});
        expect(r.stalled).toBe(true);
        expect(r.shouldAlarm).toBe(true);
        expect(r.nextAlarmState.alarmed).toBe(true);
    });

    test('treats NO recorded cycle as a stall (the recentCycles:[] symptom / cold start)', () => {
        const r = evaluateConsolidationStallAlarm({hasCycle: false, stalenessMs: 0, thresholdMs: 6_000});
        expect(r.stalled).toBe(true);
        expect(r.shouldAlarm).toBe(true);
    });

    test('one-shot latch: no re-alarm while already alarmed', () => {
        const r = evaluateConsolidationStallAlarm({
            hasCycle  : true, stalenessMs: 10_000, thresholdMs: 6_000,
            alarmState: {alarmed: true, stalledSince: 1}
        });
        expect(r.stalled).toBe(true);
        expect(r.shouldAlarm).toBe(false);
    });

    test('a healthy (recent) cycle clears the latch', () => {
        const r = evaluateConsolidationStallAlarm({
            hasCycle  : true, stalenessMs: 1_000, thresholdMs: 6_000,
            alarmState: {alarmed: true, stalledSince: 1}
        });
        expect(r.stalled).toBe(false);
        expect(r.nextAlarmState).toEqual({alarmed: false, stalledSince: null});
    });

    test('a recent cycle below the threshold is healthy (not stalled)', () => {
        const r = evaluateConsolidationStallAlarm({hasCycle: true, stalenessMs: 1_000, thresholdMs: 6_000});
        expect(r.stalled).toBe(false);
        expect(r.shouldAlarm).toBe(false);
    });

    test('thresholdMs <= 0 disables alarming (never stalled)', () => {
        const r = evaluateConsolidationStallAlarm({hasCycle: false, stalenessMs: 0, thresholdMs: 0});
        expect(r.stalled).toBe(false);
    });

    // ── getDueTask (pure cadence) ────────────────────────────────────────────────────────────────
    test('getDueTask fires when the check cadence has elapsed', () => {
        expect(getDueTask({state: {lastRunAt: 0}, now: 2000, remConsolidationWatchdogCheckMs: 1000}))
            .toMatchObject({taskName: 'rem-consolidation-liveness-watchdog', source: 'periodic-health-check'});
    });

    test('getDueTask is not due within the cadence', () => {
        expect(getDueTask({state: {lastRunAt: 1500}, now: 2000, remConsolidationWatchdogCheckMs: 1000})).toBeNull();
    });

    test('getDueTask is disabled when the check cadence is <= 0', () => {
        expect(getDueTask({state: {lastRunAt: 0}, now: 1e12, remConsolidationWatchdogCheckMs: 0})).toBeNull();
    });
});
