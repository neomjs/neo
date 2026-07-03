import {test, expect} from '@playwright/test';
import {mkdtemp, rm}  from 'fs/promises';
import os             from 'os';
import path           from 'path';

import {appendRemRunState}           from '../../../../../../../ai/services/memory-core/helpers/remRunStateStore.mjs';
import {
    getRemCycleStaleness,
    evaluateConsolidationStallAlarm,
    getDueTask
}                                     from '../../../../../../../ai/daemons/orchestrator/scheduling/remConsolidationLivenessWatchdog.mjs';
import {
    buildSchedulingContext,
    runSchedulingPipeline
}                                     from '../../../../../../../ai/daemons/orchestrator/scheduling/pipeline.mjs';
import {TASK_REGISTRY}        from '../../../../../../../ai/daemons/orchestrator/scheduling/registry.mjs';
import {BOOT_FRESHNESS_CLASS} from '../../../../../../../ai/daemons/orchestrator/services/bootIdentityFreshness.mjs';

const HOUR_MS = 60 * 60 * 1000;

test.describe('orchestrator/scheduling/remConsolidationLivenessWatchdog', () => {
    // ── getRemCycleStaleness (read-only, fail-soft) ──────────────────────────────────────────────
    test('getRemCycleStaleness derives staleness from the latest cycle completedAt', async () => {
        const readRecent = async () => [{completedAt: 1000, outcome: 'completed'}];
        expect(await getRemCycleStaleness({remRunStateDir: '/x', now: 5000, readRecent}))
            .toEqual({hasCycle: true, readFault: false, lastCompletedAt: 1000, stalenessMs: 4000});
    });

    test('getRemCycleStaleness fails SOFT to a readFault reading on a read error (never a false stall, never a throw)', async () => {
        const readRecent = async () => { throw new Error('fs fault'); };
        expect(await getRemCycleStaleness({remRunStateDir: '/x', now: 5000, readRecent}))
            .toEqual({hasCycle: false, readFault: true, lastCompletedAt: null, stalenessMs: 0});
    });

    test('getRemCycleStaleness reports a genuine no-cycle (not a readFault) for an empty store', async () => {
        const readRecent = async () => [];
        expect(await getRemCycleStaleness({remRunStateDir: '/x', now: 5000, readRecent}))
            .toEqual({hasCycle: false, readFault: false, lastCompletedAt: null, stalenessMs: 0});
    });

    test('getRemCycleStaleness reports no-cycle when the latest entry lacks a finite completedAt', async () => {
        const readRecent = async () => [{outcome: 'failed'}];
        expect(await getRemCycleStaleness({remRunStateDir: '/x', now: 5000, readRecent}))
            .toEqual({hasCycle: false, readFault: false, lastCompletedAt: null, stalenessMs: 0});
    });

    // ── evaluateConsolidationStallAlarm (pure, one-shot latch; backlog-gated) ─────────────────────
    test('alarms on stall-onset: a stale cycle (older than the threshold) WITH an undigested backlog', () => {
        const r = evaluateConsolidationStallAlarm({hasCycle: true, stalenessMs: 10_000, undigestedCount: 5, thresholdMs: 6_000});
        expect(r.stalled).toBe(true);
        expect(r.shouldAlarm).toBe(true);
        expect(r.nextAlarmState.alarmed).toBe(true);
    });

    test('treats NO recorded cycle as a stall (recentCycles:[]) when a backlog exists', () => {
        const r = evaluateConsolidationStallAlarm({hasCycle: false, stalenessMs: 0, undigestedCount: 5, thresholdMs: 6_000});
        expect(r.stalled).toBe(true);
        expect(r.shouldAlarm).toBe(true);
    });

    test('backlog guard: a stale/absent cycle with NO undigested backlog is NOT a stall', () => {
        expect(evaluateConsolidationStallAlarm({hasCycle: false, stalenessMs: 10_000, undigestedCount: 0, thresholdMs: 6_000}).stalled).toBe(false);
        expect(evaluateConsolidationStallAlarm({hasCycle: true, stalenessMs: 10_000, undigestedCount: 0, thresholdMs: 6_000}).stalled).toBe(false);
    });

    test('readFault fails soft to no alarm and PRESERVES the latch (an inconclusive read != a stall)', () => {
        const r = evaluateConsolidationStallAlarm({
            readFault : true, hasCycle: false, stalenessMs: 10_000, undigestedCount: 5, thresholdMs: 6_000,
            alarmState: {alarmed: true, stalledSince: 1}
        });
        expect(r.stalled).toBe(false);
        expect(r.shouldAlarm).toBe(false);
        expect(r.nextAlarmState).toEqual({alarmed: true, stalledSince: 1});
    });

    test('one-shot latch: no re-alarm while already alarmed', () => {
        const r = evaluateConsolidationStallAlarm({
            hasCycle  : true, stalenessMs: 10_000, undigestedCount: 5, thresholdMs: 6_000,
            alarmState: {alarmed: true, stalledSince: 1}
        });
        expect(r.stalled).toBe(true);
        expect(r.shouldAlarm).toBe(false);
    });

    test('a healthy (recent) cycle clears the latch', () => {
        const r = evaluateConsolidationStallAlarm({
            hasCycle  : true, stalenessMs: 1_000, undigestedCount: 5, thresholdMs: 6_000,
            alarmState: {alarmed: true, stalledSince: 1}
        });
        expect(r.stalled).toBe(false);
        expect(r.nextAlarmState).toEqual({alarmed: false, stalledSince: null});
    });

    test('a recent cycle below the threshold is healthy (not stalled)', () => {
        const r = evaluateConsolidationStallAlarm({hasCycle: true, stalenessMs: 1_000, undigestedCount: 5, thresholdMs: 6_000});
        expect(r.stalled).toBe(false);
        expect(r.shouldAlarm).toBe(false);
    });

    test('thresholdMs <= 0 disables alarming (never stalled)', () => {
        const r = evaluateConsolidationStallAlarm({hasCycle: false, stalenessMs: 0, undigestedCount: 5, thresholdMs: 0});
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

test.describe('orchestrator/scheduling/remConsolidationLivenessWatchdog — pipeline active alarm (#13839)', () => {
    let remRunStateDir;

    test.beforeEach(async () => {
        remRunStateDir = await mkdtemp(path.join(os.tmpdir(), 'neo-rem-consolidation-watchdog-'));
    });

    test.afterEach(async () => {
        await rm(remRunStateDir, {recursive: true, force: true});
    });

    function makeTaskStateService() {
        const taskState = {'rem-consolidation-liveness-watchdog': {lastRunAt: 0}};
        return {
            getState() { return taskState; },
            getTaskState(name) { return taskState[name]; },
            markStarted(name) { taskState[name].running = true; taskState[name].lastRunAt = Date.now(); },
            markCompleted(name) { taskState[name].running = false; },
            markFailed(name) { taskState[name].running = false; }
        };
    }

    function makeServices({taskStateService, outcomes, dispatcher, undigestedCount = 5, taskOutcomes = {}}) {
        return {
            dreamService: {
                findUndigestedSessions: async () => Array.from({length: undigestedCount}, (_, index) => ({id: `s-${index}`}))
            },
            healthService: {
                recordTaskOutcome(taskName, status, details) { outcomes.push({taskName, status, details}); },
                getTaskOutcome(taskName) { return taskOutcomes[taskName] || null; }
            },
            maintenanceBackpressureService: {
                getActiveHeavyMaintenanceTask() { return null; },
                isHeavyMaintenanceTask() { return false; },
                isHeavyMaintenanceConflict() { return false; },
                recordDeferral() {}
            },
            taskStateService,
            remConsolidationLivenessAlarmDispatcher: dispatcher
        };
    }

    function makeRuntime(overrides = {}) {
        return {
            remConsolidationWatchdogRunStateDir : remRunStateDir,
            remConsolidationWatchdogThresholdMs : 6 * HOUR_MS,
            remConsolidationWatchdogAlarmEnabled: true,
            writeLog                            : () => {},
            ...overrides
        };
    }

    async function runWatchdogOnce({taskStateService, outcomes, dispatcher, runtime, undigestedCount = 5, taskOutcomes = {}}) {
        const context = buildSchedulingContext({
            db       : {},
            state    : taskStateService.getState(),
            now      : Date.now(),
            intervals: {remConsolidationWatchdogCheck: 1},
            enables  : {},
            hooks    : {}
        });

        runSchedulingPipeline({
            registry: [TASK_REGISTRY.find(d => d.taskName === 'rem-consolidation-liveness-watchdog')],
            context,
            services: makeServices({taskStateService, outcomes, dispatcher, undigestedCount, taskOutcomes}),
            runtime
        });

        await new Promise(resolve => setTimeout(resolve, 20));
    }

    test('a recent dream deferral labels the stall designed-deferral WITHOUT suppressing the alarm (#14490)', async () => {
        const now              = Date.now();
        const outcomes         = [];
        const alarmCalls       = [];
        const dispatcher       = async payload => { alarmCalls.push(payload); };
        const taskStateService = makeTaskStateService();
        const runtime          = makeRuntime();
        // A finite but STALE cycle (7h ago, beyond the 6h threshold) → the watchdog stalls; absent a
        // deferral this gap would read as unexplained / restart-explains, not designed.
        await appendRemRunState({runId: 'stale', completedAt: now - 7 * HOUR_MS}, {dir: remRunStateDir});
        // A RECENT, RECOGNIZED 'dream' maintenance-deferral sits on the shared health task-outcome
        // surface — the exact shape MaintenanceBackpressureService.recordDeferral emits (recognized
        // reasonCode + deferral-specific deferredAt).
        const taskOutcomes = {
            dream: {
                status    : 'skipped',
                details   : {reason: 'heavy maintenance task backup is active', reasonCode: 'heavy-maintenance-backpressure', deferredAt: new Date(now).toISOString(), blockingTaskName: 'backup'},
                recordedAt: new Date(now).toISOString()
            }
        };

        await runWatchdogOnce({taskStateService, outcomes, dispatcher, runtime, taskOutcomes});

        const failed = outcomes.find(outcome => outcome.status === 'failed');
        expect(failed).toBeTruthy();
        // The recent deferral re-labels the disposition as designed-deferral...
        expect(failed.details.bootFreshness).toBe(BOOT_FRESHNESS_CLASS.designedDeferral);
        // ...but ADVISORY-ONLY: the stall alarm still fires (OQ4 — a deferral never suppresses it).
        expect(alarmCalls.length).toBeGreaterThanOrEqual(1);
    });

    test('a dream skip that is NOT a recognized recent deferral does NOT become designed-deferral (#14492 review)', async () => {
        const runtime = makeRuntime();

        // Two ways a skip fails the narrowed gate: (1) a generic / unrecognized reasonCode (not a
        // maintenance-backpressure deferral); (2) a recognized reasonCode but NO deferral-specific
        // deferredAt (not a real recordDeferral outcome). Neither may masquerade as a designed deferral.
        const negativeDetails = [
            {reason: 'ad-hoc skip',      reasonCode: 'some-unrecognized-reason', deferredAt: new Date(Date.now()).toISOString()},
            {reason: 'no deferredAt',    reasonCode: 'heavy-maintenance-backpressure'}
        ];

        for (const details of negativeDetails) {
            const now              = Date.now();
            const outcomes         = [];
            const alarmCalls       = [];
            const dispatcher       = async payload => { alarmCalls.push(payload); };
            const taskStateService = makeTaskStateService();
            await appendRemRunState({runId: 'stale', completedAt: now - 7 * HOUR_MS}, {dir: remRunStateDir});
            const taskOutcomes = {dream: {status: 'skipped', details, recordedAt: new Date(now).toISOString()}};

            await runWatchdogOnce({taskStateService, outcomes, dispatcher, runtime, taskOutcomes});

            const failed = outcomes.find(outcome => outcome.status === 'failed');
            expect(failed).toBeTruthy();
            // The unrecognized / non-deferral skip is rejected — NOT a designed deferral.
            expect(failed.details.bootFreshness).not.toBe(BOOT_FRESHNESS_CLASS.designedDeferral);
            // ...and the alarm still fires regardless (advisory-only classification).
            expect(alarmCalls.length).toBeGreaterThanOrEqual(1);
        }
    });

    test('fires the active alarm once on stall-onset and latches subsequent stalled checks', async () => {
        const outcomes         = [];
        const alarmCalls       = [];
        const dispatcher       = async payload => { alarmCalls.push(payload); };
        const taskStateService = makeTaskStateService();
        const runtime          = makeRuntime();

        await runWatchdogOnce({taskStateService, outcomes, dispatcher, runtime});
        await runWatchdogOnce({taskStateService, outcomes, dispatcher, runtime});

        expect(outcomes.some(o => o.status === 'failed')).toBe(true);
        expect(alarmCalls).toHaveLength(1);
        expect(alarmCalls[0]).toMatchObject({
            hasCycle       : false,
            lastCompletedAt: null,
            stalenessMs    : 0,
            undigestedCount: 5,
            thresholdMs    : 6 * HOUR_MS
        });
        expect(typeof alarmCalls[0].stalledSince).toBe('number');
        expect(taskStateService.getTaskState('rem-consolidation-liveness-watchdog').remConsolidationAlarm.alarmed).toBe(true);
    });

    test('suppresses the active alarm when the local dream lane is not owned here', async () => {
        const outcomes         = [];
        const alarmCalls       = [];
        const dispatcher       = async payload => { alarmCalls.push(payload); };
        const taskStateService = makeTaskStateService();

        await runWatchdogOnce({
            taskStateService, outcomes, dispatcher,
            runtime: makeRuntime({remConsolidationWatchdogAlarmEnabled: false})
        });

        expect(outcomes.some(o => o.status === 'failed')).toBe(true);
        expect(alarmCalls).toHaveLength(0);
    });

    test('dispatcher failures are logged and swallowed after the passive failed outcome', async () => {
        const outcomes         = [];
        const logs             = [];
        const taskStateService = makeTaskStateService();

        await runWatchdogOnce({
            taskStateService,
            outcomes,
            dispatcher: async () => { throw new Error('a2a unavailable'); },
            runtime   : makeRuntime({
                writeLog(level, message) { logs.push({level, message}); }
            })
        });

        expect(outcomes.some(o => o.status === 'failed')).toBe(true);
        expect(logs).toContainEqual({
            level  : 'ERROR',
            message: '[Orchestrator] REM consolidation stall-alarm dispatch failed: a2a unavailable'
        });
    });

    test('a healthy REM cycle clears the latch and does not dispatch', async () => {
        const now = Date.now();
        await appendRemRunState({runId: 'healthy', completedAt: now - HOUR_MS}, {dir: remRunStateDir});

        const outcomes         = [];
        const alarmCalls       = [];
        const taskStateService = makeTaskStateService();
        taskStateService.getTaskState('rem-consolidation-liveness-watchdog').remConsolidationAlarm = {
            alarmed     : true,
            stalledSince: now - 8 * HOUR_MS
        };

        await runWatchdogOnce({
            taskStateService,
            outcomes,
            dispatcher: async payload => { alarmCalls.push(payload); },
            runtime   : makeRuntime()
        });

        expect(outcomes.some(o => o.status === 'completed')).toBe(true);
        expect(alarmCalls).toHaveLength(0);
        expect(taskStateService.getTaskState('rem-consolidation-liveness-watchdog').remConsolidationAlarm)
            .toEqual({alarmed: false, stalledSince: null});
    });
});
