import {test, expect} from '@playwright/test';
import fs from 'fs';
import path from 'path';
import '../../../../../../src/Neo.mjs';
import '../../../../../../src/core/_export.mjs';
import {
    LOCAL_AI_CONFIG_FILE,
    loadLocalAiConfig,
    resolveOrchestratorStartOptions
} from '../../../../../../ai/daemons/orchestrator/daemon.mjs';
import {
    DEFAULT_MLX_ENABLED,
    DEFAULT_MLX_MODEL,
    DEFAULT_MLX_PORT,
    buildTaskDefinitions,
    resolveMlxEnabled
} from '../../../../../../ai/daemons/orchestrator/TaskDefinitions.mjs';

test.describe('ai/daemons/orchestrator/daemon.mjs (#11006/#11009)', () => {


    test('builds task commands around existing manual maintenance scripts', () => {
        const scriptDir = path.resolve(process.cwd(), 'ai/scripts');
        const tasks     = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});

        expect(tasks.memoryCoreChroma).toBeUndefined();
        expect(Object.values(tasks).flatMap(task => task.args || [])).not.toContain('8001');

        expect(tasks.summary.command).toBe('/test/node');
        expect(tasks.summary.args).toEqual([path.join(scriptDir, 'lifecycle', 'summarize-sessions.mjs')]);
        expect(tasks.summary.expectedCommand).toBe('summarize-sessions.mjs');

        expect(tasks.kbSync.command).toBe('/test/node');
        expect(tasks.kbSync.args).toEqual([path.join(scriptDir, 'maintenance', 'syncKnowledgeBase.mjs')]);
        expect(tasks.kbSync.expectedCommand).toBe('syncKnowledgeBase.mjs');

        expect(tasks.backup.command).toBe('/test/node');
        expect(tasks.backup.args).toEqual([path.join(scriptDir, 'maintenance', 'backup.mjs')]);
        expect(tasks.backup.expectedCommand).toBe('backup.mjs');
    });

    test('keeps mlx inference opt-in with the dedicated Gemma 4 MLX launch default', () => {
        const scriptDir     = path.resolve(process.cwd(), 'ai/scripts');
        const originalApiModel = process.env.NEO_OPENAI_COMPATIBLE_MODEL;
        const originalMlxModel = process.env.NEO_ORCHESTRATOR_MLX_MODEL;
        const originalMlxEnabled = process.env.NEO_ORCHESTRATOR_MLX_ENABLED;

        delete process.env.NEO_OPENAI_COMPATIBLE_MODEL;
        delete process.env.NEO_ORCHESTRATOR_MLX_MODEL;
        delete process.env.NEO_ORCHESTRATOR_MLX_ENABLED;

        try {
            const tasks = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});

            expect(DEFAULT_MLX_ENABLED).toBe(false);
            expect(DEFAULT_MLX_MODEL).toBe('mlx-community/gemma-4-31b-it-bf16');
            expect(DEFAULT_MLX_PORT).toBe('11435');
            expect(tasks.mlx).toBeUndefined();

            const enabledTasks = buildTaskDefinitions({scriptDir, nodeBin: '/test/node', mlxEnabled: true});

            expect(enabledTasks.mlx.args).toEqual([
                '-m',
                'mlx_lm.server',
                '--model',
                DEFAULT_MLX_MODEL,
                '--port',
                DEFAULT_MLX_PORT
            ]);
            expect(enabledTasks.mlx.args).not.toContain('mlx-community/gemma-2-27b-it-4bit');
            expect(enabledTasks.mlx.args).not.toContain('gemma-4-31b-it');
            expect(resolveMlxEnabled('true')).toBe(true);
            expect(resolveMlxEnabled('false')).toBe(false);
        } finally {
            if (originalApiModel !== undefined) {
                process.env.NEO_OPENAI_COMPATIBLE_MODEL = originalApiModel;
            }
            if (originalMlxModel !== undefined) {
                process.env.NEO_ORCHESTRATOR_MLX_MODEL = originalMlxModel;
            }
            if (originalMlxEnabled !== undefined) {
                process.env.NEO_ORCHESTRATOR_MLX_ENABLED = originalMlxEnabled;
            }
        }
    });

    test('separates OpenAI-compatible API labels from local mlx launch model overrides', () => {
        const scriptDir     = path.resolve(process.cwd(), 'ai/scripts');
        const originalApiModel = process.env.NEO_OPENAI_COMPATIBLE_MODEL;
        const originalMlxModel = process.env.NEO_ORCHESTRATOR_MLX_MODEL;
        const originalMlxEnabled = process.env.NEO_ORCHESTRATOR_MLX_ENABLED;

        process.env.NEO_OPENAI_COMPATIBLE_MODEL = 'api-label-only';
        delete process.env.NEO_ORCHESTRATOR_MLX_MODEL;
        delete process.env.NEO_ORCHESTRATOR_MLX_ENABLED;

        try {
            const apiEnvTasks = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});

            expect(apiEnvTasks.mlx).toBeUndefined();

            process.env.NEO_ORCHESTRATOR_MLX_ENABLED = 'true';

            const enabledDefaultTasks = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});

            expect(enabledDefaultTasks.mlx.args).toEqual([
                '-m',
                'mlx_lm.server',
                '--model',
                DEFAULT_MLX_MODEL,
                '--port',
                DEFAULT_MLX_PORT
            ]);

            process.env.NEO_ORCHESTRATOR_MLX_MODEL = 'local-mlx-launch-model';

            const mlxEnvTasks = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});

            expect(mlxEnvTasks.mlx.args).toEqual([
                '-m',
                'mlx_lm.server',
                '--model',
                'local-mlx-launch-model',
                '--port',
                DEFAULT_MLX_PORT
            ]);
        } finally {
            if (originalApiModel === undefined) {
                delete process.env.NEO_OPENAI_COMPATIBLE_MODEL;
            } else {
                process.env.NEO_OPENAI_COMPATIBLE_MODEL = originalApiModel;
            }
            if (originalMlxModel === undefined) {
                delete process.env.NEO_ORCHESTRATOR_MLX_MODEL;
            } else {
                process.env.NEO_ORCHESTRATOR_MLX_MODEL = originalMlxModel;
            }
            if (originalMlxEnabled === undefined) {
                delete process.env.NEO_ORCHESTRATOR_MLX_ENABLED;
            } else {
                process.env.NEO_ORCHESTRATOR_MLX_ENABLED = originalMlxEnabled;
            }
        }

        const explicitTasks = buildTaskDefinitions({
            scriptDir,
            nodeBin   : '/test/node',
            mlxEnabled: true,
            mlxModel  : 'explicit-model',
            mlxPort   : 12345
        });

        expect(explicitTasks.mlx.args).toEqual([
            '-m',
            'mlx_lm.server',
            '--model',
            'explicit-model',
            '--port',
            '12345'
        ]);
        expect(explicitTasks.summary.command).toBe('/test/node');
    });

    test('keeps bridge-daemon wake-only and routes maintenance ownership to the daemon class', () => {
        const bridgeSource       = fs.readFileSync(path.resolve(process.cwd(), 'ai/daemons/bridge/daemon.mjs'), 'utf8');
        const orchestratorSource = fs.readFileSync(path.resolve(process.cwd(), 'ai/daemons/orchestrator/daemon.mjs'), 'utf8');
        const daemonSource       = fs.readFileSync(path.resolve(process.cwd(), 'ai/daemons/orchestrator/Orchestrator.mjs'), 'utf8');
        const taskDefSource        = fs.readFileSync(path.resolve(process.cwd(), 'ai/daemons/orchestrator/TaskDefinitions.mjs'), 'utf8');

        expect(bridgeSource).not.toContain('summarize-sessions.mjs');
        expect(bridgeSource).not.toContain('Piece C periodic summarization sweep');
        expect(bridgeSource).not.toContain('checkSummarizationLifecycle');

        expect(orchestratorSource).toContain('./Orchestrator.mjs');
        expect(orchestratorSource).toContain('orchestrator-daemon.pid');
        expect(orchestratorSource).toContain('setupCleanupHandlers');
        expect(orchestratorSource).toContain('enforceSingleton');
        expect(orchestratorSource).not.toContain('buildTaskDefinitions');
        expect(orchestratorSource).not.toContain('runMaintenanceCycle');
        expect(orchestratorSource).not.toContain('summarize-sessions.mjs');
        expect(orchestratorSource).not.toContain('syncKnowledgeBase.mjs');
        expect(orchestratorSource).not.toContain('backup.mjs');

        expect(daemonSource).not.toContain('summarize-sessions.mjs');
        expect(daemonSource).not.toContain('syncKnowledgeBase.mjs');
        expect(daemonSource).not.toContain('backup.mjs');

        expect(taskDefSource).toContain('summarize-sessions.mjs');
        expect(taskDefSource).toContain('syncKnowledgeBase.mjs');
        expect(taskDefSource).toContain('backup.mjs');
    });

    test('loads gitignored top-level AI config only when present', async () => {
        const loadedPaths = [];
        const aiConfig = {
            async load(configPath) {
                loadedPaths.push(configPath);
            }
        };

        await expect(loadLocalAiConfig({
            configPath: '/tmp/missing-ai-config.mjs',
            aiConfig,
            existsSync: () => false
        })).resolves.toEqual({
            loaded: false,
            configPath: '/tmp/missing-ai-config.mjs'
        });

        await expect(loadLocalAiConfig({
            configPath: '/tmp/local-ai-config.mjs',
            aiConfig,
            existsSync: () => true
        })).resolves.toEqual({
            loaded: true,
            configPath: '/tmp/local-ai-config.mjs'
        });

        expect(loadedPaths).toEqual(['/tmp/local-ai-config.mjs']);
        expect(LOCAL_AI_CONFIG_FILE).toBe(path.resolve(process.cwd(), 'ai/config.mjs'));
    });

    test('resolves orchestrator intervals from top-level config when env overrides are absent', () => {
        expect(resolveOrchestratorStartOptions({
            orchestratorConfig: {
                deploymentMode: 'local',
                intervals: {
                    pollMs          : 11,
                    summarySweepMs  : 22,
                    kbSyncMs        : 33,
                    backupMs        : 44,
                    primaryDevSyncMs: 55,
                    dreamMs         : 66,
                    goldenPathMs    : 77
                },
                localOnly: {
                    primaryDevSyncEnabled: true,
                    kbSyncEnabled        : true,
                    bridgeDaemonEnabled  : true,
                    goldenPathRepoEnrichmentEnabled: true
                }
            },
            env: {}
        })).toEqual({
            pollIntervalMs          : 11,
            summarySweepIntervalMs  : 22,
            kbSyncIntervalMs        : 33,
            backupIntervalMs        : 44,
            primaryDevSyncIntervalMs: 55,
            dreamIntervalMs         : 66,
            goldenPathIntervalMs    : 77,
            primaryDevSyncEnabled   : true,
            kbSyncEnabled           : true,
            bridgeDaemonEnabled     : true,
            goldenPathRepoEnrichmentEnabled: true
        });
    });

    test('falls back to maintenance backup cadence when orchestrator cadence omits backupMs', () => {
        expect(resolveOrchestratorStartOptions({
            orchestratorConfig: {
                intervals: {
                    pollMs: 11
                }
            },
            maintenanceConfig: {
                backup: {
                    intervalMs: 88
                }
            },
            env: {}
        })).toMatchObject({
            pollIntervalMs  : 11,
            backupIntervalMs: 88
        });
    });

    test('preserves env precedence over config-derived orchestrator options', () => {
        const options = resolveOrchestratorStartOptions({
            orchestratorConfig: {
                deploymentMode: 'cloud',
                intervals: {
                    pollMs          : 11,
                    summarySweepMs  : 22,
                    kbSyncMs        : 33,
                    backupMs        : 44,
                    primaryDevSyncMs: 55
                }
            },
            env: {
                NEO_ORCHESTRATOR_POLL_INTERVAL_MS            : '100',
                NEO_SUMMARIZATION_SWEEP_INTERVAL_MS          : '200',
                NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS         : '300',
                NEO_ORCHESTRATOR_BACKUP_INTERVAL_MS          : '400',
                NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_INTERVAL_MS: '500',
                NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED    : 'false',
                NEO_ORCHESTRATOR_KB_SYNC_ENABLED             : 'false',
                NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED       : 'false',
                NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED: 'false'
            }
        });

        expect(options).not.toHaveProperty('pollIntervalMs');
        expect(options).not.toHaveProperty('summarySweepIntervalMs');
        expect(options).not.toHaveProperty('kbSyncIntervalMs');
        expect(options).not.toHaveProperty('backupIntervalMs');
        expect(options).not.toHaveProperty('primaryDevSyncIntervalMs');
        expect(options).not.toHaveProperty('primaryDevSyncEnabled');
        expect(options).not.toHaveProperty('kbSyncEnabled');
        expect(options).not.toHaveProperty('bridgeDaemonEnabled');
        expect(options).not.toHaveProperty('goldenPathRepoEnrichmentEnabled');
    });

    test('disables local-only scheduler lanes for cloud deployments unless explicitly enabled', () => {
        expect(resolveOrchestratorStartOptions({
            orchestratorConfig: {
                deploymentMode: 'cloud',
                localOnly     : {}
            },
            env: {}
        })).toMatchObject({
            primaryDevSyncEnabled: false,
            kbSyncEnabled        : false,
            bridgeDaemonEnabled  : false,
            goldenPathRepoEnrichmentEnabled: false
        });

        expect(resolveOrchestratorStartOptions({
            orchestratorConfig: {
                deploymentMode: 'cloud',
                localOnly: {
                    primaryDevSyncEnabled: true,
                    kbSyncEnabled        : true,
                    bridgeDaemonEnabled  : true,
                    goldenPathRepoEnrichmentEnabled: true
                }
            },
            env: {}
        })).toMatchObject({
            primaryDevSyncEnabled: true,
            kbSyncEnabled        : true,
            bridgeDaemonEnabled  : true,
            goldenPathRepoEnrichmentEnabled: true
        });
    });

    test('resolves the swarm-heartbeat lane per deployment profile (#11766)', () => {
        // Cloud profile, no explicit override -> lane disabled.
        expect(resolveOrchestratorStartOptions({
            orchestratorConfig: {deploymentMode: 'cloud', localOnly: {}},
            env: {}
        })).toMatchObject({swarmHeartbeatEnabled: false});

        // Local profile, no explicit override -> option left unset so the
        // Orchestrator.configure() parseEnabledFlag(..., true) default (lane ON) applies.
        expect(resolveOrchestratorStartOptions({
            orchestratorConfig: {deploymentMode: 'local', localOnly: {}},
            env: {}
        })).not.toHaveProperty('swarmHeartbeatEnabled');

        // Explicit opt-in overrides the cloud default.
        expect(resolveOrchestratorStartOptions({
            orchestratorConfig: {deploymentMode: 'cloud', localOnly: {swarmHeartbeatEnabled: true}},
            env: {}
        })).toMatchObject({swarmHeartbeatEnabled: true});

        // Heartbeat interval resolves from config when the env override is absent.
        expect(resolveOrchestratorStartOptions({
            orchestratorConfig: {deploymentMode: 'local', intervals: {swarmHeartbeatMs: 90000}},
            env: {}
        })).toMatchObject({swarmHeartbeatIntervalMs: 90000});
    });
});
