import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    DEFAULT_COMPATIBLE_HEAVY_MAINTENANCE_TASK_PAIRS,
    DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES,
    DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES,
    MaintenanceBackpressureService,
    areHeavyMaintenanceTasksCompatible,
    clearDeferralLogState,
    getActiveGoldenPathDependencyTask,
    getActiveHeavyMaintenanceTask,
    isGoldenPathDependencyTask,
    isHeavyMaintenanceTask,
    recordDeferral,
    resolveHeavyMaintenanceLeasePath
} from '../../../../../../../ai/daemons/orchestrator/services/MaintenanceBackpressureService.mjs';

// A non-heavy task name (must NOT be in DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES) for
// passthrough tests of `acquireLeaseAndExecute`.
const NON_HEAVY_TASK_NAME = 'swarm-heartbeat';

/**
 * Builds a minimal `taskStateService`-shaped stub for predicate / finder tests.
 * @param {Object} stateByTaskName Map of taskName → state-object.
 * @returns {Object}
 */
function buildTaskStateService(stateByTaskName = {}) {
    return {
        getTaskState(name) {
            return stateByTaskName[name] || null;
        }
    };
}

/**
 * Builds a fresh `MaintenanceBackpressureService` instance per test with safe defaults
 * and the supplied overrides. Avoids singleton state contamination across tests.
 *
 * @param {Object} [overrides] Config overrides.
 * @returns {MaintenanceBackpressureService}
 */
function buildService(overrides = {}) {
    return Neo.create(MaintenanceBackpressureService, {
        heavyMaintenanceTaskNames    : DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES,
        goldenPathDependencyTaskNames: DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES,
        writeLog                     : () => {},
        ...overrides
    });
}

// Explicit fixture for the compatible-pair MECHANISM tests. DEFAULT_COMPATIBLE_HEAVY_MAINTENANCE_TASK_PAIRS
// is now empty — the kbSync/backfill pair raced on the inherited-lease-token bypass and skipped KB
// embedding — so the mechanism is exercised here with an explicit pair rather than the live default.
const COMPATIBLE_PAIRS_FIXTURE = [['kbSync', 'memory-summary-backfill']];

// Explicit fixture for the golden-path dependency-gate MECHANISM tests. DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES
// is now empty — Golden Path is decoupled from `dream` so the hourly re-rank is not frozen behind the
// multi-hour REM digest — so the gate mechanism is exercised here with an explicit dependency, not the default.
const GOLDEN_PATH_DEPS_FIXTURE = Object.freeze(['dream']);

test.describe('Neo.ai.daemons.orchestrator.services.MaintenanceBackpressureService', () => {

    // ====================================================================
    // Constants — pin the canonical heavy + golden-path classification sets
    // ====================================================================

    test('DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES pins the canonical heavy-classification set', () => {
        expect([...DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES].sort()).toEqual([
            'backup',
            'dream',
            'githubWorkflowSync',
            'graphlog-compaction',
            'kbSync',
            'memory-summary-backfill',
            'message-concept-harvest',
            'primary-dev-sync',
            'tenant-repo-sync',
            'summary'
        ].sort());
        expect(Object.isFrozen(DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES)).toBe(true);
        // Golden Path is light maintenance and must NOT be in the heavy-maintenance set.
        expect(DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES).not.toContain('golden-path');
    });

    test('DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES is EMPTY — Golden Path decoupled from dream for hourly freshness', () => {
        // Golden Path reads the CURRENT graph (not the dream digest), so it must not block behind the
        // multi-hour REM digest — that coupling froze the forecast for days. The gate stays a reactive
        // config leaf so a deployment can re-introduce a write-completion dependency if a store needs it.
        expect([...DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES]).toEqual([]);
        expect(Object.isFrozen(DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES)).toBe(true);
    });

    test('DEFAULT_COMPATIBLE_HEAVY_MAINTENANCE_TASK_PAIRS is EMPTY — heavy maintenance fully serialized', () => {
        // The prior ['kbSync','memory-summary-backfill'] pair raced on the inherited-lease-token bypass
        // (parent released before the kb-sync child booted → kb-sync skipped syncDatabase → multi-day
        // embedding stall). Serialized until a race-free handshake replaces the bypass.
        expect(DEFAULT_COMPATIBLE_HEAVY_MAINTENANCE_TASK_PAIRS).toEqual([]);
        expect(Object.isFrozen(DEFAULT_COMPATIBLE_HEAVY_MAINTENANCE_TASK_PAIRS)).toBe(true);
    });

    // ====================================================================
    // Group 1 — Pure predicates + finders
    // ====================================================================

    test('isHeavyMaintenanceTask returns membership in heavy set', () => {
        expect(isHeavyMaintenanceTask({
            taskName                 : 'summary',
            heavyMaintenanceTaskNames: DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES
        })).toBe(true);
        expect(isHeavyMaintenanceTask({
            taskName                 : 'tenant-repo-sync',
            heavyMaintenanceTaskNames: DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES
        })).toBe(true);
        expect(isHeavyMaintenanceTask({
            taskName                 : 'golden-path',
            heavyMaintenanceTaskNames: DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES
        })).toBe(false);
    });

    test('isGoldenPathDependencyTask returns membership in dependency set', () => {
        expect(isGoldenPathDependencyTask({
            taskName                     : 'dream',
            goldenPathDependencyTaskNames: GOLDEN_PATH_DEPS_FIXTURE
        })).toBe(true);
        expect(isGoldenPathDependencyTask({
            taskName                     : 'summary',
            goldenPathDependencyTaskNames: GOLDEN_PATH_DEPS_FIXTURE
        })).toBe(false);
    });

    test('areHeavyMaintenanceTasksCompatible is symmetric and deny-by-default', () => {
        expect(areHeavyMaintenanceTasksCompatible({
            taskName                           : 'kbSync',
            otherTaskName                      : 'memory-summary-backfill',
            compatibleHeavyMaintenanceTaskPairs: COMPATIBLE_PAIRS_FIXTURE
        })).toBe(true);
        expect(areHeavyMaintenanceTasksCompatible({
            taskName                           : 'memory-summary-backfill',
            otherTaskName                      : 'kbSync',
            compatibleHeavyMaintenanceTaskPairs: COMPATIBLE_PAIRS_FIXTURE
        })).toBe(true);
        expect(areHeavyMaintenanceTasksCompatible({
            taskName                           : 'summary',
            otherTaskName                      : 'kbSync',
            compatibleHeavyMaintenanceTaskPairs: COMPATIBLE_PAIRS_FIXTURE
        })).toBe(false);
        expect(areHeavyMaintenanceTasksCompatible({
            taskName                           : 'kbSync',
            otherTaskName                      : 'kbSync',
            compatibleHeavyMaintenanceTaskPairs: COMPATIBLE_PAIRS_FIXTURE
        })).toBe(false);
    });

    test('getActiveHeavyMaintenanceTask returns first running heavy task, honors exclude', () => {
        const taskStateService = buildTaskStateService({
            summary: {running: true},
            kbSync : {running: true}
        });

        expect(getActiveHeavyMaintenanceTask({
            heavyMaintenanceTaskNames: DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES,
            taskStateService
        })).toBe('summary');

        expect(getActiveHeavyMaintenanceTask({
            heavyMaintenanceTaskNames: DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES,
            taskStateService,
            excludeTaskName          : 'summary'
        })).toBe('kbSync');

        expect(getActiveHeavyMaintenanceTask({
            heavyMaintenanceTaskNames: DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES,
            taskStateService         : buildTaskStateService({})
        })).toBeNull();
    });

    test('getActiveHeavyMaintenanceTask ignores compatible running heavy task for a candidate', () => {
        expect(getActiveHeavyMaintenanceTask({
            heavyMaintenanceTaskNames          : DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES,
            taskStateService                   : buildTaskStateService({kbSync: {running: true}}),
            candidateTaskName                  : 'memory-summary-backfill',
            compatibleHeavyMaintenanceTaskPairs: COMPATIBLE_PAIRS_FIXTURE
        })).toBeNull();

        expect(getActiveHeavyMaintenanceTask({
            heavyMaintenanceTaskNames          : DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES,
            taskStateService                   : buildTaskStateService({summary: {running: true}, kbSync: {running: true}}),
            candidateTaskName                  : 'memory-summary-backfill',
            compatibleHeavyMaintenanceTaskPairs: COMPATIBLE_PAIRS_FIXTURE
        })).toBe('summary');
    });

    test('getActiveGoldenPathDependencyTask prioritizes activeTaskName when it is a dependency', () => {
        const taskStateService = buildTaskStateService({});

        // activeTaskName is a dependency → returned without consulting state
        expect(getActiveGoldenPathDependencyTask({
            goldenPathDependencyTaskNames: GOLDEN_PATH_DEPS_FIXTURE,
            taskStateService,
            activeTaskName               : 'dream'
        })).toBe('dream');

        // activeTaskName is NOT a dependency → fall back to state scan
        expect(getActiveGoldenPathDependencyTask({
            goldenPathDependencyTaskNames: GOLDEN_PATH_DEPS_FIXTURE,
            taskStateService             : buildTaskStateService({['dream']: {running: true}}),
            activeTaskName               : 'summary'
        })).toBe('dream');

        // No dependency running, no active dependency → null
        expect(getActiveGoldenPathDependencyTask({
            goldenPathDependencyTaskNames: GOLDEN_PATH_DEPS_FIXTURE,
            taskStateService             : buildTaskStateService({})
        })).toBeNull();
    });

    test('resolveHeavyMaintenanceLeasePath honors explicit override before dataDir fallback', () => {
        expect(resolveHeavyMaintenanceLeasePath({
            heavyMaintenanceLeasePath: '/tmp/explicit.json',
            dataDir                  : '/ignored'
        })).toBe('/tmp/explicit.json');

        expect(resolveHeavyMaintenanceLeasePath({
            heavyMaintenanceLeasePath: null,
            dataDir                  : '/data/orch'
        })).toBe('/data/orch/heavy-maintenance-lease.json');

        // dataDir missing falls back to DEFAULT_DATA_DIR
        const result = resolveHeavyMaintenanceLeasePath({heavyMaintenanceLeasePath: null, dataDir: null});
        expect(result.endsWith('heavy-maintenance-lease.json')).toBe(true);
    });

    // ====================================================================
    // Group 2 — Pure deferral recording (polymorphic on reasonCode)
    // ====================================================================

    test('clearDeferralLogState removes only keys prefixed with taskName', () => {
        const deferralLogKeys = new Set(['summary:kbSync:r1', 'summary:dream:r2', 'kbSync:summary:r3']);
        clearDeferralLogState({deferralLogKeys, taskName: 'summary'});

        expect([...deferralLogKeys]).toEqual(['kbSync:summary:r3']);
    });

    test('recordDeferral (intra-process heavy backpressure) dedupes + emits skipped outcome', () => {
        const deferralLogKeys = new Set();
        const logCalls        = [];
        const outcomeCalls    = [];
        const writeLog        = (level, message) => logCalls.push({level, message});
        const healthService   = {
            recordTaskOutcome(taskName, status, payload) {
                outcomeCalls.push({taskName, status, payload});
            }
        };

        recordDeferral({
            deferralLogKeys,
            taskName        : 'kbSync',
            reasonCode      : 'heavy-maintenance-backpressure',
            reasonText      : 'periodic-sync:1800000',
            blockingTaskName: 'summary',
            taskDefinitions : {summary: {label: 'Sunset summary'}, kbSync: {label: 'KB sync'}},
            writeLog,
            healthService
        });
        // Repeat — must dedupe the log line but still emit an outcome each time
        recordDeferral({
            deferralLogKeys,
            taskName        : 'kbSync',
            reasonCode      : 'heavy-maintenance-backpressure',
            reasonText      : 'periodic-sync:1800000',
            blockingTaskName: 'summary',
            taskDefinitions : {summary: {label: 'Sunset summary'}, kbSync: {label: 'KB sync'}},
            writeLog,
            healthService
        });

        expect(logCalls.length).toBe(1);
        expect(logCalls[0].level).toBe('INFO');
        expect(logCalls[0].message).toContain('Deferring KB sync');
        expect(logCalls[0].message).toContain('Sunset summary is active');
        expect(logCalls[0].message).toContain('periodic-sync:1800000');

        expect(outcomeCalls.length).toBe(2);
        expect(outcomeCalls[0]).toMatchObject({
            taskName: 'kbSync',
            status  : 'skipped',
            payload : {
                reason          : 'periodic-sync:1800000',
                reasonCode      : 'heavy-maintenance-backpressure',
                blockingTaskName: 'summary'
            }
        });
        expect(outcomeCalls[0].payload.deferredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('recordDeferral dedupes across a CHANGING reasonText counter (the volatile-backlog flood fix)', () => {
        const deferralLogKeys = new Set();
        const logCalls        = [];
        const writeLog        = (level, message) => logCalls.push({level, message});
        const taskDefinitions = {kbSync: {label: 'KB sync'}, 'memory-summary-backfill': {label: 'memory miniSummary backfill'}};

        // The memorySummaryBackfill backlog counter changes every poll. The dedup key is keyed on
        // (task, blocker, reasonCode) — NOT the volatile reasonText — so the changing count never
        // churns it and the deferral logs once per episode (not the live ~8%-of-lines flood).
        for (const backlog of [47, 48, 49, 50]) {
            recordDeferral({
                deferralLogKeys,
                taskName        : 'memory-summary-backfill',
                reasonCode      : 'heavy-maintenance-backpressure',
                reasonText      : `pending-memory-minisummary:${backlog}`,
                blockingTaskName: 'kbSync',
                taskDefinitions,
                writeLog
            });
        }

        // Four polls with a changing counter → ONE log line (the dedup now holds on the stable key).
        expect(logCalls.length).toBe(1);
        expect(logCalls[0].message).toContain('Deferring memory miniSummary backfill');
        expect(logCalls[0].message).toContain('pending-memory-minisummary:47'); // first episode's live count stays in the message

        // A new deferral episode after the prior one clears → re-logs exactly once.
        clearDeferralLogState({deferralLogKeys, taskName: 'memory-summary-backfill'});
        recordDeferral({
            deferralLogKeys,
            taskName        : 'memory-summary-backfill',
            reasonCode      : 'heavy-maintenance-backpressure',
            reasonText      : 'pending-memory-minisummary:51',
            blockingTaskName: 'kbSync',
            taskDefinitions,
            writeLog
        });
        expect(logCalls.length).toBe(2);
    });

    test('recordDeferral (cross-daemon lease-held) uses holdingLease owner in key + payload', () => {
        const deferralLogKeys = new Set();
        const logCalls        = [];
        const outcomeCalls    = [];

        recordDeferral({
            deferralLogKeys,
            taskName     : 'backup',
            reasonCode   : 'heavy-maintenance-lease-held',
            reasonText   : 'periodic-sweep:86400000',
            holdingLease : {owner: 'sandman', pid: 4242},
            writeLog     : (level, message) => logCalls.push({level, message}),
            healthService: {recordTaskOutcome: (taskName, status, payload) => outcomeCalls.push({taskName, status, payload})}
        });

        expect(logCalls[0].message).toContain('cross-daemon heavy-maintenance lease held by sandman');
        expect(outcomeCalls[0].payload).toMatchObject({
            reason      : 'periodic-sweep:86400000',
            reasonCode  : 'heavy-maintenance-lease-held',
            holdingOwner: 'sandman',
            holdingPid  : 4242
        });
        expect(outcomeCalls[0].payload.blockingTaskName).toBeUndefined();

        // Same task + different owner → distinct key, distinct log
        recordDeferral({
            deferralLogKeys,
            taskName     : 'backup',
            reasonCode   : 'heavy-maintenance-lease-held',
            reasonText   : 'periodic-sweep:86400000',
            holdingLease : {owner: 'kbSync', pid: 7777},
            writeLog     : (level, message) => logCalls.push({level, message}),
            healthService: {recordTaskOutcome: (taskName, status, payload) => outcomeCalls.push({taskName, status, payload})}
        });
        expect(logCalls.length).toBe(2);
    });

    test('recordDeferral (golden-path dependency backpressure) labels dependency task in log', () => {
        const deferralLogKeys = new Set();
        const logCalls        = [];

        recordDeferral({
            deferralLogKeys,
            taskName        : 'golden-path',
            reasonCode      : 'golden-path-dependency-backpressure',
            reasonText      : `periodic-golden-path:1800000`,
            blockingTaskName: 'dream',
            taskDefinitions : {
                ['golden-path']: {label: 'Golden Path'},
                ['dream']      : {label: 'Dream cycle'}
            },
            writeLog: (level, message) => logCalls.push({level, message})
        });

        expect(logCalls[0].message).toContain('Deferring Golden Path');
        expect(logCalls[0].message).toContain('dependency task Dream cycle is active');
    });

    test('recordDeferral handles missing healthService gracefully', () => {
        const deferralLogKeys = new Set();
        // No healthService → must not throw
        expect(() => recordDeferral({
            deferralLogKeys,
            taskName        : 'kbSync',
            reasonCode      : 'heavy-maintenance-backpressure',
            reasonText      : 'periodic-sync',
            blockingTaskName: 'summary'
        })).not.toThrow();
    });

    // ====================================================================
    // Group 3 — Executor wrappers (Neo-class integration tests with stubs)
    // ====================================================================

    test('acquireLeaseAndExecute passes through non-heavy tasks without lease IO', () => {
        const acquireCalls = [];
        const executions   = [];
        const service      = buildService({
            heavyMaintenanceTaskNames: DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES,
            taskStateService         : buildTaskStateService({}),
            acquireLeaseFn           : opts => { acquireCalls.push(opts); return {acquired: true, lease: {token: 't'}}; },
            releaseLeaseFn           : () => {}
        });

        const activeHeavyTask = {name: null};
        const result          = service.acquireLeaseAndExecute({
            taskName : NON_HEAVY_TASK_NAME,
            executeFn: (taskName, reason) => { executions.push({taskName, reason}); return true; },
            reason   : 'periodic-heartbeat',
            activeHeavyTask
        });

        expect(acquireCalls.length).toBe(0);
        expect(executions).toEqual([{taskName: NON_HEAVY_TASK_NAME, reason: 'periodic-heartbeat'}]);
        expect(result).toBe(true);
        expect(activeHeavyTask.name).toBeNull();
    });

    test('acquireLeaseAndExecute runs tenant-repo-sync through the heavy lease', () => {
        const acquireCalls = [];
        const releaseCalls = [];
        const executions   = [];
        const service      = buildService({
            taskStateService: buildTaskStateService({}),
            acquireLeaseFn  : opts => { acquireCalls.push(opts); return {acquired: true, lease: {token: 'tenant-token'}}; },
            releaseLeaseFn  : opts => releaseCalls.push(opts)
        });

        const activeHeavyTask = {name: null};
        const result          = service.acquireLeaseAndExecute({
            taskName : 'tenant-repo-sync',
            executeFn: (taskName, reason, onSuccess, taskOptions) => {
                executions.push({taskName, reason, env: taskOptions.env});
                taskOptions.onComplete?.();
                return true;
            },
            reason: 'periodic-tenant-repo-sync',
            activeHeavyTask
        });

        expect(result).toBe(true);
        expect(acquireCalls).toHaveLength(1);
        expect(executions).toEqual([{
            taskName: 'tenant-repo-sync',
            reason  : 'periodic-tenant-repo-sync',
            env     : {NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN: 'tenant-token'}
        }]);
        expect(releaseCalls).toHaveLength(1);
        expect(activeHeavyTask.name).toBe('tenant-repo-sync');
    });

    test('Sub 9 hypothesis 4: acquireLeaseAndExecute records intra-process backpressure as skipped (#12617)', () => {
        const outcomeCalls = [];
        const service      = buildService({
            taskStateService: buildTaskStateService({summary: {running: true}}),
            healthService   : {recordTaskOutcome: (t, s, p) => outcomeCalls.push({t, s, p})},
            acquireLeaseFn  : () => { throw new Error('should not acquire'); },
            releaseLeaseFn  : () => {}
        });

        const activeHeavyTask = {name: 'summary'};
        const result          = service.acquireLeaseAndExecute({
            taskName : 'kbSync',
            executeFn: () => { throw new Error('should not execute'); },
            reason   : 'periodic-sync',
            activeHeavyTask
        });

        expect(result).toBe(false);
        expect(outcomeCalls[0].s).toBe('skipped');
        expect(outcomeCalls[0].p.reasonCode).toBe('heavy-maintenance-backpressure');
        expect(outcomeCalls[0].p.blockingTaskName).toBe('summary');
    });

    test('acquireLeaseAndExecute allows memory-summary-backfill behind active kbSync (#13358)', () => {
        const outcomeCalls = [];
        const executions   = [];
        const service      = buildService({
            taskStateService                   : buildTaskStateService({kbSync: {running: true}}),
            healthService                      : {recordTaskOutcome: (t, s, p) => outcomeCalls.push({t, s, p})},
            acquireLeaseFn                     : () => ({acquired: true, lease: {token: 'memory-token'}}),
            releaseLeaseFn                     : () => {},
            compatibleHeavyMaintenanceTaskPairs: COMPATIBLE_PAIRS_FIXTURE
        });

        const activeHeavyTask = {name: 'kbSync'};
        const result          = service.acquireLeaseAndExecute({
            taskName : 'memory-summary-backfill',
            executeFn: (taskName, reason, onSuccess, taskOptions) => {
                executions.push({taskName, reason, env: taskOptions.env});
                return true;
            },
            reason: 'pending-memory-minisummary:3647',
            activeHeavyTask
        });

        expect(result).toBe(true);
        expect(executions).toEqual([{
            taskName: 'memory-summary-backfill',
            reason  : 'pending-memory-minisummary:3647',
            env     : {NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN: 'memory-token'}
        }]);
        expect(outcomeCalls).toEqual([]);
        expect(activeHeavyTask.name).toBe('memory-summary-backfill');
    });

    test('Sub 9 hypotheses 4 and 5: acquireLeaseAndExecute records held lease as skipped (#12617)', () => {
        const outcomeCalls = [];
        const service      = buildService({
            taskStateService: buildTaskStateService({}),
            healthService   : {recordTaskOutcome: (t, s, p) => outcomeCalls.push({t, s, p})},
            acquireLeaseFn  : () => ({acquired: false, lease: {owner: 'sandman', pid: 99}}),
            releaseLeaseFn  : () => {}
        });

        const activeHeavyTask = {name: null};
        const result          = service.acquireLeaseAndExecute({
            taskName : 'backup',
            executeFn: () => { throw new Error('should not execute'); },
            reason   : 'periodic-sweep',
            activeHeavyTask
        });

        expect(result).toBe(false);
        expect(outcomeCalls[0].p.reasonCode).toBe('heavy-maintenance-lease-held');
        expect(outcomeCalls[0].p.holdingOwner).toBe('sandman');
    });

    test('acquireLeaseAndExecute allows memory-summary-backfill when compatible kbSync owns the lease (#13358)', () => {
        const outcomeCalls = [];
        const executions   = [];
        const releases     = [];
        const service      = buildService({
            taskStateService                   : buildTaskStateService({}),
            healthService                      : {recordTaskOutcome: (t, s, p) => outcomeCalls.push({t, s, p})},
            acquireLeaseFn                     : () => ({acquired: false, lease: {owner: 'kbSync', pid: 77}}),
            releaseLeaseFn                     : opts => releases.push(opts),
            compatibleHeavyMaintenanceTaskPairs: COMPATIBLE_PAIRS_FIXTURE
        });

        const activeHeavyTask = {name: null};
        const result          = service.acquireLeaseAndExecute({
            taskName : 'memory-summary-backfill',
            executeFn: (taskName, reason, onSuccess, taskOptions) => {
                executions.push({taskName, reason, env: taskOptions.env});
                return true;
            },
            reason: 'pending-memory-minisummary:3647',
            activeHeavyTask
        });

        expect(result).toBe(true);
        expect(executions).toEqual([{
            taskName: 'memory-summary-backfill',
            reason  : 'pending-memory-minisummary:3647',
            env     : {}
        }]);
        expect(outcomeCalls).toEqual([]);
        expect(releases).toEqual([]);
        expect(activeHeavyTask.name).toBe('memory-summary-backfill');
    });

    test('acquireLeaseAndExecute records failure outcome on lease-acquire throw', () => {
        const outcomeCalls = [];
        const service      = buildService({
            taskStateService: buildTaskStateService({}),
            healthService   : {recordTaskOutcome: (t, s, p) => outcomeCalls.push({t, s, p})},
            acquireLeaseFn  : () => { throw new Error('disk full'); },
            releaseLeaseFn  : () => {}
        });

        const result = service.acquireLeaseAndExecute({
            taskName       : 'kbSync',
            executeFn      : () => { throw new Error('should not execute'); },
            reason         : 'periodic-sync',
            activeHeavyTask: {name: null}
        });

        expect(result).toBe(false);
        expect(outcomeCalls[0].s).toBe('failed');
        expect(outcomeCalls[0].p.reasonCode).toBe('heavy-maintenance-lease-acquire-error');
        expect(outcomeCalls[0].p.error).toBe('disk full');
    });

    test('acquireLeaseAndExecute acquires + executes + releases on synchronous false return', () => {
        const releases = [];
        const service  = buildService({
            taskStateService: buildTaskStateService({}),
            acquireLeaseFn  : () => ({acquired: true, lease: {token: 'tok-1'}}),
            releaseLeaseFn  : opts => releases.push(opts.token)
        });

        const activeHeavyTask = {name: null};
        const result          = service.acquireLeaseAndExecute({
            taskName : 'kbSync',
            executeFn: () => false, // task self-declined → still must release
            reason   : 'periodic-sync',
            activeHeavyTask
        });

        expect(result).toBe(false);
        expect(releases).toEqual(['tok-1']);
        // false result → activeHeavyTask.name unchanged
        expect(activeHeavyTask.name).toBeNull();
    });

    test('acquireLeaseAndExecute releases on async settle (fulfill)', async () => {
        const releases = [];
        const service  = buildService({
            taskStateService: buildTaskStateService({}),
            acquireLeaseFn  : () => ({acquired: true, lease: {token: 'tok-2'}}),
            releaseLeaseFn  : opts => releases.push(opts.token)
        });

        const activeHeavyTask = {name: null};
        const result          = service.acquireLeaseAndExecute({
            taskName : 'kbSync',
            executeFn: async () => 'work-done',
            reason   : 'periodic-sync',
            activeHeavyTask
        });

        await result;
        expect(await result).toBe('work-done');
        expect(releases).toEqual(['tok-2']);
        expect(activeHeavyTask.name).toBe('kbSync');
    });

    test('acquireLeaseAndExecute releases on async settle (reject) without swallowing rejection', async () => {
        const releases = [];
        const service  = buildService({
            taskStateService: buildTaskStateService({}),
            acquireLeaseFn  : () => ({acquired: true, lease: {token: 'tok-3'}}),
            releaseLeaseFn  : opts => releases.push(opts.token)
        });

        const result = service.acquireLeaseAndExecute({
            taskName       : 'kbSync',
            executeFn      : async () => { throw new Error('boom'); },
            reason         : 'periodic-sync',
            activeHeavyTask: {name: null}
        });

        await expect(result).rejects.toThrow('boom');
        expect(releases).toEqual(['tok-3']);
    });

    test('acquireLeaseAndExecute releases on synchronous throw from executeFn', () => {
        const releases = [];
        const service  = buildService({
            taskStateService: buildTaskStateService({}),
            acquireLeaseFn  : () => ({acquired: true, lease: {token: 'tok-4'}}),
            releaseLeaseFn  : opts => releases.push(opts.token)
        });

        expect(() => service.acquireLeaseAndExecute({
            taskName       : 'kbSync',
            executeFn      : () => { throw new Error('sync boom'); },
            reason         : 'periodic-sync',
            activeHeavyTask: {name: null}
        })).toThrow('sync boom');

        expect(releases).toEqual(['tok-4']);
    });

    test('executeWithGoldenPathDependencyGate defers when dependency task is running', () => {
        const outcomeCalls = [];
        const service      = buildService({
            goldenPathDependencyTaskNames: GOLDEN_PATH_DEPS_FIXTURE,
            taskStateService             : buildTaskStateService({['dream']: {running: true}}),
            healthService                : {recordTaskOutcome: (t, s, p) => outcomeCalls.push({t, s, p})}
        });

        const result = service.executeWithGoldenPathDependencyGate({
            taskName       : 'golden-path',
            executeFn      : () => { throw new Error('should not execute'); },
            reason         : 'periodic-golden-path',
            activeHeavyTask: {name: null}
        });

        expect(result).toBe(false);
        expect(outcomeCalls[0].p.reasonCode).toBe('golden-path-dependency-backpressure');
        expect(outcomeCalls[0].p.blockingTaskName).toBe('dream');
    });

    test('executeWithGoldenPathDependencyGate passes through when no dependency is running', () => {
        const executions = [];
        const service    = buildService({
            taskStateService: buildTaskStateService({})
        });

        const result = service.executeWithGoldenPathDependencyGate({
            taskName       : 'golden-path',
            executeFn      : (taskName, reason) => { executions.push({taskName, reason}); return 'gp-done'; },
            reason         : 'periodic-golden-path',
            activeHeavyTask: {name: null}
        });

        expect(executions).toEqual([{taskName: 'golden-path', reason: 'periodic-golden-path'}]);
        expect(result).toBe('gp-done');
    });
});

test.describe('MaintenanceBackpressureService — shed-window (#14284 throttle-shed actuation)', () => {
    test('setShedWindow opens an auto-expiring window; isShedActive is true within, false at/after expiry', () => {
        const svc = buildService();
        expect(svc.isShedActive(1000)).toBe(false); // no window yet
        svc.setShedWindow(500, 1000);               // shed until 1500
        expect(svc.isShedActive(1000)).toBe(true);
        expect(svc.isShedActive(1499)).toBe(true);
        expect(svc.isShedActive(1500)).toBe(false);  // strict: now < shedUntil
        expect(svc.isShedActive(9999)).toBe(false);  // auto-expired
    });

    test('max-wins on overlap — a shorter later window cannot curtail a longer active one', () => {
        const svc = buildService();
        svc.setShedWindow(1000, 1000); // until 2000
        svc.setShedWindow(100, 1200);  // until 1300 — shorter; must NOT shrink the active window
        expect(svc.shedUntil).toBe(2000);
        expect(svc.isShedActive(1900)).toBe(true);
    });

    test('a non-positive / non-finite duration is a no-op (no window opened)', () => {
        const svc = buildService();
        svc.setShedWindow(0, 1000);
        svc.setShedWindow(-5, 1000);
        svc.setShedWindow(NaN, 1000);
        expect(svc.isShedActive(1000)).toBe(false);
    });

    test('acquireLeaseAndExecute DEFERS all heavy-maintenance while the window is active (returns false, executeFn NOT called)', () => {
        const svc = buildService();
        svc.setShedWindow(1000, 1000);

        let   called = false;
        const result = svc.acquireLeaseAndExecute({
            taskName       : 'kbSync',
            executeFn      : () => { called = true; return true; },
            reason         : 'scheduled',
            activeHeavyTask: {name: null},
            now            : 1000
        });

        expect(result).toBe(false); // deferred by the shed-window
        expect(called).toBe(false); // the heavy task did NOT run — gated before the lease
    });

    test('does NOT shed a non-heavy task — light maintenance bypasses the window', () => {
        const svc = buildService();
        svc.setShedWindow(1000, 1000);

        let   called = false;
        const result = svc.acquireLeaseAndExecute({
            taskName       : NON_HEAVY_TASK_NAME,
            executeFn      : () => { called = true; return 'ran'; },
            reason         : 'scheduled',
            activeHeavyTask: {name: null},
            now            : 1000
        });

        expect(called).toBe(true);    // light task ran despite the active shed-window
        expect(result).toBe('ran');
    });
});
