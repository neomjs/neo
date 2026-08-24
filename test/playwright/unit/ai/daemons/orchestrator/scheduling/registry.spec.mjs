import {test, expect}                         from '@playwright/test';
import {TASK_REGISTRY}                        from '../../../../../../../ai/daemons/orchestrator/scheduling/registry.mjs';
import {DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES} from '../../../../../../../ai/daemons/orchestrator/services/MaintenanceBackpressureService.mjs';
import {
    auditAuthorityTopology,
    AUTHORITY_CLASSES_BY_PROFILE,
    AUXILIARY_TASK_REGISTRY,
    buildAuthorityLaneInventory,
    buildAuthorityReceipt,
    CONTINUOUS_TASK_REGISTRY,
    getTaskAuthorityClass,
    INTERNAL_TASK_REGISTRY,
    ORCHESTRATOR_AUTHORITY_CLASS,
    ORCHESTRATOR_AUTHORITY_PROFILE,
    TARGET_ORCHESTRATOR_AUTHORITY_PROFILES
} from '../../../../../../../ai/daemons/orchestrator/taskAuthority.mjs';

const VALID_EXECUTION_KINDS     = ['supervised-child-process', 'service-runner', 'in-process-async', 'local-only-service', 'health-check'];
const VALID_MAINTENANCE_CLASSES = ['continuous', 'heavy', 'graph-dependent', 'lightweight-signal', 'local-only', 'health-monitor'];
const VALID_BACKPRESSURE        = ['none', 'exclusive-heavy', 'after-heavy'];
const VALID_AUTHORITY_CLASSES   = Object.values(ORCHESTRATOR_AUTHORITY_CLASS);

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
            expect(VALID_AUTHORITY_CLASSES).toContain(descriptor.authorityClass);
            expect(Array.isArray(descriptor.dependencies)).toBe(true);
            expect(typeof descriptor.getDueTask).toBe('function');
        }
    });

    test('continuous + scheduled + internal + auxiliary registries are exhaustively classified by one authority map (#16166)', () => {
        const lanes = buildAuthorityLaneInventory({
            continuousRegistry: CONTINUOUS_TASK_REGISTRY,
            scheduledRegistry : TASK_REGISTRY
        });

        expect(lanes).toHaveLength(
            CONTINUOUS_TASK_REGISTRY.length +
            TASK_REGISTRY.length +
            INTERNAL_TASK_REGISTRY.length +
            AUXILIARY_TASK_REGISTRY.length
        );
        expect(new Set(lanes.map(({task}) => task)).size).toBe(lanes.length);

        for (const lane of lanes) {
            expect(lane.authorityClass).toBe(getTaskAuthorityClass(lane.task));
        }
    });

    test('host-edge + container-plane have exactly one owner for every registered lane (#16166)', () => {
        const lanes = buildAuthorityLaneInventory({
            continuousRegistry: CONTINUOUS_TASK_REGISTRY,
            scheduledRegistry : TASK_REGISTRY
        });
        const ownership = auditAuthorityTopology({
            lanes,
            profiles: TARGET_ORCHESTRATOR_AUTHORITY_PROFILES
        });

        expect(ownership).toHaveLength(lanes.length);
        expect(ownership.every(({effectiveOwner}) =>
            TARGET_ORCHESTRATOR_AUTHORITY_PROFILES.includes(effectiveOwner)
        )).toBe(true);
    });

    test('authority receipts enforce the host-edge / container-plane negative boundary (#16166)', () => {
        const hostReceipt = buildAuthorityReceipt({
            profile           : ORCHESTRATOR_AUTHORITY_PROFILE.hostEdge,
            continuousRegistry: CONTINUOUS_TASK_REGISTRY,
            scheduledRegistry : TASK_REGISTRY
        });
        const containerReceipt = buildAuthorityReceipt({
            profile           : ORCHESTRATOR_AUTHORITY_PROFILE.containerPlane,
            continuousRegistry: CONTINUOUS_TASK_REGISTRY,
            scheduledRegistry : TASK_REGISTRY
        });
        const hostTasks      = new Map(hostReceipt.tasks.map(task => [task.task, task]));
        const containerTasks = new Map(containerReceipt.tasks.map(task => [task.task, task]));

        expect(hostTasks.get('bridgeDaemon')).toMatchObject({
            role          : 'host-edge',
            authorityClass: 'host-edge',
            effectiveOwner: 'host-edge',
            active        : true
        });
        expect(hostTasks.get('primary-dev-sync').active).toBe(true);
        expect(hostTasks.get('summary').active).toBe(false);
        expect(hostTasks.get('embedDaemon').active).toBe(false);
        expect(hostTasks.get('data-integrity-sweep').active).toBe(false);
        expect(hostTasks.get('deployment-state-bridge').active).toBe(false);
        expect(hostTasks.get('freeze-reprobe').active).toBe(false);
        expect(hostTasks.get('chromaDefrag').active).toBe(false);

        expect(containerTasks.get('summary').active).toBe(true);
        expect(containerTasks.get('embedDaemon').active).toBe(true);
        expect(containerTasks.get('data-integrity-sweep').active).toBe(true);
        expect(containerTasks.get('deployment-state-bridge').active).toBe(true);
        expect(containerTasks.get('freeze-reprobe').active).toBe(true);
        expect(containerTasks.get('chromaDefrag')).toMatchObject({
            kind          : 'auxiliary',
            authorityClass: 'shared-primitive',
            effectiveOwner: 'container-plane',
            active        : true
        });
        expect(containerTasks.get('bridgeDaemon').active).toBe(false);
        expect(containerTasks.get('primary-dev-sync').active).toBe(false);
        expect(containerTasks.get('devServer').active).toBe(false);
        expect(containerTasks.get('chroma')).toMatchObject({
            authorityClass: 'shared-primitive',
            effectiveOwner: 'container-plane',
            active        : true
        });
    });

    test('legacy-mixed is explicit compatibility ownership, not a deployment-mode fallback (#16166)', () => {
        const receipt = buildAuthorityReceipt({
            profile           : ORCHESTRATOR_AUTHORITY_PROFILE.legacyMixed,
            continuousRegistry: CONTINUOUS_TASK_REGISTRY,
            scheduledRegistry : TASK_REGISTRY
        });

        expect(receipt.topologyProfiles).toEqual(['legacy-mixed']);
        expect(receipt.tasks.every(({effectiveOwner, active}) =>
            effectiveOwner === 'legacy-mixed' && active
        )).toBe(true);
    });

    test('unknown tasks, ownership gaps, and double owners fail closed (#16166)', () => {
        expect(() => getTaskAuthorityClass('new-unclassified-lane'))
            .toThrow(/Unclassified task "new-unclassified-lane"/);

        const lane = [{
            task          : 'bridgeDaemon',
            kind          : 'continuous',
            authorityClass: ORCHESTRATOR_AUTHORITY_CLASS.hostEdge
        }];
        const gapMatrix = {
            ...AUTHORITY_CLASSES_BY_PROFILE,
            [ORCHESTRATOR_AUTHORITY_PROFILE.hostEdge]      : [],
            [ORCHESTRATOR_AUTHORITY_PROFILE.containerPlane]: [
                ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
                ORCHESTRATOR_AUTHORITY_CLASS.sharedPrimitive
            ]
        };
        const duplicateMatrix = {
            ...AUTHORITY_CLASSES_BY_PROFILE,
            [ORCHESTRATOR_AUTHORITY_PROFILE.hostEdge]      : [ORCHESTRATOR_AUTHORITY_CLASS.hostEdge],
            [ORCHESTRATOR_AUTHORITY_PROFILE.containerPlane]: [
                ORCHESTRATOR_AUTHORITY_CLASS.hostEdge,
                ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
                ORCHESTRATOR_AUTHORITY_CLASS.sharedPrimitive
            ]
        };

        expect(() => auditAuthorityTopology({
            lanes                    : lane,
            profiles                 : TARGET_ORCHESTRATOR_AUTHORITY_PROFILES,
            authorityClassesByProfile: gapMatrix
        })).toThrow(/ownership gap/);
        expect(() => auditAuthorityTopology({
            lanes                    : lane,
            profiles                 : TARGET_ORCHESTRATOR_AUTHORITY_PROFILES,
            authorityClassesByProfile: duplicateMatrix
        })).toThrow(/double ownership/);
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
            'summary', 'memory-summary-backfill', 'kbSync', 'core-corpus-projection', 'backup', 'graphlog-compaction',
            'primary-dev-sync', 'tenant-repo-sync', 'dream',
            'message-concept-harvest', 'golden-path', 'swarm-heartbeat'
        ]));
    });

    test('core-corpus-projection is one exclusive-heavy container writer, inert until enabled (#17627)', () => {
        const descriptor = TASK_REGISTRY.find(d => d.taskName === 'core-corpus-projection');

        expect(descriptor, 'core-corpus-projection is registered').toBeTruthy();
        expect(descriptor).toMatchObject({
            executionKind   : 'supervised-child-process',
            maintenanceClass: 'heavy',
            backpressure    : 'exclusive-heavy',
            authorityClass  : 'container-plane',
            dependencies    : []
        });
        expect(descriptor.getDueTask({
            state: {}, now: 1e12, intervals: {corpusProjection: 1000}, enables: {corpusProjection: false}
        })).toBeNull();
        expect(descriptor.getDueTask({
            state    : {'core-corpus-projection': {lastRunAt: 0}},
            now      : 6000,
            intervals: {corpusProjection: 5000},
            enables  : {corpusProjection: true}
        })).toEqual({
            taskName: 'core-corpus-projection',
            source  : 'periodic-projection',
            reason  : 'periodic-projection:5000'
        });
        expect(descriptor.getDueTask({
            state    : {'core-corpus-projection': {lastSuccessAt: '1970-01-01T00:00:02.000Z'}},
            now      : 6000,
            intervals: {corpusProjection: 5000},
            enables  : {corpusProjection: true}
        })).toBeNull()
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

    test('temporal-summary is registered as an exclusive-heavy supervised-child aggregation lane, inert until enabled (#14938)', () => {
        const descriptor = TASK_REGISTRY.find(d => d.taskName === 'temporal-summary');
        expect(descriptor, 'temporal-summary is registered').toBeTruthy();
        expect(descriptor.executionKind).toBe('supervised-child-process');
        expect(descriptor.maintenanceClass).toBe('heavy');
        expect(descriptor.backpressure).toBe('exclusive-heavy');
        expect(descriptor.dependencies).toEqual([]);
        // disabled (opt-in false OR unset) → never due, even long overdue: the lane never dispatches while off
        expect(descriptor.getDueTask({
            state: {}, now: 1e12, intervals: {temporalSummary: 1000}, enables: {temporalSummary: false}
        })).toBeNull();
        expect(descriptor.getDueTask({
            state: {}, now: 1e12, intervals: {temporalSummary: 1000}, enables: {}
        })).toBeNull();
        // enabled + cadence elapsed → due
        expect(descriptor.getDueTask({
            state    : {'temporal-summary': {lastRunAt: 0}}, now: 6000,
            intervals: {temporalSummary: 5000}, enables: {temporalSummary: true}
        })).toMatchObject({taskName: 'temporal-summary', source: 'periodic-temporal-summary'});
        // enabled but within cadence → not yet due
        expect(descriptor.getDueTask({
            state    : {'temporal-summary': {lastRunAt: 2000}}, now: 6000,
            intervals: {temporalSummary: 5000}, enables: {temporalSummary: true}
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

    test('the scheduled githubWorkflowSync writer is retired rather than left dormant (#17627)', () => {
        expect(TASK_REGISTRY.find(d => d.taskName === 'githubWorkflowSync')).toBeUndefined()
    });

    test('core-corpus-projection cadence uses terminal timestamp before start timestamp (#17627)', () => {
        const descriptor = TASK_REGISTRY.find(d => d.taskName === 'core-corpus-projection');
        expect(descriptor, 'core-corpus-projection is registered').toBeTruthy();

        expect(descriptor.getDueTask({
            state: {
                'core-corpus-projection': {
                    lastRunAt    : 0,
                    lastSuccessAt: new Date(1200).toISOString()
                }
            },
            now      : 1800,
            intervals: {corpusProjection: 1000},
            enables  : {corpusProjection: true}
        })).toBeNull();

        expect(descriptor.getDueTask({
            state: {
                'core-corpus-projection': {
                    lastRunAt    : 0,
                    lastSuccessAt: new Date(1200).toISOString()
                }
            },
            now      : 2200,
            intervals: {corpusProjection: 1000},
            enables  : {corpusProjection: true}
        })).toMatchObject({taskName: 'core-corpus-projection', source: 'periodic-projection'});
    });

    test('core-corpus-projection failed terminal attempts also cool down retries (#17627)', () => {
        const descriptor = TASK_REGISTRY.find(d => d.taskName === 'core-corpus-projection');
        expect(descriptor, 'core-corpus-projection is registered').toBeTruthy();

        expect(descriptor.getDueTask({
            state: {
                'core-corpus-projection': {
                    lastRunAt  : 0,
                    lastErrorAt: new Date(1200).toISOString()
                }
            },
            now      : 1800,
            intervals: {corpusProjection: 1000},
            enables  : {corpusProjection: true}
        })).toBeNull();

        expect(descriptor.getDueTask({
            state: {
                'core-corpus-projection': {
                    lastRunAt  : 0,
                    lastErrorAt: new Date(1200).toISOString()
                }
            },
            now      : 2200,
            intervals: {corpusProjection: 1000},
            enables  : {corpusProjection: true}
        })).toMatchObject({taskName: 'core-corpus-projection', source: 'periodic-projection'});
    });

    test('continuous tasks (chroma/bridgeDaemon/mlx) are intentionally NOT in registry', () => {
        const names = TASK_REGISTRY.map(d => d.taskName);
        expect(names).not.toContain('chroma');
        expect(names).not.toContain('bridgeDaemon');
        expect(names).not.toContain('mlx');
    });
});
