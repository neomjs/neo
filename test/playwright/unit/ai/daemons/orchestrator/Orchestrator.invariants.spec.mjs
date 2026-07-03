import {test, expect}   from '@playwright/test';
import {execFile}       from 'child_process';
import fs               from 'fs/promises';
import path             from 'path';
import {promisify}      from 'util';
import {fileURLToPath}  from 'url';
import Neo              from '../../../../../../src/Neo.mjs';
import * as core        from '../../../../../../src/core/_export.mjs';
import AiConfig         from '../../../../../../ai/config.mjs';
import memoryCoreConfig from '../../../../../../ai/mcp/server/memory-core/config.mjs';
import {
    Orchestrator
} from '../../../../../../ai/daemons/orchestrator/Orchestrator.mjs';
import {
    buildLmsPreloadConfig
} from '../../../../../../ai/services/graph/providerReadinessHelper.mjs';
import {
    buildTaskDefinitions
} from '../../../../../../ai/daemons/orchestrator/taskDefinitions.mjs';
import TaskStateService, {createInitialTaskState} from '../../../../../../ai/daemons/orchestrator/services/TaskStateService.mjs';

const __filename    = fileURLToPath(import.meta.url);
const __dirname     = path.dirname(__filename);
const REPO_ROOT     = path.resolve(__dirname, '../../../../../..');
const execFileAsync = promisify(execFile);

const ORCHESTRATOR_MJS_PATH                    = path.join(REPO_ROOT, 'ai/daemons/orchestrator/Orchestrator.mjs');
const ORCHESTRATOR_DAEMON_PATH                 = path.join(REPO_ROOT, 'ai/daemons/orchestrator/daemon.mjs');
const TASK_DEFINITIONS_MJS_PATH                = path.join(REPO_ROOT, 'ai/daemons/orchestrator/taskDefinitions.mjs');
const CONFIGURED_TASK_DEFINITIONS_SERVICE_PATH = path.join(
    REPO_ROOT,
    'ai/daemons/orchestrator/services/ConfiguredTaskDefinitionsService.mjs'
);
const SIBLING_DAEMON_CONFIG_PATHS = {
    'SwarmHeartbeatService.mjs'     : path.join(REPO_ROOT, 'ai/daemons/orchestrator/services/SwarmHeartbeatService.mjs'),
    'KbAlertingService.mjs'         : path.join(REPO_ROOT, 'ai/daemons/kb-alerting/KbAlertingService.mjs'),
    'KbReconciliationService.mjs'   : path.join(REPO_ROOT, 'ai/daemons/kb-reconciliation/KbReconciliationService.mjs'),
    'KbGarbageCollectionService.mjs': path.join(REPO_ROOT, 'ai/daemons/kb-gc/KbGarbageCollectionService.mjs')
};

let invariantSeq                   = 0;
let savedIntervals                 = null;
let savedLocalOnly                 = null;
let savedCloudOnly                 = null;
let savedDeploymentMode            = null;
let savedMlxConfig                 = undefined;
let savedLmsConfig                 = undefined;
let savedOrchestratorOllamaConfig  = undefined;
let savedProviderOllamaConfig      = undefined;
let savedOpenAiCompatibleConfig    = undefined;
let savedChatProvider              = undefined;
let savedModelProvider             = undefined;
let savedGraphProvider             = undefined;
let savedEmbeddingProvider         = undefined;
let savedEnvKbSyncEnabled          = undefined;
let savedEnvKbSyncInterval         = undefined;
let savedEnvTenantRepoSyncEnabled  = undefined;
let savedEnvTenantRepoSyncInterval = undefined;
let savedEnvChromaDaemonEnabled    = undefined;
let savedEnvMlxEnabled             = undefined;
let savedEnvMlxModel               = undefined;
let savedEnvMlxPort                = undefined;
let savedEnvLmsEnabled             = undefined;
let savedEnvLmsModel               = undefined;
let savedEnvLmsPort                = undefined;
let savedEnvOllamaEnabled          = undefined;

function createMinimalOrchestrator() {
    const taskDefinitions = buildTaskDefinitions({
        scriptDir: '/repo/ai/scripts',
        nodeBin  : '/node'
    });

    TaskStateService.configure({
        stateFile : '/tmp/orchestrator-test/state.json',
        taskDefinitions,
        writeLogFn: () => {}
    });
    TaskStateService.taskState = createInitialTaskState(taskDefinitions);

    return Neo.create(Orchestrator, {
        dataDir                  : '/tmp/orchestrator-test',
        stateFile                : '/tmp/orchestrator-test/state.json',
        logFile                  : null,
        heavyMaintenanceLeasePath: `/tmp/orchestrator-test/heavy-maintenance-lease-${process.pid}-${++invariantSeq}.json`,
        taskDefinitions,
        taskStateService         : TaskStateService,
        healthService            : {recordTaskOutcome() {}},
        spawnFn                  : () => { throw new Error('spawnFn not expected'); }
    });
}

test.beforeEach(() => {
    savedIntervals      = {...AiConfig.orchestrator.intervals};
    savedLocalOnly      = {...AiConfig.orchestrator.localOnly};
    savedCloudOnly      = AiConfig.orchestrator.cloudOnly ? {...AiConfig.orchestrator.cloudOnly} : null;
    savedDeploymentMode = AiConfig.orchestrator.deploymentMode;
    savedMlxConfig      = AiConfig.orchestrator.mlx ? {...AiConfig.orchestrator.mlx} : undefined;
    savedLmsConfig      = AiConfig.orchestrator.lms ? {...AiConfig.orchestrator.lms} : undefined;
    savedOrchestratorOllamaConfig = AiConfig.orchestrator.ollama ? {...AiConfig.orchestrator.ollama} : undefined;
    savedProviderOllamaConfig     = AiConfig.ollama ? {...AiConfig.ollama} : undefined;
    savedOpenAiCompatibleConfig = AiConfig.openAiCompatible ? {...AiConfig.openAiCompatible} : undefined;
    savedChatProvider           = AiConfig.chatProvider;
    savedModelProvider          = AiConfig.modelProvider;
    savedGraphProvider          = AiConfig.graphProvider;
    savedEmbeddingProvider      = AiConfig.embeddingProvider;

    savedEnvKbSyncEnabled          = process.env.NEO_ORCHESTRATOR_KB_SYNC_ENABLED;
    savedEnvKbSyncInterval         = process.env.NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS;
    savedEnvTenantRepoSyncEnabled  = process.env.NEO_ORCHESTRATOR_TENANT_REPO_SYNC_ENABLED;
    savedEnvTenantRepoSyncInterval = process.env.NEO_ORCHESTRATOR_TENANT_REPO_SYNC_INTERVAL_MS;
    savedEnvChromaDaemonEnabled    = process.env.NEO_ORCHESTRATOR_CHROMA_DAEMON_ENABLED;
    savedEnvMlxEnabled             = process.env.NEO_ORCHESTRATOR_MLX_ENABLED;
    savedEnvMlxModel               = process.env.NEO_ORCHESTRATOR_MLX_MODEL;
    savedEnvMlxPort                = process.env.NEO_ORCHESTRATOR_MLX_PORT;
    savedEnvLmsEnabled             = process.env.NEO_ORCHESTRATOR_LMS_ENABLED;
    savedEnvLmsModel               = process.env.NEO_ORCHESTRATOR_LMS_MODEL;
    savedEnvLmsPort                = process.env.NEO_ORCHESTRATOR_LMS_PORT;
    savedEnvOllamaEnabled          = process.env.NEO_ORCHESTRATOR_OLLAMA_ENABLED;
});

test.afterEach(() => {
    Object.assign(AiConfig.orchestrator.intervals, savedIntervals);
    restoreConfigObject(AiConfig.orchestrator.localOnly, savedLocalOnly);
    if (savedCloudOnly) {
        restoreConfigObject(AiConfig.orchestrator.cloudOnly, savedCloudOnly);
    }
    AiConfig.orchestrator.deploymentMode = savedDeploymentMode;

    // Restore full supervised-server config objects. Stale local overlays may not yet carry
    // `orchestrator.ollama`, so keep its absent-state distinct from mlx/lms.
    if (savedMlxConfig !== undefined) {
        AiConfig.orchestrator.mlx = savedMlxConfig;
    }
    if (savedLmsConfig !== undefined) {
        AiConfig.orchestrator.lms = savedLmsConfig;
    }
    if (savedOrchestratorOllamaConfig === undefined) {
        delete AiConfig.orchestrator.ollama;
    } else {
        AiConfig.orchestrator.ollama = savedOrchestratorOllamaConfig;
    }
    if (savedProviderOllamaConfig === undefined) {
        delete AiConfig.ollama;
    } else {
        AiConfig.ollama = savedProviderOllamaConfig;
    }
    if (savedOpenAiCompatibleConfig === undefined) {
        delete AiConfig.openAiCompatible;
    } else {
        AiConfig.openAiCompatible = savedOpenAiCompatibleConfig;
    }
    AiConfig.chatProvider      = savedChatProvider;
    AiConfig.modelProvider     = savedModelProvider;
    AiConfig.graphProvider     = savedGraphProvider;
    AiConfig.embeddingProvider = savedEmbeddingProvider;

    restoreEnv('NEO_ORCHESTRATOR_KB_SYNC_ENABLED',           savedEnvKbSyncEnabled);
    restoreEnv('NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS',       savedEnvKbSyncInterval);
    restoreEnv('NEO_ORCHESTRATOR_TENANT_REPO_SYNC_ENABLED',  savedEnvTenantRepoSyncEnabled);
    restoreEnv('NEO_ORCHESTRATOR_TENANT_REPO_SYNC_INTERVAL_MS', savedEnvTenantRepoSyncInterval);
    restoreEnv('NEO_ORCHESTRATOR_CHROMA_DAEMON_ENABLED',     savedEnvChromaDaemonEnabled);
    restoreEnv('NEO_ORCHESTRATOR_MLX_ENABLED',               savedEnvMlxEnabled);
    restoreEnv('NEO_ORCHESTRATOR_MLX_MODEL',                 savedEnvMlxModel);
    restoreEnv('NEO_ORCHESTRATOR_MLX_PORT',                  savedEnvMlxPort);
    restoreEnv('NEO_ORCHESTRATOR_LMS_ENABLED',               savedEnvLmsEnabled);
    restoreEnv('NEO_ORCHESTRATOR_LMS_MODEL',                 savedEnvLmsModel);
    restoreEnv('NEO_ORCHESTRATOR_LMS_PORT',                  savedEnvLmsPort);
    restoreEnv('NEO_ORCHESTRATOR_OLLAMA_ENABLED',            savedEnvOllamaEnabled);
});

function restoreEnv(name, prior) {
    if (prior === undefined) {
        delete process.env[name];
    } else {
        process.env[name] = prior;
    }
}

function restoreConfigObject(target, prior) {
    for (const key of Object.keys(target)) {
        if (!(key in prior)) {
            delete target[key];
        }
    }

    Object.assign(target, prior);
}

test.describe('Orchestrator config getters delegate to AiConfig (data env/parse layer is the env-precedence SSOT)', () => {
    test('boolean enable getter reads AiConfig.orchestrator.localOnly verbatim when value is explicit', () => {
        AiConfig.orchestrator.localOnly.kbSyncEnabled = false;
        expect(createMinimalOrchestrator().kbSyncEnabled).toBe(false);

        AiConfig.orchestrator.localOnly.kbSyncEnabled = true;
        expect(createMinimalOrchestrator().kbSyncEnabled).toBe(true);
    });

    test('AiConfig.localOnly.X=null falls through to deployment-profile default (local enables, cloud disables)', () => {
        AiConfig.orchestrator.localOnly.kbSyncEnabled = null;

        AiConfig.orchestrator.deploymentMode = 'local';
        expect(createMinimalOrchestrator().kbSyncEnabled).toBe(true);

        AiConfig.orchestrator.deploymentMode = 'cloud';
        expect(createMinimalOrchestrator().kbSyncEnabled).toBe(false);
    });

    test('chromaDaemonEnabled follows deployment profile default + explicit override (#12019)', () => {
        AiConfig.orchestrator.localOnly.chromaDaemonEnabled = null;

        AiConfig.orchestrator.deploymentMode = 'local';
        expect(createMinimalOrchestrator().chromaDaemonEnabled).toBe(true);

        AiConfig.orchestrator.deploymentMode = 'cloud';
        expect(createMinimalOrchestrator().chromaDaemonEnabled).toBe(false);

        AiConfig.orchestrator.localOnly.chromaDaemonEnabled = true;
        expect(createMinimalOrchestrator().chromaDaemonEnabled).toBe(true);

        AiConfig.orchestrator.localOnly.chromaDaemonEnabled = false;
        AiConfig.orchestrator.deploymentMode = 'local';
        expect(createMinimalOrchestrator().chromaDaemonEnabled).toBe(false);
    });

    test('AiConfig.data mutations are isolated per test via beforeEach/afterEach restore', () => {
        const baselineKbSync   = savedIntervals.kbSyncMs;
        const baselineLocalKbs = savedLocalOnly.kbSyncEnabled;

        AiConfig.orchestrator.intervals.kbSyncMs = 99_000;
        AiConfig.orchestrator.localOnly.kbSyncEnabled = !baselineLocalKbs;

        expect(AiConfig.orchestrator.intervals.kbSyncMs).toBe(99_000);
        expect(AiConfig.orchestrator.localOnly.kbSyncEnabled).toBe(!baselineLocalKbs);
    });

    // === mlx + lms + ollama supervised-server task composition ===
    // AiConfig.orchestrator.mlx/.lms/.ollama + NEO_ORCHESTRATOR_* env vars
    // env vars are saved/restored by the file-level beforeEach/afterEach hooks above —
    // individual tests can mutate freely without leak risk.

    test('buildConfiguredTaskDefinitions reads AiConfig.orchestrator.mlx at the daemon use site', () => {
        AiConfig.orchestrator.mlx = {enabled: true, model: 'mlx-from-config', port: '11999'};
        const enabledTasks = createMinimalOrchestrator().buildConfiguredTaskDefinitions({
            scriptDir: '/repo/ai/scripts',
            nodeBin  : '/node'
        });

        expect(enabledTasks.mlx.args).toEqual([
            '-m',
            'mlx_lm.server',
            '--model',
            'mlx-from-config',
            '--port',
            '11999'
        ]);

        AiConfig.orchestrator.mlx = {enabled: false, model: 'm', port: '11435'};
        const disabledTasks = createMinimalOrchestrator().buildConfiguredTaskDefinitions({
            scriptDir: '/repo/ai/scripts',
            nodeBin  : '/node'
        });
        expect(disabledTasks.mlx).toBeUndefined();
    });

    test('buildConfiguredTaskDefinitions composes LMS from AiConfig provider-role selectors', () => {
        AiConfig.orchestrator.lms = {enabled: true, model: 'lms-from-config', port: '4242'};
        AiConfig.openAiCompatible = {
            host          : 'http://127.0.0.1:4242',
            model         : 'chat-from-config',
            embeddingModel: 'embedding-from-config'
        };
        AiConfig.modelProvider     = 'gemini';
        AiConfig.graphProvider     = 'openAiCompatible';
        AiConfig.embeddingProvider = 'openAiCompatible';

        const o = createMinimalOrchestrator();
        expect(o.buildConfiguredTaskDefinitions({
            scriptDir: '/repo/ai/scripts',
            nodeBin  : '/node'
        }).lms).toMatchObject({
            command       : 'lms',
            args          : ['server', 'start', '--port', '4242'],
            requiredModels: ['chat-from-config', 'embedding-from-config']
        });

        AiConfig.embeddingProvider = 'gemini';
        expect(createMinimalOrchestrator().buildConfiguredTaskDefinitions({
            scriptDir: '/repo/ai/scripts',
            nodeBin  : '/node'
        }).lms.requiredModels).toEqual(['chat-from-config']);

        AiConfig.graphProvider = 'ollama';
        expect(createMinimalOrchestrator().buildConfiguredTaskDefinitions({
            scriptDir: '/repo/ai/scripts',
            nodeBin  : '/node'
        }).lms.requiredModels).toEqual([]);

        AiConfig.orchestrator.lms = {enabled: false, model: 'qwen', port: '1234'};
        expect(createMinimalOrchestrator().buildConfiguredTaskDefinitions({
            scriptDir: '/repo/ai/scripts',
            nodeBin  : '/node'
        }).lms).toBeUndefined();
    });

    test('buildConfiguredTaskDefinitions composes native Ollama from AiConfig provider-role selectors', () => {
        AiConfig.orchestrator.ollama = {enabled: true};
        AiConfig.ollama = {
            host                 : 'http://127.0.0.1:11434',
            model                : 'ollama-chat-from-config',
            embeddingModel       : 'ollama-embedding-from-config',
            keep_alive           : -1,
            requireParallelModels: 2
        };
        AiConfig.modelProvider     = 'gemini';
        AiConfig.graphProvider     = 'ollama';
        AiConfig.embeddingProvider = 'ollama';

        const o = createMinimalOrchestrator();
        expect(o.buildConfiguredTaskDefinitions({
            scriptDir: '/repo/ai/scripts',
            nodeBin  : '/node'
        }).ollama).toMatchObject({
            command       : 'ollama',
            args          : ['serve'],
            requiredModels: ['ollama-chat-from-config', 'ollama-embedding-from-config'],
            singletonPort : 11434,
            env           : {
                OLLAMA_HOST             : '127.0.0.1:11434',
                OLLAMA_KEEP_ALIVE       : '-1',
                OLLAMA_MAX_LOADED_MODELS: '2'
            }
        });

        AiConfig.embeddingProvider = 'gemini';
        expect(createMinimalOrchestrator().buildConfiguredTaskDefinitions({
            scriptDir: '/repo/ai/scripts',
            nodeBin  : '/node'
        }).ollama.requiredModels).toEqual(['ollama-chat-from-config']);

        AiConfig.graphProvider = 'openAiCompatible';
        expect(createMinimalOrchestrator().buildConfiguredTaskDefinitions({
            scriptDir: '/repo/ai/scripts',
            nodeBin  : '/node'
        }).ollama).toBeUndefined();

        AiConfig.orchestrator.ollama = {enabled: false};
        expect(createMinimalOrchestrator().buildConfiguredTaskDefinitions({
            scriptDir: '/repo/ai/scripts',
            nodeBin  : '/node'
        }).ollama).toBeUndefined();
    });

    test('buildLmsPreloadConfig only reads provider-role selectors, not non-null model leaves (#12264)', () => {
        expect(buildLmsPreloadConfig({
            modelProvider    : 'gemini',
            graphProvider    : 'ollama',
            embeddingProvider: 'openAiCompatible',
            openAiCompatible : {
                model         : 'shared-model',
                embeddingModel: 'shared-model'
            },
            localModels: {
                chat     : {contextLimitTokens: 262144},
                embedding: {contextLimitTokens: 8192, parallel: 1}
            }
        })).toEqual({
            models        : ['shared-model'],
            contextLengths: {'shared-model': 8192},
            parallels     : {'shared-model': 1}
        });

        expect(buildLmsPreloadConfig({
            modelProvider    : 'openAiCompatible',
            graphProvider    : 'ollama',
            embeddingProvider: 'gemini',
            openAiCompatible : {
                model         : 'chat-model',
                embeddingModel: 'embedding-model'
            },
            localModels: {
                chat     : {contextLimitTokens: 262144},
                embedding: {contextLimitTokens: 8192}
            }
        })).toEqual({
            models        : ['chat-model'],
            contextLengths: {'chat-model': 262144},
            parallels     : {}
        })
    });

    test('buildLmsPreloadConfig threads role parallel values into the parallels map (#13700, #13948)', () => {
        const result = buildLmsPreloadConfig({
            modelProvider    : 'openAiCompatible',
            graphProvider    : 'openAiCompatible',
            embeddingProvider: 'openAiCompatible',
            openAiCompatible : {
                model         : 'gemma-4-31b-it',
                embeddingModel: 'qwen3-embedding'
            },
            localModels: {
                chat     : {contextLimitTokens: 131072, parallel: 1},
                embedding: {contextLimitTokens: 32768, parallel: 1}
            }
        });
        // Per-model slot counts are distinct from requireParallelModels, which governs how many
        // distinct configured models stay co-resident.
        expect(result.parallels).toEqual({
            'gemma-4-31b-it' : 1,
            'qwen3-embedding': 1
        });
    });

});

test.describe('Orchestrator parent-prop propagation (#11834 AC3)', () => {
    // Propagation assertions use witness-property checks rather than reference equality:
    // child reactive setters may wrap input via `ClassSystemUtil.beforeSetInstance`, so
    // `===` against the source object can false-negative. The contract Sub-1 establishes
    // is that the *value content* flows through `afterSetX` to the child services.

    test('mutating orchestrator.taskDefinitions propagates to processSupervisorService via afterSetTaskDefinitions hook', () => {
        const orchestrator = createMinimalOrchestrator();
        const newDefs      = buildTaskDefinitions({
            scriptDir: '/repo/ai/scripts/mutated',
            nodeBin  : '/node'
        });

        orchestrator.taskDefinitions = newDefs;

        // Witness via content: the mutated scriptDir flows into args of script-path lanes.
        const summary = orchestrator.processSupervisorService.taskDefinitions?.summary;
        expect(summary?.args?.some(arg => typeof arg === 'string' && arg.includes('/ai/scripts/mutated/'))).toBe(true);
    });

    test('mutating orchestrator.dataDir propagates to processSupervisorService + maintenanceBackpressureService + the bridge heal-ledger dir', () => {
        const orchestrator = createMinimalOrchestrator();
        orchestrator.dataDir = '/tmp/orchestrator-test-mutated';

        expect(orchestrator.processSupervisorService.dataDir).toBe('/tmp/orchestrator-test-mutated');
        expect(orchestrator.maintenanceBackpressureService.dataDir).toBe('/tmp/orchestrator-test-mutated');
        // The bridge derives its heal-ledger dir from dataDir at construction; a runtime dataDir change must keep it
        // coherent, else the actuator writes the NEW ledger while the bridge keeps reading the OLD one (stale snapshot).
        expect(orchestrator.deploymentStateBridgeService.healLedgerDir).toBe(path.join('/tmp/orchestrator-test-mutated', 'data-heal-events'));
    });

    test('systemic circuit ledger writes honor retention from the AiConfig provider (#14295)', async () => {
        const script = `
            const fs = await import('node:fs/promises');
            const os = await import('node:os');
            const path = await import('node:path');
            const {default: Neo} = await import('./src/Neo.mjs');
            await import('./src/core/_export.mjs');
            const {default: AiConfig} = await import('./ai/config.mjs');
            const {Orchestrator} = await import('./ai/daemons/orchestrator/Orchestrator.mjs');
            const {buildTaskDefinitions} = await import('./ai/daemons/orchestrator/taskDefinitions.mjs');
            const {default: TaskStateService, createInitialTaskState} = await import('./ai/daemons/orchestrator/services/TaskStateService.mjs');
            const {readHealLedger} = await import('./ai/services/memory-core/helpers/healEventLedgerStore.mjs');

            const root = await fs.mkdtemp(path.join(os.tmpdir(), 'orchestrator-14295-circuit-'));
            try {
                if (AiConfig.orchestrator.recoveryActuator.healLedger.maxEvents !== 2) {
                    throw new Error('expected env-backed healLedger.maxEvents to resolve through AiConfig');
                }
                if (AiConfig.orchestrator.recoveryActuator.healLedger.pruneTriggerBytes !== 1) {
                    throw new Error('expected env-backed healLedger.pruneTriggerBytes to resolve through AiConfig');
                }

                const taskDefinitions = buildTaskDefinitions({scriptDir: '/repo/ai/scripts', nodeBin: process.execPath});
                TaskStateService.configure({stateFile: path.join(root, 'state.json'), taskDefinitions, writeLogFn: () => {}});
                TaskStateService.taskState = createInitialTaskState(taskDefinitions);

                const orchestrator = Neo.create(Orchestrator, {
                    dataDir                  : root,
                    stateFile                : path.join(root, 'state.json'),
                    logFile                  : null,
                    heavyMaintenanceLeasePath: path.join(root, 'heavy-maintenance-lease.json'),
                    taskDefinitions,
                    taskStateService         : TaskStateService,
                    healthService            : {recordTaskOutcome() {}},
                    spawnFn                  : () => { throw new Error('spawnFn not expected'); }
                });

                for (let i = 0; i < 5; i++) {
                    await orchestrator.dataIntegrityDiagnosisService.recordCircuitEvent({
                        type  : i % 2 === 0 ? 'circuit-open' : 'circuit-close',
                        at    : i,
                        detail: {i}
                    });
                }

                const events = await readHealLedger({dir: path.join(root, 'data-heal-events')});
                if (events.length !== 2) {
                    throw new Error('expected retained ledger length 2, got ' + events.length);
                }
                if (JSON.stringify(events.map(event => event.at)) !== JSON.stringify([3, 4])) {
                    throw new Error('expected newest retained event times [3,4], got ' + JSON.stringify(events.map(event => event.at)));
                }
                if (JSON.stringify(events.map(event => event.type)) !== JSON.stringify(['circuit-close', 'circuit-open'])) {
                    throw new Error('expected newest circuit event types, got ' + JSON.stringify(events.map(event => event.type)));
                }
            } finally {
                await fs.rm(root, {recursive: true, force: true});
            }
        `;

        await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
            cwd: REPO_ROOT,
            env: {
                ...process.env,
                NEO_RECOVERY_ACTUATOR_HEAL_LEDGER_MAX_EVENTS         : '2',
                NEO_RECOVERY_ACTUATOR_HEAL_LEDGER_PRUNE_TRIGGER_BYTES: '1',
                UNIT_TEST_MODE                                       : 'true'
            },
            maxBuffer: 1024 * 1024
        });
    });

    test('the store-level fence fan-out resolves served collection names from the Memory Core config SSOT', () => {
        const orchestrator = createMinimalOrchestrator();
        // A store-level fault target (e.g. mc-server) is not itself a served collection, so it expands to the served
        // set — memory + session — sourced from memoryCoreConfig.collections (the store-name SSOT). Reading top-level
        // AiConfig.collections (no such key) would have dereferenced undefined at heal-time.
        expect(orchestrator.getStoreFenceOperations().expandTargets('mc-server'))
            .toEqual([memoryCoreConfig.collections.memory, memoryCoreConfig.collections.session]);
        expect(memoryCoreConfig.collections.memory).toBeTruthy();
        expect(memoryCoreConfig.collections.session).toBeTruthy();
    });

    test('mutating orchestrator.healthService propagates to processSupervisorService + maintenanceBackpressureService', () => {
        const orchestrator = createMinimalOrchestrator();
        const newHealth    = {recordTaskOutcome() {}, marker: 'mutated-healthservice'};
        orchestrator.healthService = newHealth;

        expect(orchestrator.processSupervisorService.healthService?.marker).toBe('mutated-healthservice');
        expect(orchestrator.maintenanceBackpressureService.healthService?.marker).toBe('mutated-healthservice');
    });

    test('mutating orchestrator.taskStateService propagates to processSupervisorService + maintenanceBackpressureService', () => {
        const orchestrator = createMinimalOrchestrator();
        const newTss       = {
            marker: 'mutated-taskstateservice',
            getState() {return {};},
            getTaskState() {return null;}
        };
        orchestrator.taskStateService = newTss;

        expect(orchestrator.processSupervisorService.taskStateService?.marker).toBe('mutated-taskstateservice');
        expect(orchestrator.maintenanceBackpressureService.taskStateService?.marker).toBe('mutated-taskstateservice');
    });

    test('mutating orchestrator.spawnFn propagates to processSupervisorService', () => {
        const orchestrator = createMinimalOrchestrator();
        const newSpawn     = () => 'mutated-spawn';
        newSpawn.marker = 'mutated-spawnfn';
        orchestrator.spawnFn = newSpawn;

        expect(orchestrator.processSupervisorService.spawnFn?.marker).toBe('mutated-spawnfn');
    });

    test('mutating orchestrator.heavyMaintenanceLeasePath propagates to maintenanceBackpressureService', () => {
        const orchestrator = createMinimalOrchestrator();
        const newPath      = '/tmp/orchestrator-test/heavy-maintenance-lease-mutated.json';
        orchestrator.heavyMaintenanceLeasePath = newPath;

        expect(orchestrator.maintenanceBackpressureService.heavyMaintenanceLeasePath).toBe(newPath);
    });
});

test.describe('Orchestrator source-level invariants (#11834 AC4)', () => {
    test('Orchestrator.mjs has no `configure()` shadow-resolver method', async () => {
        const source  = await fs.readFile(ORCHESTRATOR_MJS_PATH, 'utf8');
        const matches = source.match(/^\s*configure\s*\(/gm) || [];

        expect(matches, 'Orchestrator.mjs must NOT define a `configure()` method (Sub-1 anti-pattern; lazy getters supersede it).').toHaveLength(0);
    });

    test('taskDefinitions.mjs has no `DEFAULT_*_INTERVAL_MS` exports', async () => {
        const source  = await fs.readFile(TASK_DEFINITIONS_MJS_PATH, 'utf8');
        const matches = source.match(/export\s+(?:const|let)\s+DEFAULT_\w*INTERVAL_MS/g) || [];

        expect(matches, 'taskDefinitions.mjs must NOT export `DEFAULT_*_INTERVAL_MS` constants (Sub-1 anti-pattern; AiConfig.orchestrator.intervals owns these values).').toHaveLength(0);
    });

    test('Orchestrator.mjs has no `parseInterval` / `parseEnabledFlag` call sites', async () => {
        const source             = await fs.readFile(ORCHESTRATOR_MJS_PATH, 'utf8');
        const codeLines          = stripCommentsAndStrings(source);
        const parseIntervalCalls = codeLines.match(/\bparseInterval\s*\(/g) || [];
        const parseEnabledCalls  = codeLines.match(/\bparseEnabledFlag\s*\(/g) || [];

        expect(parseIntervalCalls, 'Orchestrator.mjs must NOT call `parseInterval(...)` (Sub-1 anti-pattern; `Env.parseNumber(...)` is the canonical primitive).').toHaveLength(0);
        expect(parseEnabledCalls, 'Orchestrator.mjs must NOT call `parseEnabledFlag(...)` (Sub-1 anti-pattern; `Env.parseBool(...)` is the canonical primitive).').toHaveLength(0);
    });

    test('Orchestrator.mjs has no `processSupervisorService.set({...this...})` context-replay block', async () => {
        const source    = await fs.readFile(ORCHESTRATOR_MJS_PATH, 'utf8');
        const codeLines = stripCommentsAndStrings(source);
        const matches   = codeLines.match(/processSupervisorService\.set\s*\(\s*\{\s*\.\.\.this/g) || [];

        expect(matches, 'Orchestrator.mjs must NOT spread `this` into `processSupervisorService.set({...})` (Sub-1 anti-pattern; `afterSetX` parent-prop propagation hooks supersede the start()-time context replay).').toHaveLength(0);
    });

    test('orchestrator config reads are fail-loud direct reads on declared subtrees (#12515 / #13875)', async () => {
        const orchestratorSource              = stripCommentsAndStrings(await fs.readFile(ORCHESTRATOR_MJS_PATH, 'utf8'));
        const configuredTaskDefinitionsSource = stripCommentsAndStrings(
            await fs.readFile(CONFIGURED_TASK_DEFINITIONS_SERVICE_PATH, 'utf8')
        );
        const daemonSource     = stripCommentsAndStrings(await fs.readFile(ORCHESTRATOR_DAEMON_PATH, 'utf8'));
        const configReadSource = `${orchestratorSource}\n${configuredTaskDefinitionsSource}`;

        for (const snippet of [
            'AiConfig.orchestrator.swarmHeartbeat?.',
            'AiConfig.orchestrator.mlx?.',
            'AiConfig.orchestrator.lms?.',
            'AiConfig.orchestrator.ollama?.',
            'AiConfig.orchestrator.chroma?.',
            'AiConfig.engines.chroma?.',
            'AiConfig.openAiCompatible?.'
        ]) {
            expect(configReadSource, `orchestrator config readers must not defend declared AiConfig subtree ${snippet}`).not.toContain(snippet);
        }

        expect(daemonSource, 'daemon.mjs must read AiConfig.orchestrator.devSyncRoots directly').not.toContain('AiConfig.orchestrator?.devSyncRoots');

        expect(orchestratorSource).toContain('AiConfig.orchestrator.swarmHeartbeat.targets');
        expect(orchestratorSource).toContain('AiConfig.orchestrator.chroma.maxRuntimeMs');
        expect(configuredTaskDefinitionsSource).toContain('AiConfig.orchestrator.mlx.enabled');
        expect(configuredTaskDefinitionsSource).toContain('AiConfig.orchestrator.lms.enabled');
        expect(configuredTaskDefinitionsSource).toContain('AiConfig.orchestrator.ollama.enabled');
        expect(configuredTaskDefinitionsSource).toContain('AiConfig.engines.chroma.port');
        expect(configuredTaskDefinitionsSource).toContain('AiConfig.openAiCompatible.host');
        expect(daemonSource).toContain('AiConfig.orchestrator.devSyncRoots');
    });

    test('the store-level served-collection fan-out (freeze + quarantine) reads the Memory Core config SSOT, never top-level AiConfig.collections', async () => {
        const orchestratorSource = stripCommentsAndStrings(await fs.readFile(ORCHESTRATOR_MJS_PATH, 'utf8'));
        // Top-level AiConfig has no `collections` key — the served collection NAMES live in the Memory Core config.
        // BOTH store-fence fan-outs (the quarantine op + getStoreFenceOperations) must read memoryCoreConfig.collections;
        // a top-level AiConfig.collections.memory/session read would dereference undefined at heal-time.
        expect(orchestratorSource).not.toContain('AiConfig.collections');
        expect((orchestratorSource.match(/memoryCoreConfig\.collections\.memory/g)  || []).length).toBeGreaterThanOrEqual(2);
        expect((orchestratorSource.match(/memoryCoreConfig\.collections\.session/g) || []).length).toBeGreaterThanOrEqual(2);
    });

    test('Orchestrator.mjs delegates configured child-process task composition (#13875)', async () => {
        const orchestratorSource = stripCommentsAndStrings(await fs.readFile(ORCHESTRATOR_MJS_PATH, 'utf8'));

        expect(orchestratorSource).toContain('buildConfiguredTaskDefinitionsService');

        for (const snippet of [
            'applyConfiguredMlxTask',
            'applyConfiguredLmsTask',
            'applyConfiguredOllamaTask',
            'buildLmsPreloadConfig',
            'buildOllamaReadinessConfig',
            'ensureLmsModelsLoaded',
            'ensureOllamaModelsReady',
            'OLLAMA_CONTEXT_LENGTH'
        ]) {
            expect(orchestratorSource, `Orchestrator.mjs must not own configured task composition detail: ${snippet}`).not.toContain(snippet);
        }
    });

    test('Orchestrator.mjs has no `_`-suffix reactive config slot without a corresponding `beforeSet*` or `afterSet*` hook', async () => {
        const source    = await fs.readFile(ORCHESTRATOR_MJS_PATH, 'utf8');
        const codeLines = stripCommentsAndStrings(source);

        // Find `_`-suffix slot declarations inside `static config = { ... }` — pattern: `<name>_: <default>`
        const slotMatches = [...codeLines.matchAll(/^\s{4,8}(\w+)_\s*:/gm)];
        const slotNames   = slotMatches.map(m => m[1]).filter(name => name !== 'class' && name !== 'static');

        const missingHook = slotNames.filter(name => {
            const cap      = name.charAt(0).toUpperCase() + name.slice(1);
            const beforeRe = new RegExp(`\\bbeforeSet${cap}\\s*\\(`);
            const afterRe  = new RegExp(`\\bafterSet${cap}\\s*\\(`);
            return !beforeRe.test(codeLines) && !afterRe.test(codeLines);
        });

        expect(missingHook, `Reactive config slots with \`_\`-suffix MUST have a corresponding \`beforeSetX\` or \`afterSetX\` hook (Sub-1 anti-pattern: cargo-cult underscores without hooks). Offending slots: ${missingHook.join(', ')}.`).toEqual([]);
    });
});

test.describe('Sibling daemon source-level invariants (#11836)', () => {
    test('poll-loop singleton state does not use hookless reactive config suffixes', async () => {
        for (const [name, filePath] of Object.entries(SIBLING_DAEMON_CONFIG_PATHS)) {
            const source  = stripCommentsAndStrings(await fs.readFile(filePath, 'utf8'));
            const matches = source.match(/\b(?:isPolling|pollHandle|pollIntervalMs)_\s*:/g) || [];

            expect(matches, `${name} must keep poll-loop state as plain config unless a real before/after hook is added.`).toHaveLength(0);
        }
    });
});

/**
 * Strips block comments, line comments, and string literals so source-grep invariants
 * don't false-positive against doc-mentions of the anti-patterns they're guarding against
 * (the Orchestrator class JSDoc explicitly names what it doesn't do). Output preserves
 * line structure for line-aware regex anchors.
 */
function stripCommentsAndStrings(source) {
    let   out = '';
    let   i   = 0;
    const len = source.length;

    while (i < len) {
        const c    = source[i];
        const next = source[i + 1];

        // Block comment
        if (c === '/' && next === '*') {
            const end = source.indexOf('*/', i + 2);
            if (end === -1) break;
            // Preserve newlines so line numbers stay aligned
            for (let j = i; j < end + 2; j++) {
                out += source[j] === '\n' ? '\n' : ' ';
            }
            i = end + 2;
            continue;
        }

        // Line comment
        if (c === '/' && next === '/') {
            const end  = source.indexOf('\n', i);
            const stop = end === -1 ? len : end;
            for (let j = i; j < stop; j++) out += ' ';
            i = stop;
            continue;
        }

        // String literal (single, double, backtick)
        if (c === '\'' || c === '"' || c === '`') {
            const quote = c;
            out += ' ';
            i++;
            while (i < len) {
                if (source[i] === '\\') {
                    out += '  ';
                    i += 2;
                    continue;
                }
                if (source[i] === quote) {
                    out += ' ';
                    i++;
                    break;
                }
                out += source[i] === '\n' ? '\n' : ' ';
                i++;
            }
            continue;
        }

        out += c;
        i++;
    }
    return out;
}
