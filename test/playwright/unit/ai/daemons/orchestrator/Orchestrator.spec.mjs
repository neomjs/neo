import {test, expect}             from '@playwright/test';
import fs                         from 'fs-extra';
import path                       from 'path';
import Neo                        from '../../../../../../src/Neo.mjs';
import * as core                  from '../../../../../../src/core/_export.mjs';
import AiConfig                   from '../../../../../../ai/config.mjs';
import {Orchestrator}             from '../../../../../../ai/daemons/orchestrator/Orchestrator.mjs';
import {ProcessSupervisorService} from '../../../../../../ai/daemons/orchestrator/services/ProcessSupervisorService.mjs';
import {
    DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES
} from '../../../../../../ai/daemons/orchestrator/services/MaintenanceBackpressureService.mjs';
import {
    buildChromaHealthUrl,
    buildTaskDefinitions
} from '../../../../../../ai/daemons/orchestrator/taskDefinitions.mjs';
import TaskStateService, { createInitialTaskState } from '../../../../../../ai/daemons/orchestrator/services/TaskStateService.mjs';

let   testOrchestratorSeq            = 0;
const TEST_DEV_SERVER_PORT           = 18080;
const TEST_NEURAL_LINK_BRIDGE_PORT   = 18081;
let   savedIntervals                 = null;
let   savedLocalOnly                 = null;
let   savedCloudOnly                 = null;
let   savedDevServer                 = null;
let   savedDevServerMissing          = false;
let   savedGraphLogCompaction        = null;
let   savedGraphLogCompactionMissing = false;
let   savedNeuralLinkBridge          = null;
let   savedNeuralLinkBridgeMissing   = false;
let   savedDeploymentMode            = null;

/**
 * Test helper for the Orchestrator refactor shape:
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
        scriptDir                        : '/repo/ai/scripts',
        nodeBin                          : '/node',
        devServerPort                    : config.devServerPort ?? TEST_DEV_SERVER_PORT,
        devServerLivenessTimeoutMs       : config.devServerLivenessTimeoutMs ?? 50,
        neuralLinkBridgePort             : config.neuralLinkBridgePort ?? TEST_NEURAL_LINK_BRIDGE_PORT,
        neuralLinkBridgeLivenessTimeoutMs: config.neuralLinkBridgeLivenessTimeoutMs ?? 50
    });

    const heavyMaintenanceLeasePath = config.heavyMaintenanceLeasePath
        || `/tmp/orchestrator-test/heavy-maintenance-lease-${process.pid}-${++testOrchestratorSeq}.json`;

    TaskStateService.configure({
        stateFile : '/tmp/orchestrator-test/state.json',
        taskDefinitions,
        writeLogFn: () => {}
    });
    TaskStateService.taskState = createInitialTaskState(taskDefinitions);
    ['chroma', 'bridgeDaemon', 'devServer', 'neuralLinkBridge', 'mlx', 'ollama', 'lms'].forEach(name => {
        if (TaskStateService.taskState[name]) {
            TaskStateService.taskState[name].running = true;
        }
    });
    if (TaskStateService.taskState['message-concept-harvest']) {
        TaskStateService.taskState['message-concept-harvest'].lastRunAt =
            Object.hasOwn(config, 'messageConceptHarvestLastRunAt') ?
                config.messageConceptHarvestLastRunAt :
                Date.now();
    }

    // Save canonical AiConfig once per test; afterEach restores.
    savedIntervals = savedIntervals || {...AiConfig.orchestrator.intervals};
    savedLocalOnly = savedLocalOnly || {...AiConfig.orchestrator.localOnly};
    savedCloudOnly = savedCloudOnly || {...AiConfig.orchestrator.cloudOnly};
    if (savedDevServer === null) {
        savedDevServerMissing = AiConfig.orchestrator.devServer === undefined;
        savedDevServer = {...(AiConfig.orchestrator.devServer || {})};
    }
    if (savedGraphLogCompaction === null) {
        savedGraphLogCompactionMissing = AiConfig.orchestrator.graphLogCompaction === undefined;
        savedGraphLogCompaction = {...(AiConfig.orchestrator.graphLogCompaction || {})};
    }
    if (savedNeuralLinkBridge === null) {
        savedNeuralLinkBridgeMissing = AiConfig.orchestrator.neuralLinkBridge === undefined;
        savedNeuralLinkBridge = {...(AiConfig.orchestrator.neuralLinkBridge || {})};
    }
    savedDeploymentMode = savedDeploymentMode ?? AiConfig.orchestrator.deploymentMode;

    // Class D operator policy values — AiConfig.data mutation reaches lazy getters.
    // Test defaults preserve the pre-refactor helper's defaults (600000ms intervals etc.).
    AiConfig.orchestrator.intervals.summarySweepMs   = config.summarySweepIntervalMs   ?? 600000;
    AiConfig.orchestrator.intervals.kbSyncMs         = config.kbSyncIntervalMs         ?? 600000;
    AiConfig.orchestrator.intervals.githubWorkflowSyncMs = config.githubWorkflowSyncIntervalMs ?? 600000;
    AiConfig.orchestrator.intervals.backupMs         = config.backupIntervalMs         ?? 86400000;
    AiConfig.orchestrator.intervals.graphLogCompactionMs = config.graphLogCompactionIntervalMs ?? 86400000;
    AiConfig.orchestrator.intervals.primaryDevSyncMs = config.primaryDevSyncIntervalMs ?? 600000;
    AiConfig.orchestrator.intervals.tenantRepoSyncMs = config.tenantRepoSyncIntervalMs ?? Number.MAX_SAFE_INTEGER;
    AiConfig.orchestrator.intervals.dreamMs          = config.dreamIntervalMs          ?? Number.MAX_SAFE_INTEGER;
    AiConfig.orchestrator.intervals.dreamOverflowThreshold = config.dreamOverflowThreshold ?? 0.8;
    AiConfig.orchestrator.intervals.goldenPathMs     = config.goldenPathIntervalMs     ?? Number.MAX_SAFE_INTEGER;
    AiConfig.orchestrator.intervals.swarmHeartbeatMs = config.swarmHeartbeatIntervalMs ?? Number.MAX_SAFE_INTEGER;
    if (config.pollIntervalMs !== undefined) AiConfig.orchestrator.intervals.pollMs = config.pollIntervalMs;
    if (config.deploymentMode !== undefined) AiConfig.orchestrator.deploymentMode = config.deploymentMode;

    AiConfig.orchestrator.localOnly.kbSyncEnabled                  = config.kbSyncEnabled                  ?? true;
    // Default-disabled like primaryDevSyncEnabled: githubWorkflowSync is a heavy lane with its own
    // dedicated coverage (registry.spec getDueTask). Keeping it off by default scopes every other
    // test's scheduling to the lanes under test, so the new lane never competes in the picker.
    AiConfig.orchestrator.localOnly.githubWorkflowSyncEnabled      = config.githubWorkflowSyncEnabled      ?? false;
    AiConfig.orchestrator.localOnly.primaryDevSyncEnabled          = config.primaryDevSyncEnabled          ?? false;
    AiConfig.orchestrator.localOnly.bridgeDaemonEnabled            = config.bridgeDaemonEnabled            ?? true;
    AiConfig.orchestrator.localOnly.neuralLinkBridgeEnabled        = Object.hasOwn(config, 'neuralLinkBridgeEnabled') ? config.neuralLinkBridgeEnabled : true;
    // Default-disabled like primaryDevSyncEnabled: the embed-daemon lane has its own dedicated
    // test; every other test's supervision expectations stay scoped to the lanes under test.
    AiConfig.orchestrator.localOnly.embedDaemonEnabled             = config.embedDaemonEnabled             ?? false;
    AiConfig.orchestrator.localOnly.messageDaemonEnabled           = config.messageDaemonEnabled           ?? false;
    AiConfig.orchestrator.localOnly.swarmHeartbeatEnabled          = config.swarmHeartbeatEnabled          ?? true;
    AiConfig.orchestrator.localOnly.goldenPathRepoEnrichmentEnabled = config.goldenPathRepoEnrichmentEnabled ?? true;

    AiConfig.orchestrator.cloudOnly.tenantRepoSyncEnabled = config.tenantRepoSyncEnabled ?? false;
    AiConfig.setData('orchestrator.devServer', {
        enabled               : Object.hasOwn(config, 'devServerEnabled') ? config.devServerEnabled : null,
        port                  : config.devServerPort ?? TEST_DEV_SERVER_PORT,
        livenessProbeTimeoutMs: config.devServerLivenessTimeoutMs ?? 50
    });
    AiConfig.setData('orchestrator.graphLogCompaction', {
        enabled: config.graphLogCompactionEnabled ?? true,
        vacuum : config.graphLogCompactionVacuum ?? false
    });
    AiConfig.setData('orchestrator.neuralLinkBridge', {
        livenessProbeTimeoutMs: config.neuralLinkBridgeLivenessTimeoutMs ?? 50
    });

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
    orchestrator.graphLogCompactionGetDueTask = config.graphLogCompactionGetDueTask || (() => null);
    orchestrator.primaryDevSyncGetDueTask = config.primaryDevSyncGetDueTask || (() => null);
    orchestrator.primaryRepoSyncService   = config.primaryRepoSyncService   || {runTask: () => null};
    orchestrator.tenantRepoSyncService    = config.tenantRepoSyncService    || {runTask: () => null};
    orchestrator.tenantRepoSyncGetDueTask = config.tenantRepoSyncGetDueTask || (() => null);
    orchestrator.dreamGetDueTask          = config.dreamGetDueTask          || orchestrator.dreamGetDueTask;
    orchestrator.dreamService             = config.dreamService             || {processUndigestedSessions: () => Promise.resolve()};
    orchestrator.goldenPathSynthesizer    = config.goldenPathSynthesizer    || {synthesizeGoldenPath: () => Promise.resolve({
        status      : 'completed',
        wroteHandoff: true
    })};
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
        restoreConfigObject(AiConfig.orchestrator.localOnly, savedLocalOnly);
        savedLocalOnly = null;
    }
    if (savedCloudOnly) {
        restoreConfigObject(AiConfig.orchestrator.cloudOnly, savedCloudOnly);
        savedCloudOnly = null;
    }
    if (savedDevServer) {
        if (savedDevServerMissing) {
            AiConfig.setData('orchestrator.devServer', undefined);
        } else {
            AiConfig.setData('orchestrator.devServer', {...savedDevServer});
        }
        savedDevServer = null;
        savedDevServerMissing = false;
    }
    if (savedGraphLogCompaction) {
        if (savedGraphLogCompactionMissing) {
            AiConfig.setData('orchestrator.graphLogCompaction', undefined);
        } else {
            AiConfig.setData('orchestrator.graphLogCompaction', {...savedGraphLogCompaction});
        }
        savedGraphLogCompaction = null;
        savedGraphLogCompactionMissing = false;
    }
    if (savedNeuralLinkBridge) {
        if (savedNeuralLinkBridgeMissing) {
            AiConfig.setData('orchestrator.neuralLinkBridge', undefined);
        } else {
            AiConfig.setData('orchestrator.neuralLinkBridge', {...savedNeuralLinkBridge});
        }
        savedNeuralLinkBridge = null;
        savedNeuralLinkBridgeMissing = false;
    }
    if (savedDeploymentMode !== null) {
        AiConfig.orchestrator.deploymentMode = savedDeploymentMode;
        savedDeploymentMode = null;
    }
});

function restoreConfigObject(target, prior) {
    for (const key of Object.keys(target)) {
        if (!(key in prior)) {
            delete target[key];
        }
    }

    Object.assign(target, prior);
}

test.describe('Neo.ai.daemons.Orchestrator (#11009)', () => {
    test('creates an isolated persisted-state envelope per task', () => {
        const state = createInitialTaskState(buildTaskDefinitions({
            scriptDir                        : '/repo/ai/scripts',
            nodeBin                          : '/node',
            neuralLinkBridgePort             : TEST_NEURAL_LINK_BRIDGE_PORT,
            neuralLinkBridgeLivenessTimeoutMs: 50
        }));

        expect(Object.keys(state)).toEqual(['chroma', 'bridgeDaemon', 'neuralLinkBridge', 'embedDaemon', 'messageDaemon', 'summary', 'memory-summary-backfill', 'kbSync', 'githubWorkflowSync', 'backup', 'graphlog-compaction', 'chromaDefrag', 'primary-dev-sync', 'tenant-repo-sync', 'dream', 'message-concept-harvest', 'golden-path', 'swarm-heartbeat', 'embed-drain-liveness-watchdog', 'rem-consolidation-liveness-watchdog']);
        expect(state.mlx).toBeUndefined();
        expect(state.memoryCoreChroma).toBeUndefined();
        expect(state.summary).toMatchObject({
            running       : false,
            pid           : null,
            lastRunAt     : 0,
            lastSuccessAt : null,
            lastErrorAt   : null,
            lastExitCode  : null,
            lastReason    : null,
            lastCompletion: null
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

    test('selects only the first due maintenance candidate per poll (#11900)', () => {
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
        expect(outcomes).toEqual([]);
        expect(logs).toEqual([]);
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

    test('keeps message-concept-harvest scoped out of default helper polls without AiConfig mutation (#13969)', () => {
        const originalCadence = AiConfig.orchestrator.intervals.messageConceptHarvestMs;
        const started         = [];

        const orchestrator = createTestOrchestrator({
            kbSyncEnabled: false
        });

        expect(AiConfig.orchestrator.intervals.messageConceptHarvestMs).toBe(originalCadence);
        expect(TaskStateService.taskState['message-concept-harvest'].lastRunAt).toBeGreaterThan(0);

        orchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                started.push({taskName, reason});
                return true;
            }
        };

        orchestrator.poll();

        expect(started.find(entry => entry.taskName === 'message-concept-harvest')).toBeUndefined();
    });

    test('does not restart bridge-daemon when deployment config disables local wake delivery', () => {
        const started = [];

        const orchestrator = createTestOrchestrator({
            bridgeDaemonEnabled: false,
            kbSyncEnabled      : false
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

    test('wires deployment-state bridge dependencies through initial reactive service setup', () => {
        const orchestrator = createTestOrchestrator({
            kbSyncEnabled: false
        });

        orchestrator.deploymentRuntimeAccessService = {};
        orchestrator.deploymentStateBridgeService = {};
        orchestrator.containerHealthDiagnosisService = {};

        expect(orchestrator.deploymentStateBridgeService.runtimeAccessService)
            .toBe(orchestrator.deploymentRuntimeAccessService);
        expect(orchestrator.deploymentStateBridgeService.diagnosisService)
            .toBe(orchestrator.containerHealthDiagnosisService);
        expect(orchestrator.deploymentStateBridgeService.taskStateService)
            .toBe(orchestrator.taskStateService);
        expect(orchestrator.deploymentStateBridgeService.tenantRepoSyncService)
            .toBe(orchestrator.tenantRepoSyncService);
        expect(orchestrator.deploymentStateBridgeService.tenantRepoSyncEnabledReader())
            .toBe(false);
    });

    test('refreshes golden path while dream graph mutation is active — decoupled for hourly freshness', async () => {
        const outcomes = [];
        const calls    = [];

        const orchestrator = createTestOrchestrator({
            goldenPathIntervalMs: 600000,
            healthService       : {
                recordTaskOutcome(taskName, status, details) {
                    outcomes.push({taskName, status, details});
                }
            },
            goldenPathSynthesizer: {
                synthesizeGoldenPath() {
                    calls.push('golden-path');
                    return Promise.resolve({
                        status      : 'completed',
                        wroteHandoff: true
                    });
                }
            }
        });

        TaskStateService.taskState['dream'].running = true;

        orchestrator.poll();
        await Promise.resolve();

        // Decoupled: golden-path is NOT deferred behind the heavy, multi-hour dream digest — it runs
        // on its hourly cadence against the current graph so the forecast stays fresh (stale-forecast fix).
        expect(calls).toEqual(['golden-path']);
        expect(outcomes).not.toContainEqual(expect.objectContaining({
            taskName: 'golden-path',
            status  : 'skipped'
        }));
    });

    test('allows golden path refresh while non-dream heavy maintenance is active', async () => {
        const calls = [];

        const orchestrator = createTestOrchestrator({
            goldenPathIntervalMs : 600000,
            goldenPathSynthesizer: {
                synthesizeGoldenPath() {
                    calls.push('golden-path');
                    return Promise.resolve({
                        status      : 'completed',
                        wroteHandoff: true
                    });
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
            kbSyncEnabled                  : false,
            goldenPathIntervalMs           : 600000,
            goldenPathRepoEnrichmentEnabled: false,
            goldenPathSynthesizer          : {
                synthesizeGoldenPath(options) {
                    calls.push(options);
                    return Promise.resolve({
                        status      : 'completed',
                        wroteHandoff: true
                    });
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

    test('supervises the embed daemon as a continuous task when the lane is enabled', () => {
        const started = [];

        const orchestrator = createTestOrchestrator({embedDaemonEnabled: true});

        TaskStateService.taskState.embedDaemon.running   = false;
        TaskStateService.taskState.embedDaemon.lastRunAt = 0;
        orchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                started.push({taskName, reason});
                return true;
            }
        };

        orchestrator.poll();

        expect(started).toContainEqual({
            taskName: 'embedDaemon',
            reason  : 'supervisor-restart'
        });
    });

    test('defines Chroma with an HTTP health probe on the configured host (#14297)', async () => {
        const fetchCalls      = [];
        const taskDefinitions = buildTaskDefinitions({
            scriptDir                 : '/repo/ai/scripts',
            nodeBin                   : '/node',
            chromaHost                : 'localhost',
            chromaPort                : 8000,
            chromaHealthProbeTimeoutMs: 25,
            chromaHealthFetchFn       : async (url, options) => {
                fetchCalls.push({url, hasSignal: Boolean(options.signal)});
                return {ok: true};
            }
        });

        expect(taskDefinitions.chroma).toMatchObject({
            expectedCommand: 'chroma',
            singletonPort  : 8000
        });
        expect(taskDefinitions.chroma.duplicateListenerPolicy).toBeUndefined();
        expect(typeof taskDefinitions.chroma.healthProbe).toBe('function');
        await expect(taskDefinitions.chroma.healthProbe()).resolves.toBe(true);
        expect(fetchCalls).toEqual([{
            url      : 'http://localhost:8000/api/v2/heartbeat',
            hasSignal: true
        }]);
    });

    test('buildChromaHealthUrl preserves IPv6-capable local Chroma hosts (#14297)', () => {
        expect(buildChromaHealthUrl({host: '::1', port: 8000}))
            .toBe('http://[::1]:8000/api/v2/heartbeat');
        expect(buildChromaHealthUrl({host: '[::1]', port: 8000, endpoint: '/api/v2/healthcheck'}))
            .toBe('http://[::1]:8000/api/v2/healthcheck');
        expect(buildChromaHealthUrl({host: 'localhost:9999', port: 8000}))
            .toBe('http://localhost:8000/api/v2/heartbeat');
    });

    test('defines the local dev-server task without browser auto-open (#13482)', () => {
        const taskDefinitions = buildTaskDefinitions({
            scriptDir                 : '/repo/ai/scripts',
            nodeBin                   : '/node',
            devServerPort             : 4242,
            devServerLivenessTimeoutMs: 50
        });

        expect(taskDefinitions.devServer).toMatchObject({
            label                  : 'local dev-server',
            command                : '/node',
            pidFileName            : 'dev-server.pid',
            expectedCommand        : 'node_modules/webpack/bin/webpack.js',
            singletonPort          : 4242,
            duplicateListenerPolicy: 'defer'
        });
        expect(taskDefinitions.devServer.args).toEqual([
            '/repo/node_modules/webpack/bin/webpack.js',
            'serve',
            '-c',
            './buildScripts/webpack/webpack.server.config.mjs',
            '--port',
            '4242'
        ]);
        expect(taskDefinitions.devServer.args).not.toContain('--open');
        expect(typeof taskDefinitions.devServer.livenessProbe).toBe('function');
    });

    test('supervises the local dev-server in local mode and skips it in cloud mode (#13482)', async () => {
        const flushProbe        = () => new Promise(resolve => setTimeout(resolve, 0));
        const cloudStarted      = [];
        const cloudOrchestrator = createTestOrchestrator({
            deploymentMode  : 'cloud',
            kbSyncEnabled   : false,
            devServerEnabled: null
        });

        TaskStateService.taskState.devServer.running   = false;
        TaskStateService.taskState.devServer.lastRunAt = 0;
        cloudOrchestrator.taskDefinitions.devServer.livenessProbe = async () => false;
        cloudOrchestrator.processSupervisorService.taskDefinitions.devServer.livenessProbe = async () => false;
        cloudOrchestrator.processSupervisorService.runTask = (taskName, reason) => {
            cloudStarted.push({taskName, reason});
            return true;
        };

        cloudOrchestrator.poll();
        await flushProbe();

        expect(cloudStarted.find(entry => entry.taskName === 'devServer')).toBeUndefined();

        const localStarted      = [];
        const localOrchestrator = createTestOrchestrator({
            deploymentMode  : 'local',
            kbSyncEnabled   : false,
            devServerEnabled: null
        });

        TaskStateService.taskState.devServer.running   = false;
        TaskStateService.taskState.devServer.lastRunAt = 0;
        localOrchestrator.taskDefinitions.devServer.livenessProbe = async () => false;
        localOrchestrator.processSupervisorService.taskDefinitions.devServer.livenessProbe = async () => false;
        localOrchestrator.processSupervisorService.runTask = (taskName, reason) => {
            localStarted.push({taskName, reason});
            return true;
        };

        localOrchestrator.poll();
        await flushProbe();

        expect(localStarted).toContainEqual({
            taskName: 'devServer',
            reason  : 'supervisor-restart'
        });
    });

    test('does not spawn over a healthy manually started dev-server (#13482)', async () => {
        const started      = [];
        const orchestrator = createTestOrchestrator({
            deploymentMode: 'local',
            kbSyncEnabled : false
        });

        TaskStateService.taskState.devServer.running   = false;
        TaskStateService.taskState.devServer.lastRunAt = 0;
        orchestrator.taskDefinitions.devServer.livenessProbe = async () => true;
        orchestrator.processSupervisorService.taskDefinitions.devServer.livenessProbe = async () => true;
        orchestrator.processSupervisorService.runTask = (taskName, reason) => {
            started.push({taskName, reason});
            return true;
        };

        orchestrator.poll();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(started.find(entry => entry.taskName === 'devServer')).toBeUndefined();
    });

    test('defines Neural Link Bridge as a defer-safe local shared-infra task (#13483)', () => {
        const taskDefinitions = buildTaskDefinitions({
            scriptDir                        : '/repo/ai/scripts',
            nodeBin                          : '/node',
            neuralLinkBridgePort             : 4242,
            neuralLinkBridgeLivenessTimeoutMs: 50
        });

        expect(taskDefinitions.neuralLinkBridge).toMatchObject({
            label                  : 'Neural Link Bridge',
            command                : '/node',
            args                   : [path.resolve('/repo/ai/scripts', '../mcp/server/neural-link/run-bridge.mjs')],
            pidFileName            : 'neural-link-bridge.pid',
            expectedCommand        : 'mcp/server/neural-link/run-bridge.mjs',
            env                    : {NEO_NL_PORT: '4242'},
            singletonPort          : 4242,
            duplicateListenerPolicy: 'defer'
        });
        expect(typeof taskDefinitions.neuralLinkBridge.livenessProbe).toBe('function');
    });

    test('supervises Neural Link Bridge in local mode and skips it in cloud mode (#13483)', async () => {
        const flushProbe        = () => new Promise(resolve => setTimeout(resolve, 0));
        const localStarted      = [];
        const localOrchestrator = createTestOrchestrator({
            deploymentMode: 'local',
            kbSyncEnabled : false
        });

        TaskStateService.taskState.neuralLinkBridge.running   = false;
        TaskStateService.taskState.neuralLinkBridge.lastRunAt = 0;
        localOrchestrator.taskDefinitions.neuralLinkBridge.livenessProbe = async () => false;
        localOrchestrator.processSupervisorService.runTask = (taskName, reason) => {
            localStarted.push({taskName, reason});
            return true;
        };

        localOrchestrator.poll();

        await expect.poll(() => localStarted.some(entry =>
            entry.taskName === 'neuralLinkBridge' &&
            entry.reason === 'supervisor-restart'
        ), {timeout: 5000}).toBe(true);

        const cloudStarted      = [];
        const cloudOrchestrator = createTestOrchestrator({
            deploymentMode         : 'cloud',
            kbSyncEnabled          : false,
            neuralLinkBridgeEnabled: null
        });

        TaskStateService.taskState.neuralLinkBridge.running   = false;
        TaskStateService.taskState.neuralLinkBridge.lastRunAt = 0;
        cloudOrchestrator.processSupervisorService.runTask = (taskName, reason) => {
            cloudStarted.push({taskName, reason});
            return true;
        };

        cloudOrchestrator.poll();
        await flushProbe();

        expect(cloudStarted.find(entry => entry.taskName === 'neuralLinkBridge')).toBeUndefined();
    });

    test('does not kill externally owned Neural Link Bridge listeners (#13483)', () => {
        const killed     = [];
        const supervisor = Neo.create(ProcessSupervisorService, {
            dataDir        : '/tmp/orchestrator-test',
            taskDefinitions: {
                neuralLinkBridge: {
                    label                  : 'Neural Link Bridge',
                    pidFileName            : 'neural-link-bridge.pid',
                    expectedCommand        : 'mcp/server/neural-link/run-bridge.mjs',
                    singletonPort          : 4242,
                    duplicateListenerPolicy: 'defer'
                }
            },
            taskStateService: {
                getTaskState() {
                    return {running: false, pid: null};
                },
                adoptRunning() {}
            },
            healthService: {recordTaskOutcome() {}},
            writeLog     : () => {}
        });

        supervisor.listPortListeners  = () => [111, 222];
        supervisor.processCommand     = () => '/node ai/mcp/server/neural-link/run-bridge.mjs';
        supervisor.killProcess        = pid => killed.push(pid);
        supervisor.watchRecoveredTask = () => {};
        supervisor.getTaskPidFile     = () => null;

        // defer policy adopts the externally-owned live holder; it must NEVER kill it.
        expect(supervisor.reconcileSingletonPort('neuralLinkBridge')).toBe(0);
        expect(killed).toEqual([]);
    });

    test('passes task-level environment variables to spawned children (#13483)', () => {
        const spawned    = [];
        const taskState  = {running: false, pid: null};
        const noop       = () => {};
        const supervisor = Neo.create(ProcessSupervisorService, {
            dataDir        : '/tmp/orchestrator-test',
            taskDefinitions: {
                neuralLinkBridge: {
                    label          : 'Neural Link Bridge',
                    command        : '/node',
                    args           : ['/repo/ai/mcp/server/neural-link/run-bridge.mjs'],
                    pidFileName    : 'neural-link-bridge.pid',
                    expectedCommand: 'mcp/server/neural-link/run-bridge.mjs',
                    env            : {NEO_NL_PORT: '4242'}
                }
            },
            taskStateService: {
                getTaskState()  { return taskState; },
                markStarted    : noop,
                markSpawned    : noop,
                markCompleted  : noop,
                markFailed     : noop,
                markSpawnFailed: noop
            },
            healthService: {recordTaskOutcome() {}},
            writeLog     : () => {},
            spawnFn(command, args, options) {
                spawned.push({command, args, options});
                return {
                    pid   : 333,
                    stderr: {on() {}},
                    on() {}
                };
            }
        });

        expect(supervisor.runTask('neuralLinkBridge', 'unit-test')).toBe(true);
        expect(spawned[0].options.env.NEO_NL_PORT).toBe('4242');
    });

    test('supervises lms via the supervisor HTTP liveness probe — (re)start only when the endpoint is down (#12262 / #12090)', async () => {
        const saved = {
            lms              : {...AiConfig.orchestrator.lms},
            openAiCompatible : {...AiConfig.openAiCompatible},
            providerReadiness: {...AiConfig.orchestrator.providerReadiness},
            modelProvider    : AiConfig.modelProvider,
            graphProvider    : AiConfig.graphProvider,
            embeddingProvider: AiConfig.embeddingProvider
        };

        try {
            AiConfig.orchestrator.lms = {enabled: true, model: 'legacy-model', port: '1234'};
            AiConfig.openAiCompatible = {
                host          : 'http://127.0.0.1:1234',
                model         : 'chat-model',
                embeddingModel: 'embedding-model'
            };
            AiConfig.orchestrator.providerReadiness = {attempts: 2, delayMs: 0, timeoutMs: 50, routineCacheTtlMs: 1000};
            AiConfig.modelProvider     = 'openAiCompatible';
            AiConfig.graphProvider     = 'openAiCompatible';
            AiConfig.embeddingProvider = 'openAiCompatible';

            const orchestrator    = createTestOrchestrator({kbSyncEnabled: false});
            const taskDefinitions = orchestrator.buildConfiguredTaskDefinitions({
                scriptDir: path.resolve(process.cwd(), 'ai/scripts'),
                nodeBin  : process.argv[0]
            });
            // `lms server start` is fire-and-exit, so liveness is the HTTP endpoint, not the launcher
            // child. Stub the probe for determinism (no real :1234) and drive both branches.
            let probeUp = false;
            taskDefinitions.lms.livenessProbe = async () => probeUp;
            orchestrator.taskDefinitions = taskDefinitions;
            TaskStateService.configure({
                stateFile : '/tmp/orchestrator-test/state.json',
                taskDefinitions,
                writeLogFn: () => {}
            });
            TaskStateService.taskState = createInitialTaskState(taskDefinitions);

            const flushProbe = () => new Promise(resolve => setTimeout(resolve, 0));

            // A fresh supervisor per case resets the probe-gate state without the test reaching into
            // its internals; `runTask` is the restart spy. The supervisor owns the probe decision now.
            const pollDownLms = async () => {
                const started = [];
                orchestrator.processSupervisorService = {
                    runTask(taskName, reason) { started.push({taskName, reason}); return true; }
                };
                TaskStateService.taskState.lms.running   = false;
                TaskStateService.taskState.lms.lastRunAt = 0;
                orchestrator.poll();
                await flushProbe();
                return started;
            };

            // Endpoint DOWN → the lane is (re)started.
            probeUp = false;
            expect(await pollDownLms()).toContainEqual({taskName: 'lms', reason: 'supervisor-restart'});

            // Endpoint UP → silent no-op, NO restart (a healthy fire-and-exit lane must not re-spawn
            // every cooldown).
            probeUp = true;
            expect((await pollDownLms()).find(entry => entry.taskName === 'lms')).toBeUndefined();
        } finally {
            AiConfig.orchestrator.lms = saved.lms;
            AiConfig.openAiCompatible = saved.openAiCompatible;
            AiConfig.orchestrator.providerReadiness = saved.providerReadiness;
            AiConfig.modelProvider     = saved.modelProvider;
            AiConfig.graphProvider     = saved.graphProvider;
            AiConfig.embeddingProvider = saved.embeddingProvider;
        }
    });

    test('skips chroma daemon supervision in cloud mode while keeping local default (#12019)', () => {
        const cloudStarted      = [];
        const cloudOrchestrator = createTestOrchestrator({
            deploymentMode: 'cloud',
            kbSyncEnabled : false
        });

        TaskStateService.taskState.chroma.running = false;
        TaskStateService.taskState.chroma.lastRunAt = 0;
        cloudOrchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                cloudStarted.push({taskName, reason});
                return true;
            }
        };

        cloudOrchestrator.poll();

        expect(cloudStarted).toEqual([]);

        const localStarted      = [];
        const localOrchestrator = createTestOrchestrator({
            deploymentMode: 'local',
            kbSyncEnabled : false
        });

        TaskStateService.taskState.chroma.running = false;
        TaskStateService.taskState.chroma.lastRunAt = 0;
        localOrchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                localStarted.push({taskName, reason});
                return true;
            }
        };

        localOrchestrator.poll();

        expect(localStarted).toEqual([{
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

    test('defines graphlog-compaction as compactGraphLog --apply child task (#12394)', () => {
        const taskDefinitions = buildTaskDefinitions({
            scriptDir: '/repo/ai/scripts',
            nodeBin  : '/node'
        });

        expect(taskDefinitions['graphlog-compaction']).toEqual({
            label          : 'GraphLog compaction',
            command        : '/node',
            args           : ['/repo/ai/scripts/maintenance/compactGraphLog.mjs', '--apply'],
            pidFileName    : 'graphlog-compaction.pid',
            expectedCommand: 'compactGraphLog.mjs'
        });

        const orchestrator = createTestOrchestrator({
            graphLogCompactionVacuum: true
        });

        expect(orchestrator.buildConfiguredTaskDefinitions({
            scriptDir: '/repo/ai/scripts',
            nodeBin  : '/node'
        })['graphlog-compaction'].args).toEqual([
            '/repo/ai/scripts/maintenance/compactGraphLog.mjs',
            '--apply',
            '--vacuum'
        ]);
    });

    test('routes graphlog-compaction through Orchestrator.poll() in cloud deployment (#12394)', () => {
        const started      = [];
        const dueCalls     = [];
        const orchestrator = createTestOrchestrator({
            deploymentMode              : 'cloud',
            kbSyncIntervalMs            : 0,
            backupIntervalMs            : 0,
            graphLogCompactionEnabled   : true,
            graphLogCompactionIntervalMs: 600000,
            graphLogCompactionGetDueTask: options => {
                dueCalls.push(options);
                return {
                    taskName: 'graphlog-compaction',
                    source  : 'periodic-sweep',
                    reason  : 'periodic-graphlog-compaction:600000'
                };
            },
            primaryDevSyncIntervalMs: 0,
            tenantRepoSyncIntervalMs: 0,
            dreamIntervalMs         : Number.MAX_SAFE_INTEGER,
            goldenPathIntervalMs    : Number.MAX_SAFE_INTEGER,
            swarmHeartbeatIntervalMs: Number.MAX_SAFE_INTEGER
        });

        orchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                started.push({taskName, reason});
                return true;
            }
        };

        orchestrator.poll();

        expect(dueCalls).toEqual([expect.objectContaining({
            graphLogCompactionIntervalMs: 600000,
            enabled                     : true
        })]);
        expect(started).toEqual([{
            taskName: 'graphlog-compaction',
            reason  : 'periodic-graphlog-compaction:600000'
        }]);
    });

    test('passes graphlog-compaction cadence from config verbatim (#12394 / #12061)', () => {
        const dueCalls     = [];
        const orchestrator = createTestOrchestrator({
            kbSyncIntervalMs            : 0,
            backupIntervalMs            : 123456,
            graphLogCompactionIntervalMs: 777777,
            graphLogCompactionGetDueTask: options => {
                dueCalls.push(options);
                return null;
            },
            primaryDevSyncIntervalMs: 0,
            tenantRepoSyncIntervalMs: 0,
            dreamIntervalMs         : Number.MAX_SAFE_INTEGER,
            goldenPathIntervalMs    : Number.MAX_SAFE_INTEGER,
            swarmHeartbeatIntervalMs: Number.MAX_SAFE_INTEGER
        });

        orchestrator.poll();

        expect(dueCalls).toEqual([expect.objectContaining({
            graphLogCompactionIntervalMs: 777777
        })]);
    });

    test('skips graphlog-compaction when config disables the lane (#12394)', () => {
        const started      = [];
        const dueCalls     = [];
        const orchestrator = createTestOrchestrator({
            kbSyncIntervalMs            : 0,
            backupIntervalMs            : 0,
            graphLogCompactionEnabled   : false,
            graphLogCompactionIntervalMs: 600000,
            graphLogCompactionGetDueTask: options => {
                dueCalls.push(options);
                return options.enabled ? {
                    taskName: 'graphlog-compaction',
                    reason  : 'periodic-graphlog-compaction:600000'
                } : null;
            },
            primaryDevSyncIntervalMs: 0,
            tenantRepoSyncIntervalMs: 0,
            dreamIntervalMs         : Number.MAX_SAFE_INTEGER,
            goldenPathIntervalMs    : Number.MAX_SAFE_INTEGER,
            swarmHeartbeatIntervalMs: Number.MAX_SAFE_INTEGER
        });

        orchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                started.push({taskName, reason});
                return true;
            }
        };

        orchestrator.poll();

        expect(dueCalls).toEqual([expect.objectContaining({enabled: false})]);
        expect(started).toEqual([]);
    });

    test('resolves default paths correctly without configuration overrides', () => {
        // With configure() removed, path resolution is direct instance-field
        // assignment + buildTaskDefinitions(), mirroring the substrate-correct shape used
        // in `start()`. No side-effecting orchestrator.start() needed for path tests.
        const orchestrator = Neo.create(Orchestrator);
        const dataDir      = '/tmp/orchestrator-test-defaults';
        const repoRoot     = path.resolve(process.cwd());
        const scriptDir    = path.resolve(repoRoot, 'ai/scripts');

        orchestrator.dataDir         = dataDir;
        orchestrator.logFile         = path.join(dataDir, 'orchestrator.log');
        orchestrator.stateFile       = path.join(dataDir, 'orchestrator-state.json');
        orchestrator.taskDefinitions = buildTaskDefinitions({scriptDir, nodeBin: process.argv[0]});

        expect(orchestrator.logFile).toBe(path.join(dataDir, 'orchestrator.log'));
        expect(orchestrator.stateFile).toBe(path.join(dataDir, 'orchestrator-state.json'));

        const expectedSummaryScript  = path.resolve(repoRoot, 'ai/scripts/lifecycle/summarize-sessions.mjs');
        const expectedBackfillScript = path.resolve(repoRoot, 'ai/scripts/lifecycle/backfill-memory-summaries.mjs');
        const expectedKbSyncScript   = path.resolve(repoRoot, 'ai/scripts/maintenance/syncKnowledgeBase.mjs');

        expect(orchestrator.taskDefinitions.summary.args[0]).toBe(expectedSummaryScript);
        expect(orchestrator.taskDefinitions['memory-summary-backfill'].args[0]).toBe(expectedBackfillScript);
        expect(orchestrator.taskDefinitions.kbSync.args[0]).toBe(expectedKbSyncScript);
        expect(orchestrator.taskDefinitions.mlx).toBeUndefined();
    });

    test('passes local mlx launch model config into task definitions', () => {
        const savedMlx = {...AiConfig.orchestrator.mlx};

        try {
            AiConfig.orchestrator.mlx = {
                enabled: true,
                model  : 'operator-configured-mlx-model',
                port   : '11435'
            };

            const orchestrator = Neo.create(Orchestrator);
            orchestrator.dataDir         = '/tmp/orchestrator-test-mlx-model';
            orchestrator.taskDefinitions = orchestrator.buildConfiguredTaskDefinitions({
                scriptDir: path.resolve(process.cwd(), 'ai/scripts'),
                nodeBin  : process.argv[0]
            });

            expect(orchestrator.taskDefinitions.mlx.args).toContain('operator-configured-mlx-model');
            expect(orchestrator.taskDefinitions.mlx.args).not.toContain('gemma-4-31b-it');
        } finally {
            AiConfig.orchestrator.mlx = savedMlx;
        }
    });

    test('passes local lms launch port config into task definitions (#11986)', () => {
        const saved = {
            lms              : {...AiConfig.orchestrator.lms},
            openAiCompatible : {...AiConfig.openAiCompatible},
            providerReadiness: {...AiConfig.orchestrator.providerReadiness},
            modelProvider    : AiConfig.modelProvider,
            graphProvider    : AiConfig.graphProvider,
            embeddingProvider: AiConfig.embeddingProvider
        };

        try {
            AiConfig.orchestrator.lms = {enabled: true, model: 'qwen3-embedding-8b', port: '4242'};
            AiConfig.openAiCompatible = {
                host          : 'http://127.0.0.1:4242',
                model         : 'gemma4-31b',
                embeddingModel: 'qwen3-8b'
            };
            AiConfig.orchestrator.providerReadiness = {attempts: 2, delayMs: 0, timeoutMs: 50, routineCacheTtlMs: 1000};
            AiConfig.modelProvider     = 'openAiCompatible';
            AiConfig.graphProvider     = 'openAiCompatible';
            AiConfig.embeddingProvider = 'openAiCompatible';

            const orchestrator = Neo.create(Orchestrator);
            orchestrator.dataDir         = '/tmp/orchestrator-test-lms-port';
            orchestrator.taskDefinitions = orchestrator.buildConfiguredTaskDefinitions({
                scriptDir: path.resolve(process.cwd(), 'ai/scripts'),
                nodeBin  : process.argv[0]
            });

            expect(orchestrator.taskDefinitions.lms.command).toBe('lms');
            expect(orchestrator.taskDefinitions.lms.args).toEqual(['server', 'start', '--port', '4242']);
            expect(orchestrator.taskDefinitions.lms.pidFileName).toBe('lms.pid');
            expect(orchestrator.taskDefinitions.lms.requiredModels).toEqual(['gemma4-31b', 'qwen3-8b']);
        } finally {
            AiConfig.orchestrator.lms = saved.lms;
            AiConfig.openAiCompatible = saved.openAiCompatible;
            AiConfig.orchestrator.providerReadiness = saved.providerReadiness;
            AiConfig.modelProvider     = saved.modelProvider;
            AiConfig.graphProvider     = saved.graphProvider;
            AiConfig.embeddingProvider = saved.embeddingProvider;
        }
    });

    test('routes primary-dev-sync through its service coordinator', () => {
        const started      = [];
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
        const started      = [];
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
        const started      = [];
        const orchestrator = createTestOrchestrator({
            kbSyncIntervalMs        : 0,
            backupIntervalMs        : 0,
            tenantRepoSyncEnabled   : false,
            tenantRepoSyncIntervalMs: 600000,
            tenantRepoSyncService   : {
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

    test('delegates the configured dev-sync roots to PrimaryRepoSyncService via options.devSyncRootsConfig', () => {
        const received     = [];
        const orchestrator = createTestOrchestrator({
            kbSyncIntervalMs         : 0,
            backupIntervalMs         : 0,
            primaryDevSyncEnabled    : true,
            primaryDevSyncIntervalMs : 600000,
            primaryDevSyncRootsConfig: ['/config/neo'],
            primaryDevSyncGetDueTask : () => ({
                taskName: 'primary-dev-sync',
                reason  : 'periodic-sweep:600000'
            }),
            primaryRepoSyncService    : {
                runTask(options) {
                    received.push(options.devSyncRootsConfig);
                }
            }
        });

        orchestrator.processSupervisorService = {
            runTask() {}
        };

        orchestrator.poll();

        // Per the SSOT contract, env precedence is owned by `envBindings.orchestrator.devSyncRoots`
        // at config-load time, not by a runtime resolver. The orchestrator is responsible only for
        // delegating the resolved value via `options.devSyncRootsConfig`. Env-precedence assertions
        // belong to the envBindings tier, not this test.
        expect(received).toEqual([['/config/neo']]);
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Heavy-maintenance classification coverage:
    //   1. Pin DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES contents so future refactors
    //      can't silently drop a heavy class.
    //   2. Cross-poll deferral coverage for backup / dream / primary-dev-sync
    //      and proof that `backup` is now ALSO a valid blocker (previously: only
    //      summary↔kbSync pair was pinned at line 184).
    //
    // Golden-path is intentionally NOT in this set: it is light-classified maintenance.
    // Its dream-dependency backpressure is covered separately at line ~242.
    // ─────────────────────────────────────────────────────────────────────────────

    test('DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES pins the canonical heavy-classification set (#11513 AC2)', () => {
        // Asserts EXACT membership (frozen array) so a future refactor that drops a
        // class is caught at test-time. Order matters less than membership; using a
        // sorted-set assertion to decouple from declaration order.
        expect([...DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES].sort()).toEqual([
            'backup',
            'githubWorkflowSync',
            'graphlog-compaction',
            'kbSync',
            'memory-summary-backfill',
            'message-concept-harvest',
            'primary-dev-sync',
            'tenant-repo-sync',
            'dream',
            'summary'
        ].sort());
        expect(Object.isFrozen(DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES)).toBe(true);
        // Defensive: golden-path is intentionally OUT as light maintenance.
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

    test('defers due graphlog-compaction when another heavy maintenance task is already running (#12394)', () => {
        const outcomes = [];
        const started  = [];

        const orchestrator = createTestOrchestrator({
            healthService: {
                recordTaskOutcome(taskName, status, details) {
                    outcomes.push({taskName, status, details});
                }
            },
            graphLogCompactionGetDueTask: () => ({
                taskName: 'graphlog-compaction',
                reason  : 'periodic-graphlog-compaction:test'
            })
        });

        TaskStateService.taskState.summary.running = true;
        orchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                started.push({taskName, reason});
                return true;
            }
        };

        orchestrator.poll();

        expect(started.filter(s => s.taskName === 'graphlog-compaction')).toEqual([]);
        expect(outcomes).toContainEqual({
            taskName: 'graphlog-compaction',
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

        // backup is now the blocker because it belongs to the heavy set; without that
        // classification this test would observe kbSync running despite backup active.
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

    test('defers memory miniSummary backfill while kbSync is already running — compatible-pair reverted (#13358)', () => {
        const outcomes = [];
        const started  = [];

        const orchestrator = createTestOrchestrator({
            healthService: {
                recordTaskOutcome(taskName, status, details) {
                    outcomes.push({taskName, status, details});
                }
            },
            backupIntervalMs            : Number.MAX_SAFE_INTEGER,
            graphLogCompactionIntervalMs: Number.MAX_SAFE_INTEGER,
            primaryDevSyncIntervalMs    : Number.MAX_SAFE_INTEGER,
            dreamIntervalMs             : Number.MAX_SAFE_INTEGER
        });

        orchestrator.db = {
            prepare(sql) {
                if (sql.includes('COUNT(*)')) {
                    return {
                        get: () => ({n: 3647})
                    };
                }

                return {
                    all: () => [{id: 'memory-1'}]
                };
            }
        };

        TaskStateService.taskState.kbSync.running = true;
        orchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                started.push({taskName, reason});
                return true;
            }
        };

        orchestrator.poll();

        // Regression revert: kbSync + memory-summary-backfill are no longer a compatible pair, so the
        // backfill is DEFERRED (serialized) while kbSync runs rather than racing concurrently — the
        // inherited-token race is what skipped kb-sync's embedding for days.
        expect(started).not.toContainEqual({
            taskName: 'memory-summary-backfill',
            reason  : 'pending-memory-minisummary:3647'
        });
        expect(outcomes).toContainEqual({
            taskName: 'memory-summary-backfill',
            status  : 'skipped',
            details : expect.objectContaining({
                blockingTaskName: 'kbSync',
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

    test('dream — does not immediately rerun after a cadence-overflowing completed cycle (#12289)', () => {
        const cycleCalls  = [];
        const outcomes    = [];
        const intervalMs  = 3600000;
        const completedAt = Date.now() - 13000;
        const runtimeMs   = 5262119;

        const orchestrator = createTestOrchestrator({
            summarySweepIntervalMs  : Number.MAX_SAFE_INTEGER,
            kbSyncIntervalMs        : Number.MAX_SAFE_INTEGER,
            backupIntervalMs        : Number.MAX_SAFE_INTEGER,
            primaryDevSyncIntervalMs: Number.MAX_SAFE_INTEGER,
            tenantRepoSyncIntervalMs: Number.MAX_SAFE_INTEGER,
            dreamIntervalMs         : intervalMs,
            dreamOverflowThreshold  : 0.8,
            goldenPathIntervalMs    : Number.MAX_SAFE_INTEGER,
            swarmHeartbeatIntervalMs: Number.MAX_SAFE_INTEGER,
            healthService           : {
                recordTaskOutcome(taskName, status, details) {
                    outcomes.push({taskName, status, details});
                }
            },
            dreamService: {
                executeRemCycle: async options => {
                    cycleCalls.push(options);
                    return {
                        status           : 'completed',
                        runId            : 'rem-unexpected',
                        reason           : options.reason,
                        mode             : options.mode,
                        startedAt        : new Date().toISOString(),
                        completedAt      : new Date().toISOString(),
                        durationMs       : 1,
                        sessionsProcessed: 0
                    };
                }
            }
        });

        TaskStateService.taskState.dream.lastRunAt     = completedAt - runtimeMs;
        TaskStateService.taskState.dream.lastSuccessAt = new Date(completedAt).toISOString();

        orchestrator.poll();

        expect(cycleCalls).toEqual([]);
        expect(outcomes.filter(o => o.taskName === 'dream')).toEqual([]);
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
        // In-process activeHeavyTask is per-process; the file lease is the only
        // cross-process mutex. Without this test the cross-daemon coverage gap would
        // regress silently.
        const sharedLeasePath = `/tmp/orchestrator-test/heavy-maintenance-lease-cross-daemon-${process.pid}-${++testOrchestratorSeq}.json`;

        const outcomesA = [];
        const outcomesB = [];
        const startedA  = [];
        const startedB  = [];

        const orchestratorA = createTestOrchestrator({
            heavyMaintenanceLeasePath: sharedLeasePath,
            healthService            : {
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
            healthService            : {
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
    // Swarm-heartbeat lane. The standalone swarm-heartbeat daemon is folded
    // into the Orchestrator as a config-gated scheduled lane. The lane runs
    // `SwarmHeartbeatService.pulse()` per cadence tick and is skipped when disabled.
    // It is NOT a heavy-maintenance task — it runs directly without backpressure.
    // ─────────────────────────────────────────────────────────────────────────────

    test('runs the swarm-heartbeat pulse when the lane is enabled and due (#11766)', async () => {
        const pulseCalls = [];

        const orchestrator = createTestOrchestrator({
            kbSyncEnabled           : false,
            swarmHeartbeatEnabled   : true,
            swarmHeartbeatIntervalMs: 600000,
            swarmHeartbeatService   : {
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
            kbSyncEnabled           : false,
            swarmHeartbeatEnabled   : false,
            swarmHeartbeatIntervalMs: 600000,
            swarmHeartbeatService   : {
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
            kbSyncEnabled           : false,
            swarmHeartbeatEnabled   : true,
            swarmHeartbeatIntervalMs: 600000,
            healthService           : {
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

    test('dream — delegates to dreamService.executeRemCycle + maps typed failed outcome to recordTaskOutcome with diagnostic', async () => {
        const outcomes   = [];
        const cycleCalls = [];
        const diagnostic = {
            reason       : 'PROVIDER_READINESS_TIMEOUT',
            provider     : 'openAiCompatible',
            graphProvider: 'openAiCompatible',
            modelProvider: 'gemini',
            host         : 'http://127.0.0.1:13090',
            endpoint     : '/v1/models',
            url          : 'http://127.0.0.1:13090/v1/models',
            supported    : true,
            model        : 'mlx-community/gemma-4',
            attempts     : 30,
            elapsedMs    : 30000,
            timeoutMs    : 30000,
            nextAction   : 'Start the configured OpenAI-compatible provider, then rerun npm run ai:run-sandman.'
        };

        const orchestrator = createTestOrchestrator({
            kbSyncEnabled  : false,
            dreamIntervalMs: 1,
            healthService  : {
                recordTaskOutcome(taskName, status, details) {
                    outcomes.push({taskName, status, details});
                }
            },
            dreamService: {
                executeRemCycle: async options => {
                    cycleCalls.push(options);
                    return {
                        status           : 'failed',
                        runId            : 'rem-test-id',
                        reason           : options.reason,
                        mode             : options.mode,
                        startedAt        : new Date().toISOString(),
                        completedAt      : new Date().toISOString(),
                        durationMs       : 12,
                        sessionsProcessed: null,
                        diagnostic,
                        skipReason       : null,
                        error            : null
                    };
                }
            }
        });

        orchestrator.poll();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(cycleCalls).toHaveLength(1);
        expect(cycleCalls[0]).toMatchObject({
            reason      : 'periodic-dream:1',
            mode        : 'periodic',
            includeDecay: true
        });

        const failed = outcomes.find(o => o.taskName === 'dream' && o.status === 'failed');
        expect(failed).toBeDefined();
        expect(failed.details).toMatchObject({
            failurePhase: 'provider-readiness',
            diagnostic  : expect.objectContaining({
                reason       : 'PROVIDER_READINESS_TIMEOUT',
                provider     : 'openAiCompatible',
                graphProvider: 'openAiCompatible',
                nextAction   : expect.stringContaining('Start the configured')
            })
        });

        const dreamState = TaskStateService.getTaskState('dream');
        expect(dreamState?.lastReason).toBe('PROVIDER_READINESS_TIMEOUT');
    });

});

test.describe('Neo.ai.daemons.Orchestrator — chroma max-runtime recycle (#12138)', () => {
    let savedChroma;

    test.beforeEach(() => { savedChroma = AiConfig.orchestrator.chroma; });
    test.afterEach(()  => { AiConfig.orchestrator.chroma = savedChroma; });

    function recycleMock(sink) {
        return {
            reconcileSingletonPort() {},
            killTask(taskName, reason) { sink.killed.push({taskName, reason}); },
            superviseTask(taskName)    { sink.supervised?.push(taskName); },
            runTask(taskName, reason)  { sink.started.push({taskName, reason}); return true; }
        };
    }

    test('isChromaRecycleDue: true only when running, ceiling > 0, and uptime exceeds it', () => {
        AiConfig.orchestrator.chroma = {maxRuntimeMs: 1000};
        const orchestrator = createTestOrchestrator();
        const now          = Date.now();

        expect(orchestrator.isChromaRecycleDue({running: true,  lastRunAt: now - 5000}, now)).toBe(true);
        expect(orchestrator.isChromaRecycleDue({running: true,  lastRunAt: now - 500},  now)).toBe(false);
        expect(orchestrator.isChromaRecycleDue({running: false, lastRunAt: now - 5000}, now)).toBe(false);
        // lastRunAt === 0 (uninitialized / harness default) must NOT read as huge uptime.
        expect(orchestrator.isChromaRecycleDue({running: true,  lastRunAt: 0},          now)).toBe(false);
    });

    test('does not recycle a running chroma with an uninitialized start stamp (lastRunAt=0)', () => {
        // Regression for the CI-only failure: the harness sets chroma.running=true with the
        // default lastRunAt=0; with a real maxRuntimeMs this previously read as now-0 = huge
        // uptime and spuriously recycled, polluting unrelated poll() tests.
        AiConfig.orchestrator.chroma = {maxRuntimeMs: 1000};
        const sink         = {killed: [], started: []};
        const orchestrator = createTestOrchestrator();

        TaskStateService.taskState.chroma.running   = true;
        TaskStateService.taskState.chroma.lastRunAt = 0;
        orchestrator.processSupervisorService = recycleMock(sink);

        orchestrator.poll();

        expect(sink.killed).toEqual([]);
        expect(orchestrator._chromaDefragPending).toBeFalsy();
    });

    test('isChromaRecycleDue: false when the ceiling is 0 (recycling disabled)', () => {
        const orchestrator = createTestOrchestrator();
        const now          = Date.now();

        AiConfig.orchestrator.chroma = {maxRuntimeMs: 0};
        expect(orchestrator.isChromaRecycleDue({running: true, lastRunAt: now - 999999}, now)).toBe(false);
    });

    test('recycles an over-age chroma daemon: kills it and flags a pending defrag', () => {
        AiConfig.orchestrator.chroma = {maxRuntimeMs: 1000};
        const sink         = {killed: [], started: []};
        const orchestrator = createTestOrchestrator();

        TaskStateService.taskState.chroma.running   = true;
        TaskStateService.taskState.chroma.lastRunAt = Date.now() - 5000;
        orchestrator.processSupervisorService = recycleMock(sink);

        orchestrator.poll();

        expect(sink.killed).toHaveLength(1);
        expect(sink.killed[0].taskName).toBe('chroma');
        expect(sink.killed[0].reason).toContain('max-runtime');
        expect(orchestrator._chromaDefragPending).toBe(true);
    });

    test('defers an over-age chroma recycle while the heavy-maintenance lease is active', () => {
        AiConfig.orchestrator.chroma = {maxRuntimeMs: 1000};
        const sink         = {killed: [], started: [], supervised: []};
        const orchestrator = createTestOrchestrator();
        const now          = Date.now();

        fs.ensureDirSync(path.dirname(orchestrator.heavyMaintenanceLeasePath));
        fs.writeJsonSync(orchestrator.heavyMaintenanceLeasePath, {
            owner       : 'kbSync',
            reason      : 'scheduled',
            pid         : process.pid,
            token       : 'test-token',
            acquiredAt  : new Date(now - 1000).toISOString(),
            staleAfterMs: 600000,
            expiresAt   : new Date(now + 600000).toISOString()
        });

        TaskStateService.taskState.chroma.running   = true;
        TaskStateService.taskState.chroma.lastRunAt = now - 5000;
        orchestrator.processSupervisorService = recycleMock(sink);

        orchestrator.poll();

        expect(sink.killed).toEqual([]);
        expect(sink.supervised).toContain('chroma');
        expect(orchestrator._chromaDefragPending).toBeFalsy();

        fs.removeSync(orchestrator.heavyMaintenanceLeasePath);

        orchestrator.poll();

        expect(sink.killed).toHaveLength(1);
        expect(sink.killed[0].taskName).toBe('chroma');
        expect(orchestrator._chromaDefragPending).toBe(true);
    });

    test('does not recycle a chroma daemon within its max-runtime ceiling', () => {
        AiConfig.orchestrator.chroma = {maxRuntimeMs: 60000};
        const sink         = {killed: [], started: []};
        const orchestrator = createTestOrchestrator();

        TaskStateService.taskState.chroma.running   = true;
        TaskStateService.taskState.chroma.lastRunAt = Date.now() - 1000;
        orchestrator.processSupervisorService = recycleMock(sink);

        orchestrator.poll();

        expect(sink.killed).toEqual([]);
        expect(orchestrator._chromaDefragPending).toBeFalsy();
    });

    test('does not recycle chroma in cloud mode (daemon lane disabled)', () => {
        AiConfig.orchestrator.chroma = {maxRuntimeMs: 1000};
        const sink         = {killed: [], started: []};
        const orchestrator = createTestOrchestrator({deploymentMode: 'cloud', kbSyncEnabled: false});

        TaskStateService.taskState.chroma.running   = true;
        TaskStateService.taskState.chroma.lastRunAt = Date.now() - 5000;
        orchestrator.processSupervisorService = recycleMock(sink);

        orchestrator.poll();

        expect(sink.killed).toEqual([]);
        expect(orchestrator._chromaDefragPending).toBeFalsy();
    });

    test('spawns the KB defrag once the restarted chroma is connection-ready', async () => {
        AiConfig.orchestrator.chroma = {maxRuntimeMs: 60000};
        const sink         = {killed: [], started: []};
        const orchestrator = createTestOrchestrator();

        // Post-kill state: chroma restarted + running (fresh lastRunAt → not recycle-due), defrag pending.
        TaskStateService.taskState.chroma.running   = true;
        TaskStateService.taskState.chroma.lastRunAt = Date.now();
        orchestrator._chromaDefragPending = true;
        orchestrator.probeChromaReady     = () => Promise.resolve(true);
        orchestrator.processSupervisorService = recycleMock(sink);

        orchestrator.poll();
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(sink.started).toContainEqual({taskName: 'chromaDefrag', reason: 'chroma-recycle-defrag'});
        expect(orchestrator._chromaDefragPending).toBe(false);
    });

    test('does not start pending chroma defrag while the heavy-maintenance lease is active', async () => {
        AiConfig.orchestrator.chroma = {maxRuntimeMs: 60000};
        const sink         = {killed: [], started: []};
        const orchestrator = createTestOrchestrator();
        const now          = Date.now();

        fs.ensureDirSync(path.dirname(orchestrator.heavyMaintenanceLeasePath));
        fs.writeJsonSync(orchestrator.heavyMaintenanceLeasePath, {
            owner       : 'kbSync',
            reason      : 'scheduled',
            pid         : process.pid,
            token       : 'test-token',
            acquiredAt  : new Date(now - 1000).toISOString(),
            staleAfterMs: 600000,
            expiresAt   : new Date(now + 600000).toISOString()
        });

        TaskStateService.taskState.chroma.running   = true;
        TaskStateService.taskState.chroma.lastRunAt = now;
        orchestrator._chromaDefragPending = true;
        orchestrator.probeChromaReady     = () => Promise.resolve(true);
        orchestrator.processSupervisorService = recycleMock(sink);

        orchestrator.poll();
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(sink.started.find(s => s.taskName === 'chromaDefrag')).toBeUndefined();
        expect(orchestrator._chromaDefragPending).toBe(true);

        fs.removeSync(orchestrator.heavyMaintenanceLeasePath);
    });

    test('does not spawn the defrag while the restarted chroma is not yet connection-ready', async () => {
        AiConfig.orchestrator.chroma = {maxRuntimeMs: 60000};
        const sink         = {killed: [], started: []};
        const orchestrator = createTestOrchestrator();

        TaskStateService.taskState.chroma.running   = true;
        TaskStateService.taskState.chroma.lastRunAt = Date.now();
        orchestrator._chromaDefragPending = true;
        orchestrator.probeChromaReady     = () => Promise.resolve(false);
        orchestrator.processSupervisorService = recycleMock(sink);

        orchestrator.poll();
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(sink.started.find(s => s.taskName === 'chromaDefrag')).toBeUndefined();
        expect(orchestrator._chromaDefragPending).toBe(true);
    });
});
