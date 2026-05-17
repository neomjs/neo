import {test, expect} from '@playwright/test';
import fs from 'fs';
import path from 'path';
import '../../../../../src/Neo.mjs';
import '../../../../../src/core/_export.mjs';
import {
    DEFAULT_KB_SYNC_INTERVAL_MS,
    LOCAL_AI_CONFIG_FILE,
    loadLocalAiConfig,
    DEFAULT_POLL_INTERVAL_MS,
    DEFAULT_SUMMARY_SWEEP_INTERVAL_MS
} from '../../../../../ai/scripts/orchestrator-daemon.mjs';
import {
    DEFAULT_MLX_ENABLED,
    DEFAULT_MLX_MODEL,
    DEFAULT_MLX_PORT,
    buildTaskDefinitions,
    resolveMlxEnabled
} from '../../../../../ai/daemons/TaskDefinitions.mjs';

test.describe('ai/scripts/orchestrator-daemon.mjs (#11006/#11009)', () => {


    test('builds task commands around existing manual maintenance scripts', () => {
        const scriptDir = path.resolve(process.cwd(), 'ai/scripts');
        const tasks     = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});

        expect(tasks.memoryCoreChroma).toBeUndefined();
        expect(Object.values(tasks).flatMap(task => task.args || [])).not.toContain('8001');

        expect(tasks.summary.command).toBe('/test/node');
        expect(tasks.summary.args).toEqual([path.join(scriptDir, 'summarize-sessions.mjs')]);
        expect(tasks.summary.expectedCommand).toBe('summarize-sessions.mjs');

        expect(tasks.kbSync.command).toBe('/test/node');
        expect(tasks.kbSync.args).toEqual([path.resolve(scriptDir, '../../buildScripts/ai/syncKnowledgeBase.mjs')]);
        expect(tasks.kbSync.expectedCommand).toBe('syncKnowledgeBase.mjs');

        expect(tasks.backup.command).toBe('/test/node');
        expect(tasks.backup.args).toEqual([path.resolve(scriptDir, '../../buildScripts/ai/backup.mjs')]);
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
        const bridgeSource       = fs.readFileSync(path.resolve(process.cwd(), 'ai/scripts/bridge-daemon.mjs'), 'utf8');
        const orchestratorSource = fs.readFileSync(path.resolve(process.cwd(), 'ai/scripts/orchestrator-daemon.mjs'), 'utf8');
        const daemonSource       = fs.readFileSync(path.resolve(process.cwd(), 'ai/daemons/Orchestrator.mjs'), 'utf8');
        const taskDefSource        = fs.readFileSync(path.resolve(process.cwd(), 'ai/daemons/TaskDefinitions.mjs'), 'utf8');

        expect(bridgeSource).not.toContain('summarize-sessions.mjs');
        expect(bridgeSource).not.toContain('Piece C periodic summarization sweep');
        expect(bridgeSource).not.toContain('checkSummarizationLifecycle');

        expect(orchestratorSource).toContain('../daemons/Orchestrator.mjs');
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
});
