import {test, expect}                         from '@playwright/test';
import {TASK_REGISTRY}                        from '../../../../../../../ai/daemons/orchestrator/scheduling/registry.mjs';
import {DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES} from '../../../../../../../ai/daemons/orchestrator/services/MaintenanceBackpressureService.mjs';

const VALID_EXECUTION_KINDS     = ['supervised-child-process', 'service-runner', 'in-process-async', 'local-only-service', 'health-check'];
const VALID_MAINTENANCE_CLASSES = ['continuous', 'heavy', 'graph-dependent', 'lightweight-signal', 'local-only', 'health-monitor'];
const VALID_BACKPRESSURE        = ['none', 'exclusive-heavy', 'after-heavy'];

test.describe('orchestrator/scheduling/registry (#11862 Sub 18)', () => {
    test('TASK_REGISTRY is a frozen array (immutability invariant)', () => {
        expect(Array.isArray(TASK_REGISTRY)).toBe(true);
        expect(Object.isFrozen(TASK_REGISTRY)).toBe(true);
    });

    test('each descriptor has the required shape', () => {
        for (const descriptor of TASK_REGISTRY) {
            expect(typeof descriptor.taskName).toBe('string');
            expect(descriptor.taskName.length).toBeGreaterThan(0);
            expect(VALID_EXECUTION_KINDS).toContain(descriptor.executionKind);
            expect(VALID_MAINTENANCE_CLASSES).toContain(descriptor.maintenanceClass);
            expect(VALID_BACKPRESSURE).toContain(descriptor.backpressure);
            expect(Array.isArray(descriptor.dependencies)).toBe(true);
            expect(typeof descriptor.getDueTask).toBe('function');
        }
    });

    test('taskName is unique across descriptors (no collision)', () => {
        const names = TASK_REGISTRY.map(d => d.taskName);
        expect(new Set(names).size).toBe(names.length);
    });

    test('dependencies reference valid taskNames (no dangling references)', () => {
        const names = new Set(TASK_REGISTRY.map(d => d.taskName));
        for (const descriptor of TASK_REGISTRY) {
            for (const dep of descriptor.dependencies) {
                expect(names).toContain(dep);
            }
        }
    });

    test('expected scheduling lanes are registered (#11862 Prescription parity)', () => {
        const names = TASK_REGISTRY.map(d => d.taskName);
        expect(names).toEqual(expect.arrayContaining([
            'summary', 'memory-summary-backfill', 'kbSync', 'githubWorkflowSync', 'backup', 'graphlog-compaction',
            'primary-dev-sync', 'tenant-repo-sync', 'dream',
            'message-concept-harvest', 'golden-path', 'swarm-heartbeat'
        ]));
    });

    test('message-concept-harvest is registered as an exclusive-heavy scheduled graph-writing lane (#13840)', () => {
        const descriptor = TASK_REGISTRY.find(d => d.taskName === 'message-concept-harvest');
        expect(descriptor, 'message-concept-harvest is registered').toBeTruthy();
        expect(descriptor.executionKind).toBe('in-process-async');
        expect(descriptor.maintenanceClass).toBe('heavy');
        expect(descriptor.backpressure).toBe('exclusive-heavy');
        expect(descriptor.dependencies).toEqual([]);
        expect(descriptor.getDueTask({
            state    : {'message-concept-harvest': {lastRunAt: 0}},
            now      : 6000,
            intervals: {messageConceptHarvest: 5000}
        })).toMatchObject({taskName: 'message-concept-harvest', source: 'periodic-message-concept-harvest'});
        expect(descriptor.getDueTask({
            state    : {'message-concept-harvest': {lastRunAt: 2000}},
            now      : 6000,
            intervals: {messageConceptHarvest: 5000}
        })).toBeNull();
    });

    test('tenant-repo-sync is registered as an exclusive-heavy cloud-ingestion lane (#14400)', () => {
        const descriptor = TASK_REGISTRY.find(d => d.taskName === 'tenant-repo-sync');
        expect(descriptor, 'tenant-repo-sync is registered').toBeTruthy();
        expect(descriptor.executionKind).toBe('service-runner');
        expect(descriptor.maintenanceClass).toBe('heavy');
        expect(descriptor.backpressure).toBe('exclusive-heavy');
        expect(descriptor.dependencies).toEqual([]);
        expect(descriptor.getDueTask({
            state    : {'tenant-repo-sync': {lastRunAt: 0}},
            now      : 6000,
            intervals: {tenantRepoSync: 5000},
            enables  : {tenantRepoSync: true},
            hooks    : {}
        })).toMatchObject({taskName: 'tenant-repo-sync'});
        expect(descriptor.getDueTask({
            state    : {'tenant-repo-sync': {lastRunAt: 2000}},
            now      : 6000,
            intervals: {tenantRepoSync: 5000},
            enables  : {tenantRepoSync: true},
            hooks    : {}
        })).toBeNull();
    });

    test('embed-drain-liveness-watchdog is registered as a read-only, no-backpressure health-check (#13551)', () => {
        const descriptor = TASK_REGISTRY.find(d => d.taskName === 'embed-drain-liveness-watchdog');
        expect(descriptor, 'embed-drain-liveness-watchdog is registered').toBeTruthy();
        expect(descriptor.executionKind).toBe('health-check');
        expect(descriptor.maintenanceClass).toBe('health-monitor');
        // Read-only lightweight check: it must never take a heavy lease or be gated by backpressure.
        expect(descriptor.backpressure).toBe('none');
        expect(descriptor.dependencies).toEqual([]);
    });

    test('rem-consolidation-liveness-watchdog is registered as a read-only, no-backpressure health-check (#13818 / ADR 0023 AC-3)', () => {
        const descriptor = TASK_REGISTRY.find(d => d.taskName === 'rem-consolidation-liveness-watchdog');
        expect(descriptor, 'rem-consolidation-liveness-watchdog is registered').toBeTruthy();
        expect(descriptor.executionKind).toBe('health-check');
        expect(descriptor.maintenanceClass).toBe('health-monitor');
        // Consolidation-side analog of the embed-drain watchdog: read-only lightweight check, so it must
        // never take a heavy lease or be gated by backpressure.
        expect(descriptor.backpressure).toBe('none');
        expect(descriptor.dependencies).toEqual([]);
        // Cadence-driven: fires on elapsed check interval, not due within it (uses the imported getDueTask
        // when no hook override is supplied).
        expect(descriptor.getDueTask({
            state: {}, now: 2000, intervals: {remConsolidationWatchdogCheck: 1000}, hooks: {}
        })).toMatchObject({taskName: 'rem-consolidation-liveness-watchdog', source: 'periodic-health-check'});
        expect(descriptor.getDueTask({
            state    : {'rem-consolidation-liveness-watchdog': {lastRunAt: 1500}}, now: 2000,
            intervals: {remConsolidationWatchdogCheck: 1000}, hooks: {}
        })).toBeNull();
    });

    test('cloud-deployable graph lanes are registered once Orchestrator.poll() consumes the registry', () => {
        const names = TASK_REGISTRY.map(d => d.taskName);
        expect(names).toContain('graphlog-compaction');
        expect(names).toContain('tenant-repo-sync');
    });

    test('golden-path is decoupled from dream — runs hourly for freshness, not gated behind the heavy digest', () => {
        const goldenPath = TASK_REGISTRY.find(d => d.taskName === 'golden-path');
        expect(goldenPath, 'golden-path is registered').toBeTruthy();
        // Decoupled: the cheap hourly re-rank must NOT hard-depend on the heavy daily REM digest,
        // so the picker never drops golden-path while dream is running (the stale-forecast fix).
        expect(goldenPath.dependencies).not.toContain('dream');
        // dream stays registered — the decouple removes the dependency edge, not the task.
        expect(TASK_REGISTRY.find(d => d.taskName === 'dream')).toBeTruthy();
    });

    test('heavy task descriptors match MaintenanceBackpressureService SSOT (#11900)', () => {
        const descriptorByName = new Map(TASK_REGISTRY.map(descriptor => [descriptor.taskName, descriptor]));
        for (const taskName of DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES) {
            const descriptor = descriptorByName.get(taskName);
            expect(descriptor, `${taskName} is registered`).toBeTruthy();
            expect(descriptor.maintenanceClass, `${taskName} metadata`).toBe('heavy');
            expect(descriptor.backpressure, `${taskName} metadata`).toBe('exclusive-heavy');
        }
    });

    test('githubWorkflowSync getDueTask gates on enables + fires on elapsed cadence (#13626)', () => {
        const descriptor = TASK_REGISTRY.find(d => d.taskName === 'githubWorkflowSync');
        expect(descriptor, 'githubWorkflowSync is registered').toBeTruthy();
        // Gated off (cloud profile) → never due, even when long overdue.
        expect(descriptor.getDueTask({state: {}, now: 1e12, intervals: {githubWorkflowSync: 1000}, enables: {githubWorkflowSync: false}})).toBeNull();
        // Enabled (local) + cadence elapsed → due.
        expect(descriptor.getDueTask({
            state    : {githubWorkflowSync: {lastRunAt: 0}}, now: 2000,
            intervals: {githubWorkflowSync: 1000}, enables: {githubWorkflowSync: true}
        })).toMatchObject({taskName: 'githubWorkflowSync', source: 'periodic-sync'});
        // Enabled but within cadence → not yet due.
        expect(descriptor.getDueTask({
            state    : {githubWorkflowSync: {lastRunAt: 1500}}, now: 2000,
            intervals: {githubWorkflowSync: 1000}, enables: {githubWorkflowSync: true}
        })).toBeNull();
    });

    test('githubWorkflowSync cadence uses terminal timestamp before start timestamp (#13832)', () => {
        const descriptor = TASK_REGISTRY.find(d => d.taskName === 'githubWorkflowSync');
        expect(descriptor, 'githubWorkflowSync is registered').toBeTruthy();

        expect(descriptor.getDueTask({
            state: {
                githubWorkflowSync: {
                    lastRunAt    : 0,
                    lastSuccessAt: new Date(1200).toISOString()
                }
            },
            now      : 1800,
            intervals: {githubWorkflowSync: 1000},
            enables  : {githubWorkflowSync: true}
        })).toBeNull();

        expect(descriptor.getDueTask({
            state: {
                githubWorkflowSync: {
                    lastRunAt    : 0,
                    lastSuccessAt: new Date(1200).toISOString()
                }
            },
            now      : 2200,
            intervals: {githubWorkflowSync: 1000},
            enables  : {githubWorkflowSync: true}
        })).toMatchObject({taskName: 'githubWorkflowSync', source: 'periodic-sync'});
    });

    test('githubWorkflowSync failed terminal attempts also cool down retries (#13832)', () => {
        const descriptor = TASK_REGISTRY.find(d => d.taskName === 'githubWorkflowSync');
        expect(descriptor, 'githubWorkflowSync is registered').toBeTruthy();

        expect(descriptor.getDueTask({
            state: {
                githubWorkflowSync: {
                    lastRunAt  : 0,
                    lastErrorAt: new Date(1200).toISOString()
                }
            },
            now      : 1800,
            intervals: {githubWorkflowSync: 1000},
            enables  : {githubWorkflowSync: true}
        })).toBeNull();

        expect(descriptor.getDueTask({
            state: {
                githubWorkflowSync: {
                    lastRunAt  : 0,
                    lastErrorAt: new Date(1200).toISOString()
                }
            },
            now      : 2200,
            intervals: {githubWorkflowSync: 1000},
            enables  : {githubWorkflowSync: true}
        })).toMatchObject({taskName: 'githubWorkflowSync', source: 'periodic-sync'});
    });

    test('continuous tasks (chroma/bridgeDaemon/mlx) are intentionally NOT in registry', () => {
        const names = TASK_REGISTRY.map(d => d.taskName);
        expect(names).not.toContain('chroma');
        expect(names).not.toContain('bridgeDaemon');
        expect(names).not.toContain('mlx');
    });
});
