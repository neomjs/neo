import {test, expect} from '@playwright/test';
import fs from 'fs';
import path from 'path';
import '../../../../../../src/Neo.mjs';
import '../../../../../../src/core/_export.mjs';
import {
    LOCAL_AI_CONFIG_FILE,
    loadLocalAiConfig
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
        // defaults and no env-var reads. Caller (Orchestrator via its mlx* getters
        // reading AiConfig + env-vars) forwards concrete values. This test documents
        // the pure-function contract by setting env-vars that would have been picked
        // up by the old behavior and verifying they are ignored.
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

    test('AiConfig.orchestrator.mlx ships canonical MLX launch defaults', async () => {
        const templateSource = fs.readFileSync(path.resolve(process.cwd(), 'ai/config.template.mjs'), 'utf8');

        // AiConfig template is the single source of truth for MLX defaults
        // post-#11075 migration. TaskDefinitions.mjs no longer carries them.
        expect(templateSource).toMatch(
            /mlx:\s*\{[\s\S]*enabled:\s*false[\s\S]*model\s*:\s*'mlx-community\/gemma-4-31b-it-bf16'[\s\S]*port\s*:\s*'11435'[\s\S]*\}/
        );
    });

    // -----------------------------------------------------------------------------
    // #11986 — LM Studio CLI (`lms`) orchestrator-managed lifecycle (mirror of MLX)
    // -----------------------------------------------------------------------------

    test('buildTaskDefinitions is pure: tasks.lms is omitted when lmsEnabled is false', () => {
        const scriptDir = path.resolve(process.cwd(), 'ai/scripts');
        const tasks     = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});

        expect(tasks.lms).toBeUndefined();
    });

    test('buildTaskDefinitions is pure: no env-var lookups; concrete lmsModel/lmsPort flow through', () => {
        // Architectural contract: TaskDefinitions.mjs has no embedded LM Studio
        // defaults and no env-var reads. Caller (Orchestrator via its lms* getters
        // reading AiConfig + env-vars) forwards concrete values. This test documents
        // the pure-function contract by setting env-vars that would have been picked
        // up if the implementation leaked and verifying they are ignored.
        const scriptDir = path.resolve(process.cwd(), 'ai/scripts');
        const originalLmsModel   = process.env.NEO_ORCHESTRATOR_LMS_MODEL;
        const originalLmsEnabled = process.env.NEO_ORCHESTRATOR_LMS_ENABLED;
        const originalLmsPort    = process.env.NEO_ORCHESTRATOR_LMS_PORT;

        process.env.NEO_ORCHESTRATOR_LMS_ENABLED = 'true';
        process.env.NEO_ORCHESTRATOR_LMS_MODEL   = 'env-leaked-model';
        process.env.NEO_ORCHESTRATOR_LMS_PORT    = '99999';

        try {
            // Default: lmsEnabled=false; env-vars are ignored.
            const tasks = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});
            expect(tasks.lms).toBeUndefined();

            // Explicit values are passed through verbatim; env-vars are still ignored.
            const explicitTasks = buildTaskDefinitions({
                scriptDir,
                nodeBin   : '/test/node',
                lmsEnabled: true,
                lmsModel  : 'explicit-model',
                lmsPort   : 4242
            });

            expect(explicitTasks.lms.command).toBe('lms');
            expect(explicitTasks.lms.args).toEqual(['server', 'start', '--port', '4242']);
            expect(explicitTasks.lms.expectedCommand).toBe('lms server');
            expect(explicitTasks.lms.pidFileName).toBe('lms.pid');
            expect(explicitTasks.lms.args).not.toContain('99999');
        } finally {
            for (const [key, value] of [
                ['NEO_ORCHESTRATOR_LMS_MODEL',   originalLmsModel],
                ['NEO_ORCHESTRATOR_LMS_ENABLED', originalLmsEnabled],
                ['NEO_ORCHESTRATOR_LMS_PORT',    originalLmsPort]
            ]) {
                if (value === undefined) {
                    delete process.env[key];
                } else {
                    process.env[key] = value;
                }
            }
        }
    });

    test('AiConfig.orchestrator.lms ships canonical LM Studio launch defaults', async () => {
        const templateSource = fs.readFileSync(path.resolve(process.cwd(), 'ai/config.template.mjs'), 'utf8');

        // AiConfig template is the single source of truth for LM Studio defaults.
        // TaskDefinitions.mjs is a pure function that consumes these via caller-resolved values.
        expect(templateSource).toMatch(
            /lms:\s*\{[\s\S]*enabled:\s*false[\s\S]*model\s*:\s*'qwen3-embedding-8b'[\s\S]*port\s*:\s*'1234'[\s\S]*\}/
        );
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

});
