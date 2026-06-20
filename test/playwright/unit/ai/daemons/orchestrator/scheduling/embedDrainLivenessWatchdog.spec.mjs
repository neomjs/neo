import {test, expect} from '@playwright/test';
import {mkdtemp, rm}  from 'fs/promises';
import os             from 'os';
import path           from 'path';

import {appendWalEmbedMarker, appendWalMemory} from '../../../../../../../ai/services/memory-core/helpers/memoryWalStore.mjs';
import {
    evaluateStallAlarm,
    getDueTask,
    getEmbedDrainPendingAge
}                       from '../../../../../../../ai/daemons/orchestrator/scheduling/embedDrainLivenessWatchdog.mjs';
import {
    buildSchedulingContext,
    runSchedulingPipeline
}                       from '../../../../../../../ai/daemons/orchestrator/scheduling/pipeline.mjs';

/**
 * Embed-drain liveness watchdog — the read-only, never-fail WAL-backlog progress check that
 * closes the silent-drain-death detection gap. Falsifier coverage:
 *
 *   (a) getEmbedDrainPendingAge derives oldest-age + count over a real fixture WAL
 *   (b) getDueTask cadence trip / no-trip / disabled
 *   (c) threshold trip → 'failed' outcome + one-shot alarm fired (spy) via the scheduling pipeline
 *   (d) below-threshold → 'completed' outcome, NO alarm
 *   (e) one-shot latch: consecutive stalled checks do NOT re-alarm until a healthy check resets it
 *   (f) a thrown error in the check degrades to "no alarm" and never propagates into the pipeline
 *
 * No real daemon/drain is spawned — the WAL is a temp-dir fixture and the clock + collaborators are
 * injected.
 */

const HOUR_MS = 60 * 60 * 1000;

/** A WAL record carrying an explicit write timestamp so age is deterministic. */
const record = (id, timestampMs) => ({
    id,
    timestamp: timestampMs,
    metadata : {prompt: `p-${id}`, response: `r-${id}`, thought: `t-${id}`},
    document : `doc-${id}`
});

test.describe('orchestrator/scheduling/embedDrainLivenessWatchdog — getEmbedDrainPendingAge (#13551)', () => {
    let walDir;

    test.beforeEach(async () => {
        walDir = await mkdtemp(path.join(os.tmpdir(), 'neo-embed-drain-watchdog-'));
    });

    test.afterEach(async () => {
        await rm(walDir, {recursive: true, force: true});
    });

    test('(a) reports oldest age + pending count over a fixture WAL (oldest = max age)', async () => {
        const now    = Date.UTC(2026, 5, 3, 12);
        const oldest = now - 5 * HOUR_MS;       // 5h old (the oldest pending)
        const newer  = now - 1 * HOUR_MS;       // 1h old

        await appendWalMemory(record('m-old', oldest), {dir: walDir});
        await appendWalMemory(record('m-new', newer),  {dir: walDir});

        const result = await getEmbedDrainPendingAge({walDir, now});

        expect(result.pendingCount).toBe(2);
        expect(result.oldestTimestamp).toBe(oldest);
        expect(result.oldestAgeMs).toBe(5 * HOUR_MS);
    });

    test('(a) embed-marked records are no longer pending (drain progress shrinks the backlog)', async () => {
        const now    = Date.UTC(2026, 5, 3, 12);
        const oldest = now - 5 * HOUR_MS;
        const newer  = now - 1 * HOUR_MS;

        const {segmentKey: oldKey} = await appendWalMemory(record('m-old', oldest), {dir: walDir});
        await appendWalMemory(record('m-new', newer), {dir: walDir});

        // Embed the OLDEST record → only the newer record stays pending.
        await appendWalEmbedMarker({id: 'm-old', segmentKey: oldKey}, {dir: walDir});

        const result = await getEmbedDrainPendingAge({walDir, now});
        expect(result.pendingCount).toBe(1);
        expect(result.oldestTimestamp).toBe(newer);
        expect(result.oldestAgeMs).toBe(1 * HOUR_MS);
    });

    test('(a) a clean / empty WAL yields a zero-backlog reading (no false stall)', async () => {
        const result = await getEmbedDrainPendingAge({walDir, now: Date.now()});
        expect(result).toEqual({oldestAgeMs: 0, pendingCount: 0, oldestTimestamp: null});
    });

    test('(f) a thrown error in the WAL read degrades to a zero-backlog reading (never throws)', async () => {
        const throwingReader = async () => { throw new Error('simulated WAL read fault'); };
        const result = await getEmbedDrainPendingAge({walDir, now: Date.now(), readPending: throwingReader});
        // Fails SOFT: a read fault must look like "no backlog" (→ no alarm), never a stall or a throw.
        expect(result).toEqual({oldestAgeMs: 0, pendingCount: 0, oldestTimestamp: null});
    });

    test('a malformed record (no finite timestamp) is still counted but never anchors the age', async () => {
        const now = Date.UTC(2026, 5, 3, 12);
        const reader = async () => [
            {id: 'good', timestamp: now - 2 * HOUR_MS},
            {id: 'bad',  timestamp: 'not-a-number'}
        ];
        const result = await getEmbedDrainPendingAge({walDir, now, readPending: reader});
        expect(result.pendingCount).toBe(2);
        expect(result.oldestTimestamp).toBe(now - 2 * HOUR_MS);
        expect(result.oldestAgeMs).toBe(2 * HOUR_MS);
    });
});

test.describe('orchestrator/scheduling/embedDrainLivenessWatchdog — getDueTask cadence (#13551)', () => {
    test('(b) returns a periodic-health-check trigger when the interval has elapsed', () => {
        expect(getDueTask({
            state                            : {lastRunAt: 0},
            now                              : HOUR_MS,
            embedDrainLivenessWatchdogCheckMs: HOUR_MS
        })).toEqual({
            taskName: 'embed-drain-liveness-watchdog',
            source  : 'periodic-health-check',
            reason  : `periodic-health-check:${HOUR_MS}`
        });
    });

    test('(b) returns null when the interval has not yet elapsed', () => {
        expect(getDueTask({
            state                            : {lastRunAt: 0},
            now                              : HOUR_MS - 1,
            embedDrainLivenessWatchdogCheckMs: HOUR_MS
        })).toBeNull();
    });

    test('(b) treats intervalMs <= 0 as disabled', () => {
        expect(getDueTask({state: {lastRunAt: 0}, now: 9e12, embedDrainLivenessWatchdogCheckMs: 0})).toBeNull();
        expect(getDueTask({state: {lastRunAt: 0}, now: 9e12, embedDrainLivenessWatchdogCheckMs: -1})).toBeNull();
    });

    test('(b) handles missing state gracefully (lastRunAt defaults to 0)', () => {
        expect(getDueTask({state: undefined, now: HOUR_MS, embedDrainLivenessWatchdogCheckMs: HOUR_MS})).toEqual({
            taskName: 'embed-drain-liveness-watchdog',
            source  : 'periodic-health-check',
            reason  : `periodic-health-check:${HOUR_MS}`
        });
    });
});

test.describe('orchestrator/scheduling/embedDrainLivenessWatchdog — evaluateStallAlarm one-shot latch (#13551)', () => {
    const THRESHOLD = 6 * HOUR_MS;

    test('below threshold → not stalled, no alarm, latch cleared', () => {
        const r = evaluateStallAlarm({oldestAgeMs: 3 * HOUR_MS, pendingCount: 5, thresholdMs: THRESHOLD, alarmState: null});
        expect(r.stalled).toBe(false);
        expect(r.shouldAlarm).toBe(false);
        expect(r.nextAlarmState).toEqual({alarmed: false, stalledSince: null});
    });

    test('above threshold from a clear latch → stalled, alarm fires, latch set', () => {
        const r = evaluateStallAlarm({oldestAgeMs: 7 * HOUR_MS, pendingCount: 5, thresholdMs: THRESHOLD, alarmState: {alarmed: false}});
        expect(r.stalled).toBe(true);
        expect(r.shouldAlarm).toBe(true);
        expect(r.nextAlarmState.alarmed).toBe(true);
    });

    test('above threshold while already latched → stalled but NO re-alarm', () => {
        const r = evaluateStallAlarm({oldestAgeMs: 8 * HOUR_MS, pendingCount: 5, thresholdMs: THRESHOLD, alarmState: {alarmed: true, stalledSince: 123}});
        expect(r.stalled).toBe(true);
        expect(r.shouldAlarm).toBe(false);
        expect(r.nextAlarmState).toEqual({alarmed: true, stalledSince: 123});
    });

    test('a healthy check clears the latch so a later stall can re-alarm', () => {
        const healthy = evaluateStallAlarm({oldestAgeMs: 1 * HOUR_MS, pendingCount: 0, thresholdMs: THRESHOLD, alarmState: {alarmed: true, stalledSince: 123}});
        expect(healthy.nextAlarmState).toEqual({alarmed: false, stalledSince: null});

        const reStall = evaluateStallAlarm({oldestAgeMs: 9 * HOUR_MS, pendingCount: 3, thresholdMs: THRESHOLD, alarmState: healthy.nextAlarmState});
        expect(reStall.shouldAlarm).toBe(true);
    });

    test('threshold <= 0 disables alarming even with a large backlog', () => {
        const r = evaluateStallAlarm({oldestAgeMs: 99 * HOUR_MS, pendingCount: 99, thresholdMs: 0, alarmState: null});
        expect(r.stalled).toBe(false);
        expect(r.shouldAlarm).toBe(false);
    });

    test('an empty backlog is never stalled regardless of age field', () => {
        const r = evaluateStallAlarm({oldestAgeMs: 99 * HOUR_MS, pendingCount: 0, thresholdMs: THRESHOLD, alarmState: null});
        expect(r.stalled).toBe(false);
    });
});

/**
 * Integration: drive the watchdog lane through the real `runSchedulingPipeline` execute branch with
 * injected collaborators, asserting the dual alarm (passive `recordTaskOutcome` + active one-shot
 * dispatcher) end-to-end. The WAL is a temp-dir fixture; the alarm dispatcher is a spy.
 */
test.describe('orchestrator/scheduling/embedDrainLivenessWatchdog — pipeline integration (#13551)', () => {
    let walDir;

    test.beforeEach(async () => {
        walDir = await mkdtemp(path.join(os.tmpdir(), 'neo-embed-drain-watchdog-pipeline-'));
    });

    test.afterEach(async () => {
        await rm(walDir, {recursive: true, force: true});
    });

    /** Minimal task-state service with a single live envelope for the watchdog lane. */
    function makeTaskStateService(initialLaneState = {}) {
        const taskState = {'embed-drain-liveness-watchdog': {running: false, lastRunAt: 0, ...initialLaneState}};
        return {
            taskState,
            getState() { return taskState; },
            getTaskState(name) { return taskState[name]; },
            markStarted(name) { taskState[name].running = true; taskState[name].lastRunAt = Date.now(); },
            markCompleted(name) { taskState[name].running = false; },
            markFailed(name) { taskState[name].running = false; }
        };
    }

    function makeServices({taskStateService, outcomes, dispatcher}) {
        return {
            healthService: {
                recordTaskOutcome(taskName, status, details) { outcomes.push({taskName, status, details}); }
            },
            maintenanceBackpressureService: {
                getActiveHeavyMaintenanceTask() { return null; },
                isHeavyMaintenanceTask() { return false; },
                isHeavyMaintenanceConflict() { return false; },
                recordDeferral() {}
            },
            taskStateService,
            embedDrainLivenessAlarmDispatcher: dispatcher
        };
    }

    function makeRuntime(overrides = {}) {
        return {
            embedDrainLivenessWatchdogWalDir      : walDir,
            embedDrainLivenessWatchdogThresholdMs : 6 * HOUR_MS,
            embedDrainLivenessWatchdogAlarmEnabled: true,
            writeLog                              : () => {},
            ...overrides
        };
    }

    /** Runs exactly the watchdog lane through the pipeline (it is the only due candidate). */
    async function runWatchdogOnce({taskStateService, outcomes, dispatcher, runtime}) {
        const context = buildSchedulingContext({
            db   : {},
            state: taskStateService.getState(),
            now  : Date.now(),
            // Only the watchdog cadence is enabled; force it due via a huge elapsed window.
            intervals: {embedDrainLivenessWatchdogCheck: 1},
            enables  : {},
            hooks    : {}
        });

        runSchedulingPipeline({
            registry: [
                (await import('../../../../../../../ai/daemons/orchestrator/scheduling/registry.mjs')).TASK_REGISTRY
                    .find(d => d.taskName === 'embed-drain-liveness-watchdog')
            ],
            context,
            services: makeServices({taskStateService, outcomes, dispatcher}),
            runtime
        });

        // The execute branch is async; allow its microtasks to settle.
        await new Promise(resolve => setTimeout(resolve, 20));
    }

    test('(c) a stalled backlog records a failed outcome AND fires the one-shot alarm', async () => {
        const now = Date.now();
        await appendWalMemory(record('m-stale', now - 8 * HOUR_MS), {dir: walDir}); // 8h > 6h threshold

        const outcomes = [];
        const alarmCalls = [];
        const dispatcher = async payload => { alarmCalls.push(payload); };
        const taskStateService = makeTaskStateService();

        await runWatchdogOnce({taskStateService, outcomes, dispatcher, runtime: makeRuntime()});

        const failed = outcomes.find(o => o.status === 'failed');
        expect(failed, 'a failed outcome was recorded').toBeTruthy();
        expect(failed.details.pendingCount).toBe(1);
        expect(failed.details.ageMs).toBeGreaterThanOrEqual(8 * HOUR_MS);

        expect(alarmCalls).toHaveLength(1);
        expect(alarmCalls[0].pendingCount).toBe(1);
        expect(alarmCalls[0].thresholdMs).toBe(6 * HOUR_MS);
        expect(typeof alarmCalls[0].stalledSince).toBe('number');

        // Latch is set so a subsequent stalled check will not re-alarm.
        expect(taskStateService.getTaskState('embed-drain-liveness-watchdog').embedDrainAlarm.alarmed).toBe(true);
    });

    test('(d) a fresh backlog records a completed outcome and fires NO alarm', async () => {
        const now = Date.now();
        await appendWalMemory(record('m-fresh', now - 1 * HOUR_MS), {dir: walDir}); // 1h < 6h threshold

        const outcomes = [];
        const alarmCalls = [];
        const dispatcher = async payload => { alarmCalls.push(payload); };
        const taskStateService = makeTaskStateService();

        await runWatchdogOnce({taskStateService, outcomes, dispatcher, runtime: makeRuntime()});

        expect(outcomes.some(o => o.status === 'completed')).toBe(true);
        expect(outcomes.some(o => o.status === 'failed')).toBe(false);
        expect(alarmCalls).toHaveLength(0);
        expect(taskStateService.getTaskState('embed-drain-liveness-watchdog').embedDrainAlarm).toEqual({alarmed: false, stalledSince: null});
    });

    test('(e) consecutive stalled checks fire the alarm exactly once until a healthy check resets it', async () => {
        const now = Date.now();
        await appendWalMemory(record('m-stale', now - 9 * HOUR_MS), {dir: walDir});

        const outcomes = [];
        const alarmCalls = [];
        const dispatcher = async payload => { alarmCalls.push(payload); };
        const taskStateService = makeTaskStateService();
        const runtime = makeRuntime();

        // Two consecutive stalled checks → ONE alarm (one-shot latch).
        await runWatchdogOnce({taskStateService, outcomes, dispatcher, runtime});
        await runWatchdogOnce({taskStateService, outcomes, dispatcher, runtime});
        expect(alarmCalls).toHaveLength(1);

        // Drain recovers: empty the backlog → healthy check clears the latch (no new alarm).
        await rm(walDir, {recursive: true, force: true});
        walDir = await mkdtemp(path.join(os.tmpdir(), 'neo-embed-drain-watchdog-pipeline-'));
        const healthyRuntime = makeRuntime();
        await runWatchdogOnce({taskStateService, outcomes, dispatcher, runtime: healthyRuntime});
        expect(alarmCalls).toHaveLength(1);
        expect(taskStateService.getTaskState('embed-drain-liveness-watchdog').embedDrainAlarm.alarmed).toBe(false);

        // A NEW stall re-alarms (latch was cleared by the healthy check).
        await appendWalMemory(record('m-stale-2', Date.now() - 9 * HOUR_MS), {dir: walDir});
        await runWatchdogOnce({taskStateService, outcomes, dispatcher, runtime: makeRuntime()});
        expect(alarmCalls).toHaveLength(2);
    });

    test('(d/gate) alarm is suppressed when embedDaemonEnabled is false (no local drainer to blame)', async () => {
        const now = Date.now();
        await appendWalMemory(record('m-stale', now - 8 * HOUR_MS), {dir: walDir});

        const outcomes = [];
        const alarmCalls = [];
        const dispatcher = async payload => { alarmCalls.push(payload); };
        const taskStateService = makeTaskStateService();

        await runWatchdogOnce({
            taskStateService, outcomes, dispatcher,
            runtime: makeRuntime({embedDrainLivenessWatchdogAlarmEnabled: false})
        });

        // The passive health record still fires (observability), but the active alarm does not.
        expect(outcomes.some(o => o.status === 'failed')).toBe(true);
        expect(alarmCalls).toHaveLength(0);
    });

    test('(f) a health-service that throws does NOT propagate and fires no alarm', async () => {
        const now = Date.now();
        await appendWalMemory(record('m-stale', now - 8 * HOUR_MS), {dir: walDir});

        const alarmCalls = [];
        const dispatcher = async payload => { alarmCalls.push(payload); };
        const taskStateService = makeTaskStateService();

        const services = {
            healthService                 : { recordTaskOutcome() { throw new Error('health record blew up'); } },
            maintenanceBackpressureService: {
                getActiveHeavyMaintenanceTask() { return null; },
                isHeavyMaintenanceTask() { return false; },
                isHeavyMaintenanceConflict() { return false; },
                recordDeferral() {}
            },
            taskStateService,
            embedDrainLivenessAlarmDispatcher: dispatcher
        };

        const context = buildSchedulingContext({
            db       : {}, state: taskStateService.getState(), now: Date.now(),
            intervals: {embedDrainLivenessWatchdogCheck: 1}, enables: {}, hooks: {}
        });

        const registry = [
            (await import('../../../../../../../ai/daemons/orchestrator/scheduling/registry.mjs')).TASK_REGISTRY
                .find(d => d.taskName === 'embed-drain-liveness-watchdog')
        ];

        // Must not throw, even though recordTaskOutcome throws inside the runner.
        await expect((async () => {
            runSchedulingPipeline({registry, context, services, runtime: makeRuntime()});
            await new Promise(resolve => setTimeout(resolve, 20));
        })()).resolves.toBeUndefined();
    });
});
