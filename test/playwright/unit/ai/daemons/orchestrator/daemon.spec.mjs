import {test, expect} from '@playwright/test';
import fs             from 'fs';
import path           from 'path';
import '../../../../../../src/Neo.mjs';
import '../../../../../../src/core/_export.mjs';
import {
    LOCAL_AI_CONFIG_FILE,
    isOrchestratorDaemonCommand,
    loadLocalAiConfig
} from '../../../../../../ai/daemons/orchestrator/daemon.mjs';
import {
    buildOllamaServeEnv,
    getMaxOllamaContextLength,
    resolveOllamaHostPort,
    buildTaskDefinitions
} from '../../../../../../ai/daemons/orchestrator/taskDefinitions.mjs';

test.describe('ai/daemons/orchestrator/daemon.mjs (#11006/#11009)', () => {


    test('builds task commands around existing manual maintenance scripts', () => {
        const scriptDir = path.resolve(process.cwd(), 'ai/scripts');
        const tasks     = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});

        expect(tasks.memoryCoreChroma).toBeUndefined();
        expect(Object.values(tasks).flatMap(task => task.args || [])).not.toContain('8001');

        expect(tasks.summary.command).toBe('/test/node');
        expect(tasks.summary.args).toEqual([path.join(scriptDir, 'lifecycle', 'summarize-sessions.mjs')]);
        expect(tasks.summary.expectedCommand).toBe('summarize-sessions.mjs');

        expect(tasks['memory-summary-backfill'].command).toBe('/test/node');
        expect(tasks['memory-summary-backfill'].args).toEqual([path.join(scriptDir, 'lifecycle', 'backfill-memory-summaries.mjs')]);
        expect(tasks['memory-summary-backfill'].expectedCommand).toBe('backfill-memory-summaries.mjs');

        expect(tasks.kbSync.command).toBe('/test/node');
        expect(tasks.kbSync.args).toEqual([path.join(scriptDir, 'maintenance', 'syncKnowledgeBase.mjs')]);
        expect(tasks.kbSync.expectedCommand).toBe('syncKnowledgeBase.mjs');

        expect(tasks.githubWorkflowSync.command).toBe('/test/node');
        expect(tasks.githubWorkflowSync.args).toEqual([path.join(scriptDir, 'maintenance', 'syncGithubWorkflow.mjs')]);
        expect(tasks.githubWorkflowSync.expectedCommand).toBe('syncGithubWorkflow.mjs');

        expect(tasks.backup.command).toBe('/test/node');
        expect(tasks.backup.args).toEqual([path.join(scriptDir, 'maintenance', 'backup.mjs')]);
        expect(tasks.backup.label).toBe('agent OS backup');
        expect(tasks.backup.expectedCommand).toBe('backup.mjs');

        expect(tasks['graphlog-compaction'].command).toBe('/test/node');
        expect(tasks['graphlog-compaction'].args).toEqual([
            path.join(scriptDir, 'maintenance', 'compactGraphLog.mjs'),
            '--apply'
        ]);
        expect(tasks['graphlog-compaction'].expectedCommand).toBe('compactGraphLog.mjs');
    });

    test('memory-summary backfill CLI is guarded by the shared heavy-maintenance lease', () => {
        const source = fs.readFileSync(
            path.resolve(process.cwd(), 'ai/scripts/lifecycle/backfill-memory-summaries.mjs'),
            'utf8'
        );

        expect(source).toContain('withHeavyMaintenanceLease');
        expect(source).toContain("owner       : 'memory-summary-backfill'");
        expect(source).toContain("reason      : 'manual-cli'");
        expect(source).toContain('staleAfterMs: AiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs');
    });

    test('buildTaskDefinitions is pure: tasks.mlx is omitted when mlxEnabled is false', () => {
        const scriptDir = path.resolve(process.cwd(), 'ai/scripts');
        const tasks     = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});

        expect(tasks.mlx).toBeUndefined();
    });

    test('buildTaskDefinitions is pure: MLX composition stays outside the task table', () => {
        // Architectural contract: taskDefinitions.mjs has no embedded MLX defaults
        // and no env-var reads. The daemon entrypoint composes MLX after reading
        // AiConfig, so stale caller params and env-vars are ignored here.
        const scriptDir          = path.resolve(process.cwd(), 'ai/scripts');
        const originalMlxModel   = process.env.NEO_ORCHESTRATOR_MLX_MODEL;
        const originalMlxEnabled = process.env.NEO_ORCHESTRATOR_MLX_ENABLED;
        const originalMlxPort    = process.env.NEO_ORCHESTRATOR_MLX_PORT;

        process.env.NEO_ORCHESTRATOR_MLX_ENABLED = 'true';
        process.env.NEO_ORCHESTRATOR_MLX_MODEL   = 'env-leaked-model';
        process.env.NEO_ORCHESTRATOR_MLX_PORT    = '99999';

        try {
            const tasks = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});
            expect(tasks.mlx).toBeUndefined();

            const staleCallerParams = buildTaskDefinitions({
                scriptDir,
                nodeBin   : '/test/node',
                mlxEnabled: true,
                mlxModel  : 'explicit-model',
                mlxPort   : 12345
            });
            expect(staleCallerParams.mlx).toBeUndefined();
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

    test('AiConfig.orchestrator.mlx ships canonical MLX launch defaults', () => {
        // The Tier-1 template (NOT the gitignored config.mjs overlay) is the stable
        // source of truth for MLX defaults. Read it as text and assert the `data`
        // leaf defaults: importing the template here would register Neo.ai.Config a
        // second time alongside the config.mjs singleton daemon.mjs loads, tripping
        // the unitTestMode namespace-collision gatekeeper.
        const templateSource = fs.readFileSync(path.resolve(process.cwd(), 'ai/config.template.mjs'), 'utf8');

        expect(templateSource).toMatch(
            /mlx:\s*\{[\s\S]*?leaf\(false[\s\S]*?'mlx-community\/gemma-4-31b-it-bf16'[\s\S]*?'11435'/
        );
    });

    // -----------------------------------------------------------------------------
    // LM Studio CLI (`lms`) orchestrator-managed lifecycle (mirror of MLX)
    // -----------------------------------------------------------------------------

    test('buildTaskDefinitions is pure: tasks.lms is omitted when lmsEnabled is false', () => {
        const scriptDir = path.resolve(process.cwd(), 'ai/scripts');
        const tasks     = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});

        expect(tasks.lms).toBeUndefined();
    });

    test('buildTaskDefinitions is pure: LM Studio composition stays outside the task table', () => {
        // Architectural contract: taskDefinitions.mjs has no embedded LM Studio
        // defaults and no env-var reads. The daemon entrypoint composes LMS after
        // reading AiConfig, so stale caller params and env-vars are ignored here.
        const scriptDir          = path.resolve(process.cwd(), 'ai/scripts');
        const originalLmsModel   = process.env.NEO_ORCHESTRATOR_LMS_MODEL;
        const originalLmsEnabled = process.env.NEO_ORCHESTRATOR_LMS_ENABLED;
        const originalLmsPort    = process.env.NEO_ORCHESTRATOR_LMS_PORT;

        process.env.NEO_ORCHESTRATOR_LMS_ENABLED = 'true';
        process.env.NEO_ORCHESTRATOR_LMS_MODEL   = 'env-leaked-model';
        process.env.NEO_ORCHESTRATOR_LMS_PORT    = '99999';

        try {
            const tasks = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});
            expect(tasks.lms).toBeUndefined();

            const staleCallerParams = buildTaskDefinitions({
                scriptDir,
                nodeBin          : '/test/node',
                lmsEnabled       : true,
                lmsModel         : 'explicit-model',
                lmsModels        : ['chat-model', 'embedding-model'],
                lmsHost          : 'http://127.0.0.1:4242',
                providerReadiness: {attempts: 2, delayMs: 0, timeoutMs: 50, routineCacheTtlMs: 1000},
                lmsPort          : 4242
            });
            expect(staleCallerParams.lms).toBeUndefined();
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

    test('buildTaskDefinitions ignores legacy LMS params, including an explicit empty lmsModels list (#12264)', () => {
        const tasks = buildTaskDefinitions({
            scriptDir : path.resolve(process.cwd(), 'ai/scripts'),
            nodeBin   : '/test/node',
            lmsEnabled: true,
            lmsModel  : 'legacy-fallback-model',
            lmsModels : [],
            lmsHost   : 'http://127.0.0.1:4242',
            lmsPort   : 4242
        });

        expect(tasks.lms).toBeUndefined();
    });

    test('AiConfig.orchestrator.lms ships default-enabled LM Studio launch defaults', () => {
        // Tier-1 template is the stable source of truth; read as text (see the MLX test
        // for why importing the template collides with daemon.mjs's config.mjs singleton).
        const templateSource = fs.readFileSync(path.resolve(process.cwd(), 'ai/config.template.mjs'), 'utf8');

        // `lms.enabled` defaults to `true`: local Agent OS needs both chat and embedding
        // roles resident by default; the model id (`qwen3-embedding-8b`) and port (`1234`)
        // are the rest of the launch shape.
        expect(templateSource).toMatch(
            /lms:\s*\{[\s\S]*?leaf\(true[\s\S]*?'qwen3-embedding-8b'[\s\S]*?'1234'/
        );
    });

    // -----------------------------------------------------------------------------
    // Native Ollama (`ollama serve`) orchestrator-managed lifecycle (local-dev only)
    // -----------------------------------------------------------------------------

    test('buildTaskDefinitions is pure: Ollama composition stays outside the task table', () => {
        const scriptDir = path.resolve(process.cwd(), 'ai/scripts');

        expect(buildTaskDefinitions({scriptDir, nodeBin: '/test/node'}).ollama).toBeUndefined();
        expect(buildTaskDefinitions({
            scriptDir,
            nodeBin      : '/test/node',
            ollamaEnabled: true,
            ollamaHost   : 'http://127.0.0.1:11434',
            ollamaRoles  : [{model: 'gemma4:31b'}]
        }).ollama).toBeUndefined();
    });

    test('native Ollama serve env helpers are pure and ignore process env', () => {
        const originalEnv = {
            OLLAMA_HOST                    : process.env.OLLAMA_HOST,
            OLLAMA_CONTEXT_LENGTH          : process.env.OLLAMA_CONTEXT_LENGTH,
            OLLAMA_MAX_LOADED_MODELS       : process.env.OLLAMA_MAX_LOADED_MODELS,
            NEO_ORCHESTRATOR_OLLAMA_ENABLED: process.env.NEO_ORCHESTRATOR_OLLAMA_ENABLED
        };

        process.env.OLLAMA_HOST = 'env-leaked-host:9999';
        process.env.OLLAMA_CONTEXT_LENGTH = '777';
        process.env.OLLAMA_MAX_LOADED_MODELS = '9';
        process.env.NEO_ORCHESTRATOR_OLLAMA_ENABLED = 'false';

        try {
            const roles = [{
                role         : 'chat',
                providerRole : 'graphProvider',
                model        : 'gemma4:31b',
                contextLength: 131072
            }, {
                role         : 'embedding',
                providerRole : 'embeddingProvider',
                model        : 'qwen3-embedding',
                contextLength: 32768
            }];

            expect(resolveOllamaHostPort('http://127.0.0.1:11445')).toBe(11445);
            expect(getMaxOllamaContextLength(roles)).toBe(131072);
            expect(buildOllamaServeEnv({
                host                 : 'http://127.0.0.1:11445',
                keepAlive            : -1,
                contextLength        : getMaxOllamaContextLength(roles),
                requireParallelModels: 2
            })).toEqual({
                OLLAMA_HOST             : '127.0.0.1:11445',
                OLLAMA_KEEP_ALIVE       : '-1',
                OLLAMA_CONTEXT_LENGTH   : '131072',
                OLLAMA_MAX_LOADED_MODELS: '2'
            });
        } finally {
            for (const [key, value] of Object.entries(originalEnv)) {
                if (value === undefined) {
                    delete process.env[key];
                } else {
                    process.env[key] = value;
                }
            }
        }
    });

    test('AiConfig.orchestrator.ollama ships default-enabled local-dev launch gate', () => {
        const templateSource = fs.readFileSync(path.resolve(process.cwd(), 'ai/config.template.mjs'), 'utf8');

        expect(templateSource).toMatch(
            /ollama:\s*\{[\s\S]*?leaf\(true,\s*'NEO_ORCHESTRATOR_OLLAMA_ENABLED'/
        );
    });

    test('keeps wake-daemon wake-only and routes maintenance ownership to the daemon class', () => {
        const bridgeSource       = fs.readFileSync(path.resolve(process.cwd(), 'ai/daemons/wake/daemon.mjs'), 'utf8');
        const orchestratorSource = fs.readFileSync(path.resolve(process.cwd(), 'ai/daemons/orchestrator/daemon.mjs'), 'utf8');
        const daemonSource       = fs.readFileSync(path.resolve(process.cwd(), 'ai/daemons/orchestrator/Orchestrator.mjs'), 'utf8');
        const taskDefSource      = fs.readFileSync(path.resolve(process.cwd(), 'ai/daemons/orchestrator/taskDefinitions.mjs'), 'utf8');

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
        expect(taskDefSource).toContain('compactGraphLog.mjs');
    });

    test('matches only the orchestrator daemon path-tail for singleton self-detection', () => {
        const legacyScriptsPath = ['ai', 'scripts', ['orchestrator', 'daemon.mjs'].join('-')].join('/');

        expect(isOrchestratorDaemonCommand('node /repo/ai/daemons/orchestrator/daemon.mjs')).toBe(true);
        expect(isOrchestratorDaemonCommand('/usr/local/bin/node ai/daemons/orchestrator/daemon.mjs --watch')).toBe(true);

        expect(isOrchestratorDaemonCommand('node /repo/ai/daemons/wake/daemon.mjs')).toBe(false);
        expect(isOrchestratorDaemonCommand(`node /repo/${legacyScriptsPath}`)).toBe(false);
        expect(isOrchestratorDaemonCommand('node daemon.mjs')).toBe(false);
    });

    test('loads gitignored top-level AI config only when present', async () => {
        const loadedPaths = [];
        const aiConfig    = {
            async load(configPath) {
                loadedPaths.push(configPath);
            }
        };

        await expect(loadLocalAiConfig({
            configPath: '/tmp/missing-ai-config.mjs',
            aiConfig,
            existsSync: () => false
        })).resolves.toEqual({
            loaded    : false,
            configPath: '/tmp/missing-ai-config.mjs'
        });

        await expect(loadLocalAiConfig({
            configPath: '/tmp/local-ai-config.mjs',
            aiConfig,
            existsSync: () => true
        })).resolves.toEqual({
            loaded    : true,
            configPath: '/tmp/local-ai-config.mjs'
        });

        expect(loadedPaths).toEqual(['/tmp/local-ai-config.mjs']);
        expect(LOCAL_AI_CONFIG_FILE).toBe(path.resolve(process.cwd(), 'ai/config.mjs'));
    });

});
