import {test, expect} from '@playwright/test';
import path from 'path';
import Neo from '../../../../../../src/Neo.mjs';
import * as core from '../../../../../../src/core/_export.mjs';
import AiConfig from '../../../../../../ai/config.mjs';
import {
    Orchestrator,
    resolvePrimaryDevSyncRootsConfig,
    resolvePrimaryDevSyncRootsSource
} from '../../../../../../ai/daemons/orchestrator/Orchestrator.mjs';
import {
    DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES
} from '../../../../../../ai/daemons/orchestrator/services/MaintenanceBackpressureService.mjs';
import {
    DEV_SYNC_ROOTS_CONFIG_KEY,
    DEV_SYNC_ROOTS_ENV_VAR
} from '../../../../../../ai/daemons/orchestrator/services/PrimaryRepoSyncService.mjs';
import {
    buildTaskDefinitions
} from '../../../../../../ai/daemons/orchestrator/TaskDefinitions.mjs';
import TaskStateService, { createInitialTaskState } from '../../../../../../ai/daemons/orchestrator/services/TaskStateService.mjs';

let testOrchestratorSeq = 0;
let savedIntervals = null;
let savedLocalOnly = null;
let savedCloudOnly = null;

/**
 * Test helper updated per Epic #11831 Sub 1 (#11833) Orchestrator refactor:
 * - Operator policy values (intervals + booleans) are now Class D lazy getters reading
 *   from AiConfig — Neo.create config can't reach them. Helper injects via AiConfig.data
 *   mutation with restore-in-afterEach.
 * - Simple-imported collaborators (Class C) are instance fields — Neo.create config
 *   can't set them either. Helper assigns directly after Neo.create.
 * - Reactive class config slots (Class A/B parent props: dataDir, taskDefinitions,
 *   taskStateService, healthService, spawnFn) still flow through Neo.create initConfig.
 */
function createTestOrchestrator(config = {}) {
    const taskDefinitions = config.taskDefinitions || buildTaskDefinitions({
        scriptDir: '/repo/ai/scripts',
        nodeBin  : '/node'
    });

    const heavyMaintenanceLeasePath = config.heavyMaintenanceLeasePath
        || `/tmp/orchestrator-test/heavy-maintenance-lease-${process.pid}-${++testOrchestratorSeq}.json`;

    TaskStateService.configure({
        stateFile      : '/tmp/orchestrator-test/state.json',
        taskDefinitions,
        writeLogFn     : () => {}
    });
    TaskStateService.taskState = createInitialTaskState(taskDefinitions);
    ['chroma', 'bridgeDaemon', 'mlx'].forEach(name => {
        if (TaskStateService.taskState[name]) {
            TaskStateService.taskState[name].running = true;
        }
    });

    // Save canonical AiConfig once per test; afterEach restores.
    savedIntervals = savedIntervals || {...AiConfig.orchestrator.intervals};
    savedLocalOnly = savedLocalOnly || {...AiConfig.orchestrator.localOnly};
    savedCloudOnly = savedCloudOnly || {...AiConfig.orchestrator.cloudOnly};

    // Class D operator policy values — AiConfig.data mutation reaches lazy getters.
    // Test defaults preserve the pre-refactor helper's defaults (600000ms intervals etc.).
    AiConfig.orchestrator.intervals.summarySweepMs   = config.summarySweepIntervalMs   ?? 600000;
    AiConfig.orchestrator.intervals.kbSyncMs         = config.kbSyncIntervalMs         ?? 600000;
    AiConfig.orchestrator.intervals.backupMs         = config.backupIntervalMs         ?? 86400000;
    AiConfig.orchestrator.intervals.primaryDevSyncMs = config.primaryDevSyncIntervalMs ?? 600000;
    AiConfig.orchestrator.intervals.tenantRepoSyncMs = config.tenantRepoSyncIntervalMs ?? Number.MAX_SAFE_INTEGER;
    AiConfig.orchestrator.intervals.dreamMs          = config.dreamIntervalMs          ?? Number.MAX_SAFE_INTEGER;
    AiConfig.orchestrator.intervals.goldenPathMs     = config.goldenPathIntervalMs     ?? Number.MAX_SAFE_INTEGER;
    AiConfig.orchestrator.intervals.swarmHeartbeatMs = config.swarmHeartbeatIntervalMs ?? Number.MAX_SAFE_INTEGER;
    if (config.pollIntervalMs !== undefined) AiConfig.orchestrator.intervals.pollMs = config.pollIntervalMs;

    AiConfig.orchestrator.localOnly.kbSyncEnabled                  = config.kbSyncEnabled                  ?? true;
    AiConfig.orchestrator.localOnly.primaryDevSyncEnabled          = config.primaryDevSyncEnabled          ?? false;
    AiConfig.orchestrator.localOnly.bridgeDaemonEnabled            = config.bridgeDaemonEnabled            ?? true;
    AiConfig.orchestrator.localOnly.swarmHeartbeatEnabled          = config.swarmHeartbeatEnabled          ?? true;
    AiConfig.orchestrator.localOnly.goldenPathRepoEnrichmentEnabled = config.goldenPathRepoEnrichmentEnabled ?? true;

    AiConfig.orchestrator.cloudOnly.tenantRepoSyncEnabled = config.tenantRepoSyncEnabled ?? false;

    const orchestrator = Neo.create(Orchestrator, {
        dataDir                  : '/tmp/orchestrator-test',
        stateFile                : '/tmp/orchestrator-test/state.json',
        logFile                  : null,
        heavyMaintenanceLeasePath,
        taskDefinitions,
        taskStateService         : TaskStateService,
        primaryDevSyncRootsConfig: config.primaryDevSyncRootsConfig ?? null,
        healthService            : config.healthService || {recordTaskOutcome() {}},
        spawnFn                  : config.spawnFn       || (() => { throw new Error('spawnFn not expected'); })
    });

    // Class C simple-imported collaborators — instance fields, not reachable via Neo.create.
    // Scheduling triggers are function-typed seams (`./scheduling/<task>.mjs`); execution
    // collaborators stay object-typed (class singletons / per-instance services).
    orchestrator.summaryGetDueTask        = config.summaryGetDueTask        || (() => null);
    orchestrator.backupGetDueTask         = config.backupGetDueTask         || (() => null);
    orchestrator.primaryDevSyncGetDueTask = config.primaryDevSyncGetDueTask || (() => null);
    orchestrator.primaryRepoSyncService   = config.primaryRepoSyncService   || {runTask: () => null};
    orchestrator.tenantRepoSyncService    = config.tenantRepoSyncService    || {runTask: () => null};
    orchestrator.tenantRepoSyncGetDueTask = config.tenantRepoSyncGetDueTask || (() => null);
    orchestrator.dreamService             = config.dreamService             || {processUndigestedSessions: () => Promise.resolve()};
    orchestrator.goldenPathSynthesizer    = config.goldenPathSynthesizer    || {synthesizeGoldenPath: () => Promise.resolve()};
    orchestrator.swarmHeartbeatService    = config.swarmHeartbeatService    || {initAsync: () => Promise.resolve(), pulse: () => Promise.resolve()};

    orchestrator.writeLog  = () => {};

    return orchestrator;
}

test.afterEach(() => {
    // Restore canonical AiConfig defaults after each test (Class D lazy-getter substrate).
    if (savedIntervals) {
        Object.assign(AiConfig.orchestrator.intervals, savedIntervals);
        savedIntervals = null;
    }
    if (savedLocalOnly) {
        Object.assign(AiConfig.orchestrator.localOnly, savedLocalOnly);
        savedLocalOnly = null;
    }
    if (savedCloudOnly) {
        Object.assign(AiConfig.orchestrator.cloudOnly, savedCloudOnly);
        savedCloudOnly = null;
    }
});

test.describe('Neo.ai.daemons.Orchestrator (#11009)', () => {
    test('creates an isolated persisted-state envelope per task', () => {
        const state = createInitialTaskState(buildTaskDefinitions({
            scriptDir: '/repo/ai/scripts',
            nodeBin  : '/node'
        }));

        expect(Object.keys(state)).toEqual(['chroma', 'bridgeDaemon', 'summary', 'kbSync', 'backup', 'primary-dev-sync', 'tenant-repo-sync', 'dream', 'golden-path', 'swarm-heartbeat']);
        expect(state.mlx).toBeUndefined();
        expect(state.memoryCoreChroma).toBeUndefined();
        expect(state.summary).toMatchObject({
            running      : false,
            pid          : null,
            lastRunAt    : 0,
            lastSuccessAt: null,
            lastErrorAt  : null,
            lastExitCode : null,
            lastReason   : null
        });
        expect(state.kbSync).not.toBe(state.summary);
    });

    test('isolates summary scheduling failure and still schedules due KB sync', () => {
        const outcomes = [];
        const started  = [];

        const orchestrator = createTestOrchestrator({
            healthService: {
                recordTaskOutcome(taskName, status, details) {
                    outcomes.push({taskName, status, details});
                }
            },
            summaryGetDueTask: () => {
                throw new Error('summary read failed');
            }
        });

        orchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                started.push({taskName, reason});
                return true;
            }
        };

        orchestrator.poll();

        expect(outcomes).toEqual([{
            taskName: 'summary',
            status  : 'failed',
            details : {
                phase: 'schedule',
                error: 'summary read failed'
            }
        }]);
        expect(started).toEqual([{
            taskName: 'kbSync',
            reason  : 'periodic-sync:600000'
        }]);
    });

    test('backpressures overdue heavy maintenance tasks within the same poll', () => {
        const logs     = [];
        const outcomes = [];
        const started  = [];

        const orchestrator = createTestOrchestrator({
            healthService: {
                recordTaskOutcome(taskName, status, details) {
                    outcomes.push({taskName, status, details});
                }
            },
            summaryGetDueTask: () => ({
                taskName: 'summary',
                reason  : 'periodic-sweep:600000'
            })
        });

        orchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                started.push({taskName, reason});
                return true;
            }
        };
        orchestrator.writeLog = (level, message) => logs.push({level, message});

        orchestrator.poll();

        expect(started).toEqual([{
            taskName: 'summary',
            reason  : 'periodic-sweep:600000'
        }]);
        expect(outcomes).toContainEqual({
            taskName: 'kbSync',
            status  : 'skipped',
            details : expect.objectContaining({
                blockingTaskName: 'summary',
                reason          : 'periodic-sync:600000',
                reasonCode      : 'heavy-maintenance-backpressure'
            })
        });
        expect(logs).toContainEqual({
            level  : 'INFO',
            message: expect.stringContaining('Deferring knowledge base sync')
        });
    });

    test('defers due heavy maintenance when another heavy task is already running', () => {
        const logs     = [];
        const outcomes = [];
        const started  = [];

        const orchestrator = createTestOrchestrator({
            healthService: {
                recordTaskOutcome(taskName, status, details) {
                    outcomes.push({taskName, status, details});
                }
            }
        });

        TaskStateService.taskState.summary.running = true;
        orchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                started.push({taskName, reason});
                return true;
            }
        };
        orchestrator.writeLog = (level, message) => logs.push({level, message});

        orchestrator.poll();
        orchestrator.poll();

        expect(started).toEqual([]);
        expect(outcomes).toContainEqual({
            taskName: 'kbSync',
            status  : 'skipped',
            details : expect.objectContaining({
                blockingTaskName: 'summary',
                reasonCode      : 'heavy-maintenance-backpressure'
            })
        });
        expect(logs.filter(entry => entry.message.includes('Deferring knowledge base sync'))).toHaveLength(1);
    });

    test('does not let a running golden path refresh backpressure heavy maintenance', () => {
        const started = [];

        const orchestrator = createTestOrchestrator();

        TaskStateService.taskState['golden-path'].running = true;
        orchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                started.push({taskName, reason});
                return true;
            }
        };

        orchestrator.poll();

        expect(started).toEqual([{
            taskName: 'kbSync',
            reason  : 'periodic-sync:600000'
        }]);
    });

    test('does not schedule kbSync when deployment config disables the local-checkout sync lane', () => {
        const started = [];

        const orchestrator = createTestOrchestrator({
            kbSyncEnabled: false
        });

        orchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                started.push({taskName, reason});
                return true;
            }
        };

        orchestrator.poll();

        expect(started).toEqual([]);
    });

    test('does not restart bridge-daemon when deployment config disables local wake delivery', () => {
        const started = [];

        const orchestrator = createTestOrchestrator({
            bridgeDaemonEnabled: false,
            kbSyncEnabled     : false
        });

        TaskStateService.taskState.bridgeDaemon.running   = false;
        TaskStateService.taskState.bridgeDaemon.lastRunAt = 0;

        orchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                started.push({taskName, reason});
                return true;
            }
        };

        orchestrator.poll();

        expect(started).toEqual([]);
    });

    test('defers golden path behind active dream graph mutation with explicit reason', () => {
        const logs     = [];
        const outcomes = [];
        const calls    = [];

        const orchestrator = createTestOrchestrator({
            goldenPathIntervalMs: 600000,
            healthService: {
                recordTaskOutcome(taskName, status, details) {
                    outcomes.push({taskName, status, details});
                }
            },
            goldenPathSynthesizer: {
                synthesizeGoldenPath() {
                    calls.push('golden-path');
                    return Promise.resolve();
                }
            }
        });

        TaskStateService.taskState['dream'].running = true;
        orchestrator.writeLog = (level, message) => logs.push({level, message});

        orchestrator.poll();

        expect(calls).toEqual([]);
        expect(outcomes).toContainEqual({
            taskName: 'golden-path',
            status  : 'skipped',
            details : expect.objectContaining({
                blockingTaskName: 'dream',
                reason          : 'periodic-golden-path:600000',
                reasonCode      : 'golden-path-dependency-backpressure'
            })
        });
        expect(logs).toContainEqual({
            level  : 'INFO',
            message: expect.stringContaining('Deferring golden path synthesis; dependency task REM sleep graph extraction is active')
        });
    });

    test('allows golden path refresh while non-dream heavy maintenance is active', async () => {
        const calls = [];

        const orchestrator = createTestOrchestrator({
            goldenPathIntervalMs: 600000,
            goldenPathSynthesizer: {
                synthesizeGoldenPath() {
                    calls.push('golden-path');
                    return Promise.resolve();
                }
            }
        });

        TaskStateService.taskState.summary.running = true;

        orchestrator.poll();
        await Promise.resolve();

        expect(calls).toEqual(['golden-path']);
    });

    test('passes deployment-mode repo enrichment toggle into golden path synthesis', async () => {
        const calls = [];

        const orchestrator = createTestOrchestrator({
            kbSyncEnabled: false,
            goldenPathIntervalMs: 600000,
            goldenPathRepoEnrichmentEnabled: false,
            goldenPathSynthesizer: {
                synthesizeGoldenPath(options) {
                    calls.push(options);
                    return Promise.resolve();
                }
            }
        });

        orchestrator.poll();
        await Promise.resolve();

        expect(calls).toEqual([{repoEnrichmentEnabled: false}]);
    });

    test('keeps continuous daemon supervision outside heavy maintenance backpressure', () => {
        const started = [];

        const orchestrator = createTestOrchestrator();

        TaskStateService.taskState.summary.running = true;
        TaskStateService.taskState.chroma.running  = false;
        TaskStateService.taskState.chroma.lastRunAt = 0;
        orchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                started.push({taskName, reason});
                return true;
            }
        };

        orchestrator.poll();

        expect(started).toEqual([{
            taskName: 'chroma',
            reason  : 'supervisor-restart'
        }]);
    });

    test('isolates backup scheduling failure and still schedules other tasks', () => {
        const outcomes = [];
        const started  = [];

        const orchestrator = createTestOrchestrator({
            healthService: {
                recordTaskOutcome(taskName, status, details) {
                    outcomes.push({taskName, status, details});
                }
            },
            backupGetDueTask: () => {
                throw new Error('backup logic failed');
            }
        });

        orchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                started.push({taskName, reason});
                return true;
            }
        };

        orchestrator.poll();

        expect(outcomes).toContainEqual({
            taskName: 'backup',
            status  : 'failed',
            details : {
                phase: 'schedule',
                error: 'backup logic failed'
            }
        });
        expect(started).toContainEqual({
            taskName: 'kbSync',
            reason  : 'periodic-sync:600000'
        });
    });

    test('resolves default paths correctly without configuration overrides', () => {
        // Post Sub 1 #11833: configure() removed; path resolution is direct instance-field
        // assignment + buildTaskDefinitions(), mirroring the substrate-correct shape used
        // in `start()`. No side-effecting orchestrator.start() needed for path tests.
        const orchestrator = Neo.create(Orchestrator);
        const dataDir = '/tmp/orchestrator-test-defaults';
        const repoRoot = path.resolve(process.cwd());
        const scriptDir = path.resolve(repoRoot, 'ai/scripts');

        orchestrator.dataDir         = dataDir;
        orchestrator.logFile         = path.join(dataDir, 'orchestrator.log');
        orchestrator.stateFile       = path.join(dataDir, 'orchestrator-state.json');
        orchestrator.taskDefinitions = buildTaskDefinitions({scriptDir, nodeBin: process.argv[0]});

        expect(orchestrator.logFile).toBe(path.join(dataDir, 'orchestrator.log'));
        expect(orchestrator.stateFile).toBe(path.join(dataDir, 'orchestrator-state.json'));

        const expectedSummaryScript = path.resolve(repoRoot, 'ai/scripts/lifecycle/summarize-sessions.mjs');
        const expectedKbSyncScript = path.resolve(repoRoot, 'ai/scripts/maintenance/syncKnowledgeBase.mjs');

        expect(orchestrator.taskDefinitions.summary.args[0]).toBe(expectedSummaryScript);
        expect(orchestrator.taskDefinitions.kbSync.args[0]).toBe(expectedKbSyncScript);
        expect(orchestrator.taskDefinitions.mlx).toBeUndefined();
    });

    test('passes local mlx launch model config into task definitions', () => {
        const orchestrator = Neo.create(Orchestrator);
        orchestrator.dataDir         = '/tmp/orchestrator-test-mlx-model';
        orchestrator.taskDefinitions = buildTaskDefinitions({
            scriptDir : path.resolve(process.cwd(), 'ai/scripts'),
            nodeBin   : process.argv[0],
            mlxEnabled: true,
            mlxModel  : 'operator-configured-mlx-model'
        });

        expect(orchestrator.taskDefinitions.mlx.args).toContain('operator-configured-mlx-model');
        expect(orchestrator.taskDefinitions.mlx.args).not.toContain('gemma-4-31b-it');
    });

    test('routes primary-dev-sync through its service coordinator', () => {
        const started = [];
        const orchestrator = createTestOrchestrator({
            kbSyncIntervalMs        : 0,
            backupIntervalMs        : 0,
            primaryDevSyncEnabled   : true,
            primaryDevSyncIntervalMs: 600000,
            primaryDevSyncGetDueTask: () => ({
                taskName: 'primary-dev-sync',
                reason  : 'periodic-sweep:600000'
            }),
            primaryRepoSyncService  : {
                runTask({taskName, reason}) {
                    started.push({taskName, reason});
                }
            }
        });

        orchestrator.processSupervisorService = {
            runTask() {}
        };

        orchestrator.poll();

        expect(started).toEqual([{
            taskName: 'primary-dev-sync',
            reason  : 'periodic-sweep:600000'
        }]);
    });

    test('routes tenant-repo-sync through Orchestrator.poll() when enabled + interval elapsed (#11790 AC2 poll-wiring)', () => {
        const started = [];
        const orchestrator = createTestOrchestrator({
            kbSyncIntervalMs        : 0,
            backupIntervalMs        : 0,
            tenantRepoSyncEnabled   : true,
            tenantRepoSyncIntervalMs: 600000,
            tenantRepoSyncGetDueTask: () => ({
                taskName: 'tenant-repo-sync',
                source  : 'periodic-sweep',
                reason  : 'periodic-sweep:600000'
            }),
            tenantRepoSyncService: {
                runTask({taskName, reason}) {
                    started.push({taskName, reason});
                }
            }
        });

        orchestrator.processSupervisorService = {
            runTask() {}
        };

        orchestrator.poll();

        expect(started).toEqual([{
            taskName: 'tenant-repo-sync',
            reason  : 'periodic-sweep:600000'
        }]);
    });

    test('skips tenant-repo-sync when disabled (local deployment default — Contract Ledger row 2)', () => {
        const started = [];
        const orchestrator = createTestOrchestrator({
            kbSyncIntervalMs        : 0,
            backupIntervalMs        : 0,
            tenantRepoSyncEnabled   : false,
            tenantRepoSyncIntervalMs: 600000,
            tenantRepoSyncService: {
                runTask({taskName, reason}) {
                    started.push({taskName, reason});
                }
            }
        });

        orchestrator.processSupervisorService = {
            runTask() {}
        };

        orchestrator.poll();

        expect(started).toEqual([]);
    });

    test('passes local dev-sync roots to primary-dev-sync while env keeps precedence', () => {
        const originalEnvValue = process.env[DEV_SYNC_ROOTS_ENV_VAR];
        delete process.env[DEV_SYNC_ROOTS_ENV_VAR];

        try {
            const received = [];
            const orchestrator = createTestOrchestrator({
                kbSyncIntervalMs          : 0,
                backupIntervalMs          : 0,
                primaryDevSyncEnabled     : true,
                primaryDevSyncIntervalMs  : 600000,
                primaryDevSyncRootsConfig : ['/config/neo'],
                primaryDevSyncGetDueTask  : () => ({
                    taskName: 'primary-dev-sync',
                    reason  : 'periodic-sweep:600000'
                }),
                primaryRepoSyncService    : {
                    runTask(options) {
                        received.push({
                            value : options.devSyncRootsConfig,
                            source: options.devSyncRootsSource
                        });
                    }
                }
            });

            orchestrator.processSupervisorService = {
                runTask() {}
            };

            orchestrator.poll();

            process.env[DEV_SYNC_ROOTS_ENV_VAR] = '["/env/neo"]';
            orchestrator.poll();

            expect(received).toEqual([{
                value : ['/config/neo'],
                source: DEV_SYNC_ROOTS_CONFIG_KEY
            }, {
                value : '["/env/neo"]',
                source: DEV_SYNC_ROOTS_ENV_VAR
            }]);
            expect(resolvePrimaryDevSyncRootsConfig({
                envValue   : '',
                configValue: ['/config/neo']
            })).toEqual(['/config/neo']);
            expect(resolvePrimaryDevSyncRootsConfig({
                envValue   : '',
                configValue: []
            })).toBeNull();
            expect(resolvePrimaryDevSyncRootsSource({envValue: ''})).toBe(DEV_SYNC_ROOTS_CONFIG_KEY);
        } finally {
            if (originalEnvValue === undefined) {
                delete process.env[DEV_SYNC_ROOTS_ENV_VAR];
            } else {
                process.env[DEV_SYNC_ROOTS_ENV_VAR] = originalEnvValue;
            }
        }
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Lane A of #11503 — per #11513:
    //   1. AC2: pin DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES contents so future refactors
    //      can't silently drop a heavy class.
    //   2. AC3-AC6: cross-poll deferral coverage for backup / dream / primary-dev-sync
    //      and proof that `backup` is now ALSO a valid blocker (previously: only
    //      summary↔kbSync pair was pinned at line 184).
    //
    // Golden-path is intentionally NOT in this set (light-classified per #11511 / PR #11512).
    // Its dream-dependency backpressure is covered separately at line ~242.
    // ─────────────────────────────────────────────────────────────────────────────

    test('DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES pins the canonical heavy-classification set (#11513 AC2)', () => {
        // Asserts EXACT membership (frozen array) so a future refactor that drops a
        // class is caught at test-time. Order matters less than membership; using a
        // sorted-set assertion to decouple from declaration order.
        expect([...DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES].sort()).toEqual([
            'backup',
            'kbSync',
            'primary-dev-sync',
            'dream',
            'summary'
        ].sort());
        expect(Object.isFrozen(DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES)).toBe(true);
        // Defensive: golden-path is intentionally OUT per #11511 / #11512 (light maintenance).
        expect(DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES).not.toContain('golden-path');
    });

    test('defers due backup when another heavy maintenance task is already running (#11513 AC3)', () => {
        const logs     = [];
        const outcomes = [];
        const started  = [];

        const orchestrator = createTestOrchestrator({
            healthService: {
                recordTaskOutcome(taskName, status, details) {
                    outcomes.push({taskName, status, details});
                }
            },
            backupGetDueTask: () => ({
                taskName: 'backup',
                reason  : 'periodic-backup:test'
            })
        });

        // summary is the blocker; backup must defer behind it.
        TaskStateService.taskState.summary.running = true;
        orchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                started.push({taskName, reason});
                return true;
            }
        };
        orchestrator.writeLog = (level, message) => logs.push({level, message});

        orchestrator.poll();

        expect(started.filter(s => s.taskName === 'backup')).toEqual([]);
        expect(outcomes).toContainEqual({
            taskName: 'backup',
            status  : 'skipped',
            details : expect.objectContaining({
                blockingTaskName: 'summary',
                reasonCode      : 'heavy-maintenance-backpressure'
            })
        });
    });

    test('running backup defers due kbSync — proves backup is now a valid blocker (#11513 AC3 symmetric)', () => {
        const outcomes = [];
        const started  = [];

        const orchestrator = createTestOrchestrator({
            healthService: {
                recordTaskOutcome(taskName, status, details) {
                    outcomes.push({taskName, status, details});
                }
            }
        });

        // backup is now the blocker (only meaningful AFTER backup is in the heavy set —
        // before #11513 this test would have observed kbSync running despite backup active).
        TaskStateService.taskState.backup.running = true;
        orchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                started.push({taskName, reason});
                return true;
            }
        };

        orchestrator.poll();

        expect(started).toEqual([]);
        expect(outcomes).toContainEqual({
            taskName: 'kbSync',
            status  : 'skipped',
            details : expect.objectContaining({
                blockingTaskName: 'backup',
                reasonCode      : 'heavy-maintenance-backpressure'
            })
        });
    });

    test('defers due dream when another heavy maintenance task is already running (#11513 AC4 — umbrella AC2 gap fill)', () => {
        const dreamCalls = [];
        const outcomes   = [];

        const orchestrator = createTestOrchestrator({
            dreamIntervalMs: 600000,
            healthService  : {
                recordTaskOutcome(taskName, status, details) {
                    outcomes.push({taskName, status, details});
                }
            },
            dreamService: {
                processUndigestedSessions() {
                    dreamCalls.push('dream');
                    return Promise.resolve();
                }
            }
        });

        TaskStateService.taskState.summary.running = true;

        orchestrator.poll();

        expect(dreamCalls).toEqual([]);
        expect(outcomes).toContainEqual({
            taskName: 'dream',
            status  : 'skipped',
            details : expect.objectContaining({
                blockingTaskName: 'summary',
                reasonCode      : 'heavy-maintenance-backpressure'
            })
        });
    });

    test('defers due primary-dev-sync when another heavy maintenance task is already running (#11513 AC6 — umbrella AC2 gap fill)', () => {
        const outcomes        = [];
        const runTaskCalls    = [];
        const getDueTaskCalls = [];

        const orchestrator = createTestOrchestrator({
            healthService: {
                recordTaskOutcome(taskName, status, details) {
                    outcomes.push({taskName, status, details});
                }
            },
            primaryDevSyncGetDueTask: () => {
                getDueTaskCalls.push('called');
                return {
                    taskName: 'primary-dev-sync',
                    reason  : 'periodic-primary-dev-sync:test'
                };
            },
            primaryRepoSyncService: {
                runTask(...args) {
                    runTaskCalls.push(args);
                }
            }
        });

        TaskStateService.taskState.summary.running = true;

        orchestrator.poll();

        expect(getDueTaskCalls.length).toBeGreaterThan(0);
        expect(runTaskCalls).toEqual([]);
        expect(outcomes).toContainEqual({
            taskName: 'primary-dev-sync',
            status  : 'skipped',
            details : expect.objectContaining({
                blockingTaskName: 'summary',
                reasonCode      : 'heavy-maintenance-backpressure'
            })
        });
    });

    test('defers due heavy task when another orchestrator holds the shared cross-daemon lease (#11519 AC5)', () => {
        // Cross-daemon contention scenario:
        //   1. Orchestrator A polls; kbSync due → wrap acquires shared file lease
        //   2. Mock runTask returns true (child-spawned path) → wrapper does NOT release;
        //      onComplete would fire on real child-close but mock doesn't simulate it →
        //      lease stays held by A.
        //   3. Orchestrator B polls with the SAME shared leasePath; kbSync also due →
        //      wrapper tries to acquire lease → sees A's active lease → 'held' → defers
        //      with reasonCode='heavy-maintenance-lease-held'.
        //
        // This is the substrate gap PR #11514 (Lane A in-process check) could not close —
        // in-process activeHeavyTask is per-process; the file lease is the only cross-process
        // mutex. Without this test the cross-daemon coverage gap would regress silently.
        const sharedLeasePath = `/tmp/orchestrator-test/heavy-maintenance-lease-cross-daemon-${process.pid}-${++testOrchestratorSeq}.json`;

        const outcomesA = [];
        const outcomesB = [];
        const startedA  = [];
        const startedB  = [];

        const orchestratorA = createTestOrchestrator({
            heavyMaintenanceLeasePath: sharedLeasePath,
            healthService: {
                recordTaskOutcome(taskName, status, details) {
                    outcomesA.push({taskName, status, details});
                }
            }
        });
        orchestratorA.processSupervisorService = {
            runTask(taskName, reason) {
                startedA.push({taskName, reason});
                return true;
            }
        };

        orchestratorA.poll();

        expect(startedA).toContainEqual({taskName: 'kbSync', reason: 'periodic-sync:600000'});

        // Second orchestrator on the same shared lease path — must defer cross-process.
        const orchestratorB = createTestOrchestrator({
            heavyMaintenanceLeasePath: sharedLeasePath,
            healthService: {
                recordTaskOutcome(taskName, status, details) {
                    outcomesB.push({taskName, status, details});
                }
            }
        });
        orchestratorB.processSupervisorService = {
            runTask(taskName, reason) {
                startedB.push({taskName, reason});
                return true;
            }
        };

        orchestratorB.poll();

        // Cross-daemon defer: B's kbSync sees A's active lease → records skipped with
        // reasonCode='heavy-maintenance-lease-held' (NOT 'heavy-maintenance-backpressure'
        // which is the in-process taxonomy).
        expect(outcomesB).toContainEqual({
            taskName: 'kbSync',
            status  : 'skipped',
            details : expect.objectContaining({
                reasonCode  : 'heavy-maintenance-lease-held',
                holdingOwner: 'kbSync',
                reason      : 'periodic-sync:600000'
            })
        });

        // B's kbSync did NOT start despite being due — proves cross-daemon defer is structural,
        // not a logging artifact.
        expect(startedB).not.toContainEqual({taskName: 'kbSync', reason: 'periodic-sync:600000'});
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // #11766 — swarm-heartbeat lane. The standalone swarm-heartbeat daemon is folded
    // into the Orchestrator as a config-gated scheduled lane. The lane runs
    // `SwarmHeartbeatService.pulse()` per cadence tick and is skipped when disabled.
    // It is NOT a heavy-maintenance task — it runs directly without backpressure.
    // ─────────────────────────────────────────────────────────────────────────────

    test('runs the swarm-heartbeat pulse when the lane is enabled and due (#11766)', async () => {
        const pulseCalls = [];

        const orchestrator = createTestOrchestrator({
            kbSyncEnabled          : false,
            swarmHeartbeatEnabled  : true,
            swarmHeartbeatIntervalMs: 600000,
            swarmHeartbeatService  : {
                initAsync() { return Promise.resolve(); },
                pulse() {
                    pulseCalls.push('pulse');
                    return Promise.resolve();
                }
            }
        });

        orchestrator.poll();
        await Promise.resolve();

        expect(pulseCalls).toEqual(['pulse']);
    });

    test('skips the swarm-heartbeat pulse when the lane is disabled (#11766)', async () => {
        const pulseCalls = [];

        const orchestrator = createTestOrchestrator({
            kbSyncEnabled          : false,
            swarmHeartbeatEnabled  : false,
            swarmHeartbeatIntervalMs: 600000,
            swarmHeartbeatService  : {
                initAsync() { return Promise.resolve(); },
                pulse() {
                    pulseCalls.push('pulse');
                    return Promise.resolve();
                }
            }
        });

        orchestrator.poll();
        await Promise.resolve();

        expect(pulseCalls).toEqual([]);
    });

    test('records swarm-heartbeat task outcomes through the health service (#11766)', async () => {
        const outcomes = [];

        const orchestrator = createTestOrchestrator({
            kbSyncEnabled          : false,
            swarmHeartbeatEnabled  : true,
            swarmHeartbeatIntervalMs: 600000,
            healthService          : {
                recordTaskOutcome(taskName, status, details) {
                    outcomes.push({taskName, status, details});
                }
            },
            swarmHeartbeatService  : {
                initAsync() { return Promise.resolve(); },
                pulse() { return Promise.resolve(); }
            }
        });

        orchestrator.poll();
        await Promise.resolve();
        await Promise.resolve();

        expect(outcomes).toContainEqual({
            taskName: 'swarm-heartbeat',
            status  : 'running',
            details : expect.objectContaining({reason: 'periodic-heartbeat:600000'})
        });
        expect(outcomes).toContainEqual({
            taskName: 'swarm-heartbeat',
            status  : 'completed',
            details : expect.objectContaining({reason: 'periodic-heartbeat:600000'})
        });
    });

});
