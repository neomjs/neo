import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES,
    DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES,
    MaintenanceBackpressureService,
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

test.describe('Neo.ai.daemons.orchestrator.services.MaintenanceBackpressureService', () => {

    // ====================================================================
    // Constants — pin the canonical heavy + golden-path classification sets
    // ====================================================================

    test('DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES pins the canonical heavy-classification set', () => {
        expect([...DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES].sort()).toEqual([
            'backup',
            'dream',
            'graphlog-compaction',
            'kbSync',
            'memory-summary-backfill',
            'primary-dev-sync',
            'summary'
        ].sort());
        expect(Object.isFrozen(DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES)).toBe(true);
        // Golden Path is light maintenance and must NOT be in the heavy-maintenance set.
        expect(DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES).not.toContain('golden-path');
    });

    test('DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES pins the dependency set', () => {
        expect([...DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES]).toEqual(['dream']);
        expect(Object.isFrozen(DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES)).toBe(true);
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
            taskName                 : 'golden-path',
            heavyMaintenanceTaskNames: DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES
        })).toBe(false);
    });

    test('isGoldenPathDependencyTask returns membership in dependency set', () => {
        expect(isGoldenPathDependencyTask({
            taskName                     : 'dream',
            goldenPathDependencyTaskNames: DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES
        })).toBe(true);
        expect(isGoldenPathDependencyTask({
            taskName                     : 'summary',
            goldenPathDependencyTaskNames: DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES
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

    test('getActiveGoldenPathDependencyTask prioritizes activeTaskName when it is a dependency', () => {
        const taskStateService = buildTaskStateService({});

        // activeTaskName is a dependency → returned without consulting state
        expect(getActiveGoldenPathDependencyTask({
            goldenPathDependencyTaskNames: DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES,
            taskStateService,
            activeTaskName               : 'dream'
        })).toBe('dream');

        // activeTaskName is NOT a dependency → fall back to state scan
        expect(getActiveGoldenPathDependencyTask({
            goldenPathDependencyTaskNames: DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES,
            taskStateService             : buildTaskStateService({['dream']: {running: true}}),
            activeTaskName               : 'summary'
        })).toBe('dream');

        // No dependency running, no active dependency → null
        expect(getActiveGoldenPathDependencyTask({
            goldenPathDependencyTaskNames: DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES,
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
            taskName       : 'kbSync',
            reasonCode     : 'heavy-maintenance-backpressure',
            reasonText     : 'periodic-sync:1800000',
            blockingTaskName: 'summary',
            taskDefinitions: {summary: {label: 'Sunset summary'}, kbSync: {label: 'KB sync'}},
            writeLog,
            healthService
        });
        // Repeat — must dedupe the log line but still emit an outcome each time
        recordDeferral({
            deferralLogKeys,
            taskName       : 'kbSync',
            reasonCode     : 'heavy-maintenance-backpressure',
            reasonText     : 'periodic-sync:1800000',
            blockingTaskName: 'summary',
            taskDefinitions: {summary: {label: 'Sunset summary'}, kbSync: {label: 'KB sync'}},
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
            taskName       : 'golden-path',
            reasonCode     : 'golden-path-dependency-backpressure',
            reasonText     : `periodic-golden-path:1800000`,
            blockingTaskName: 'dream',
            taskDefinitions: {
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
            taskName       : 'kbSync',
            reasonCode     : 'heavy-maintenance-backpressure',
            reasonText     : 'periodic-sync',
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
        const result = service.acquireLeaseAndExecute({
            taskName       : NON_HEAVY_TASK_NAME,
            executeFn      : (taskName, reason) => { executions.push({taskName, reason}); return true; },
            reason         : 'periodic-heartbeat',
            activeHeavyTask
        });

        expect(acquireCalls.length).toBe(0);
        expect(executions).toEqual([{taskName: NON_HEAVY_TASK_NAME, reason: 'periodic-heartbeat'}]);
        expect(result).toBe(true);
        expect(activeHeavyTask.name).toBeNull();
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
        const result = service.acquireLeaseAndExecute({
            taskName       : 'kbSync',
            executeFn      : () => { throw new Error('should not execute'); },
            reason         : 'periodic-sync',
            activeHeavyTask
        });

        expect(result).toBe(false);
        expect(outcomeCalls[0].s).toBe('skipped');
        expect(outcomeCalls[0].p.reasonCode).toBe('heavy-maintenance-backpressure');
        expect(outcomeCalls[0].p.blockingTaskName).toBe('summary');
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
        const result = service.acquireLeaseAndExecute({
            taskName       : 'backup',
            executeFn      : () => { throw new Error('should not execute'); },
            reason         : 'periodic-sweep',
            activeHeavyTask
        });

        expect(result).toBe(false);
        expect(outcomeCalls[0].p.reasonCode).toBe('heavy-maintenance-lease-held');
        expect(outcomeCalls[0].p.holdingOwner).toBe('sandman');
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
        const result = service.acquireLeaseAndExecute({
            taskName       : 'kbSync',
            executeFn      : () => false, // task self-declined → still must release
            reason         : 'periodic-sync',
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
        const result = service.acquireLeaseAndExecute({
            taskName       : 'kbSync',
            executeFn      : async () => 'work-done',
            reason         : 'periodic-sync',
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
            taskStateService: buildTaskStateService({['dream']: {running: true}}),
            healthService   : {recordTaskOutcome: (t, s, p) => outcomeCalls.push({t, s, p})}
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
