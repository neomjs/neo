import {test, expect} from '@playwright/test';
import fs from 'fs';
import path from 'path';
import '../../../../../../src/Neo.mjs';
import '../../../../../../src/core/_export.mjs';
import {
    LOCAL_AI_CONFIG_FILE,
    loadLocalAiConfig,
    resolveMlxConfig,
    resolveOrchestratorStartOptions
} from '../../../../../../ai/daemons/orchestrator/daemon.mjs';
import {
    buildTaskDefinitions
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

    test('buildTaskDefinitions is pure: tasks.mlx is omitted when mlxEnabled is false', () => {
        const scriptDir = path.resolve(process.cwd(), 'ai/scripts');
        const tasks     = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});

        expect(tasks.mlx).toBeUndefined();
    });

    test('buildTaskDefinitions is pure: no env-var lookups; concrete mlxModel/mlxPort flow through', () => {
        // Architectural contract post-#11075: TaskDefinitions.mjs has no embedded MLX
        // defaults and no env-var reads. Caller (daemon.mjs via resolveMlxConfig)
        // resolves AiConfig + env-vars and forwards concrete values. This test
        // documents the pure-function contract by setting env-vars that would have
        // been picked up by the old behavior and verifying they are ignored.
        const scriptDir = path.resolve(process.cwd(), 'ai/scripts');
        const originalMlxModel   = process.env.NEO_ORCHESTRATOR_MLX_MODEL;
        const originalMlxEnabled = process.env.NEO_ORCHESTRATOR_MLX_ENABLED;
        const originalMlxPort    = process.env.NEO_ORCHESTRATOR_MLX_PORT;

        process.env.NEO_ORCHESTRATOR_MLX_ENABLED = 'true';
        process.env.NEO_ORCHESTRATOR_MLX_MODEL   = 'env-leaked-model';
        process.env.NEO_ORCHESTRATOR_MLX_PORT    = '99999';

        try {
            // Default: mlxEnabled=false; env-vars are ignored.
            const tasks = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});
            expect(tasks.mlx).toBeUndefined();

            // Explicit values are passed through verbatim; env-vars are still ignored.
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
            expect(explicitTasks.mlx.args).not.toContain('env-leaked-model');
            expect(explicitTasks.mlx.args).not.toContain('99999');
        } finally {
            for (const [key, value] of [
                ['NEO_ORCHESTRATOR_MLX_MODEL',   originalMlxModel],
                ['NEO_ORCHESTRATOR_MLX_ENABLED', originalMlxEnabled],
                ['NEO_ORCHESTRATOR_MLX_PORT',    originalMlxPort]
            ]) {
                if (value === undefined) {
                    delete process.env[key];
                } else {
                    process.env[key] = value;
                }
            }
        }
    });

    test('resolveMlxConfig overlays env-var precedence onto AiConfig.orchestrator.mlx', () => {
        const aiConfigDefaults = {
            mlx: {
                enabled: false,
                model  : 'mlx-community/gemma-4-31b-it-bf16',
                port   : '11435'
            }
        };

        // No env overrides: AiConfig defaults flow through.
        expect(resolveMlxConfig({orchestratorConfig: aiConfigDefaults, env: {}})).toEqual({
            enabled: false,
            model  : 'mlx-community/gemma-4-31b-it-bf16',
            port   : '11435'
        });

        // Env overrides win.
        expect(resolveMlxConfig({
            orchestratorConfig: aiConfigDefaults,
            env               : {
                NEO_ORCHESTRATOR_MLX_ENABLED: 'true',
                NEO_ORCHESTRATOR_MLX_MODEL  : 'env-model',
                NEO_ORCHESTRATOR_MLX_PORT   : '11999'
            }
        })).toEqual({
            enabled: true,
            model  : 'env-model',
            port   : '11999'
        });

        // Explicit env=false overrides an enabled AiConfig default.
        expect(resolveMlxConfig({
            orchestratorConfig: {mlx: {...aiConfigDefaults.mlx, enabled: true}},
            env               : {NEO_ORCHESTRATOR_MLX_ENABLED: 'false'}
        })).toEqual({
            enabled: false,
            model  : 'mlx-community/gemma-4-31b-it-bf16',
            port   : '11435'
        });

        // Missing orchestratorConfig.mlx: undefined-safe, no crash; values undefined.
        expect(resolveMlxConfig({orchestratorConfig: {}, env: {}})).toEqual({
            enabled: false,
            model  : undefined,
            port   : undefined
        });
    });

    test('resolveMlxConfig accepts canonical boolean tokens via Env.parseBool (TRUE/yes/on/1 + FALSE/no/off/0)', () => {
        // Per Neo.util.Env.parseBool token semantics — case-insensitive, trimmed.
        // Token sets: TRUE_TOKENS=['true','yes','on','1'], FALSE_TOKENS=['false','no','off','0'].
        const aiDefaultDisabled = {mlx: {enabled: false, model: 'm', port: 'p'}};
        const aiDefaultEnabled  = {mlx: {enabled: true,  model: 'm', port: 'p'}};

        // Truthy tokens (against an AiConfig default of `enabled: false` — env wins on each).
        for (const truthy of ['true', 'TRUE', 'True', 'yes', 'YES', 'on', 'ON', '1']) {
            expect(resolveMlxConfig({
                orchestratorConfig: aiDefaultDisabled,
                env               : {NEO_ORCHESTRATOR_MLX_ENABLED: truthy}
            }).enabled).toBe(true);
        }

        // Falsy tokens (against an AiConfig default of `enabled: true` — env wins on each).
        for (const falsy of ['false', 'FALSE', 'False', 'no', 'NO', 'off', 'OFF', '0']) {
            expect(resolveMlxConfig({
                orchestratorConfig: aiDefaultEnabled,
                env               : {NEO_ORCHESTRATOR_MLX_ENABLED: falsy}
            }).enabled).toBe(false);
        }

        // Whitespace-tolerant per Env.parseBool's trim semantics.
        expect(resolveMlxConfig({
            orchestratorConfig: aiDefaultDisabled,
            env               : {NEO_ORCHESTRATOR_MLX_ENABLED: '  yes  '}
        }).enabled).toBe(true);

        // Invalid token: Env.parseBool returns undefined → falls back to AiConfig default.
        // (Env warns to console; suppression is the caller's concern, not asserted here.)
        const originalWarn = console.warn;
        console.warn       = () => {};
        try {
            expect(resolveMlxConfig({
                orchestratorConfig: aiDefaultEnabled,
                env               : {NEO_ORCHESTRATOR_MLX_ENABLED: 'maybe'}
            }).enabled).toBe(true);
            expect(resolveMlxConfig({
                orchestratorConfig: aiDefaultDisabled,
                env               : {NEO_ORCHESTRATOR_MLX_ENABLED: 'maybe'}
            }).enabled).toBe(false);
        } finally {
            console.warn = originalWarn;
        }
    });

    test('AiConfig.orchestrator.mlx ships canonical MLX launch defaults', async () => {
        const aiConfigModule = await import('../../../../../../ai/config.template.mjs');
        const aiConfig       = aiConfigModule.default;

        // AiConfig template is the single source of truth for MLX defaults
        // post-#11075 migration. TaskDefinitions.mjs no longer carries them.
        expect(aiConfig.data.orchestrator.mlx).toEqual({
            enabled: false,
            model  : 'mlx-community/gemma-4-31b-it-bf16',
            port   : '11435'
        });
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

        // Match the canonical maintenance-script path-component pattern from TaskDefinitions
        // (`path.join(scriptDir, 'lifecycle' | 'maintenance', '<name>.mjs')`). Bare filename
        // checks would false-positive against legitimate `./scheduling/<task>.mjs` imports
        // that share leaf names (e.g. `./scheduling/backup.mjs`).
        expect(daemonSource).not.toContain("'summarize-sessions.mjs'");
        expect(daemonSource).not.toContain("'syncKnowledgeBase.mjs'");
        expect(daemonSource).not.toContain("'backup.mjs'");

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
