import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import Neo from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import ConfigProvider from '../../../../ai/ConfigProvider.mjs';
import {TIER1_DEFAULTS} from '../../fixtures/aiConfigDefaults.mjs';
import {CHROMA_TEST_DATABASE} from '../../../../ai/services/shared/vector/chromaTestIsolation.mjs';

test.describe('Tier 1 Config Immutability', () => {
    let Config;
    let originalConfig;
    let originalClassHierarchy;

    test.beforeAll(async () => {
        originalConfig         = Neo.ai?.Config;
        originalClassHierarchy = Neo.classHierarchyMap?.['Neo.ai.Config'];

        if (Neo.ai?.Config) {
            delete Neo.ai.Config;
        }
        if (Neo.classHierarchyMap?.['Neo.ai.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.Config'];
        }

        Config = (await import('../../../../ai/config.template.mjs')).default;
    });

    test.afterAll(() => {
        if (originalConfig !== undefined) {
            Neo.ai.Config = originalConfig;
        } else if (Neo.ai?.Config) {
            delete Neo.ai.Config;
        }

        if (originalClassHierarchy !== undefined) {
            Neo.classHierarchyMap['Neo.ai.Config'] = originalClassHierarchy;
        } else if (Neo.classHierarchyMap?.['Neo.ai.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.Config'];
        }
    });

    test('leaf defaults are not mutated by instance writes (fresh instances get clean defaults)', async () => {
        const initialPort = Config.mcpHttpPort;

        // Mutate the runtime value through the singleton instance
        Config.data.mcpHttpPort = 9999;
        expect(Config.mcpHttpPort).toBe(9999);

        // A fresh instance built from the same meta-leaf tree (`_data`) gets the clean default —
        // the instance write touched the reactive Config value, not the leaf `default`.
        const fresh = Neo.create(ConfigProvider, {data: Config._data});
        expect(fresh.getDataConfig('mcpHttpPort').get()).not.toBe(9999);
        expect(fresh.getDataConfig('mcpHttpPort').get()).toBe(initialPort);
    });

    test('ships a machine-neutral orchestrator dev-sync root default', async () => {
        expect(Config.orchestrator.devSyncRoots).toEqual([]);
    });

    test('ships Tier-1 provider and unified Chroma defaults', async () => {
        expect(Config.chatProvider).toBe(process.env.NEO_MODEL_PROVIDER || 'openAiCompatible');
        expect(Config.modelProvider).toBe(Config.chatProvider);
        expect(Config.graphProvider).toBe(process.env.NEO_GRAPH_PROVIDER || 'openAiCompatible');
        expect(Config.embeddingProvider).toBe(process.env.NEO_EMBEDDING_PROVIDER || 'openAiCompatible');
        expect(Config.vectorDimension).toBe(Number(process.env.NEO_VECTOR_DIMENSION) || 4096);
        expect(Config.backupPath).toBe(TIER1_DEFAULTS.backupPath);
        expect(Config.modelName).toBe('gemini-3.5-flash');
        expect(Config.embeddingModel).toBe('gemini-embedding-001');

        expect(Config.ollama).toMatchObject({
            host                 : process.env.NEO_OLLAMA_HOST || 'http://127.0.0.1:11434',
            model                : process.env.NEO_OLLAMA_MODEL || 'gemma4:31b',
            embeddingModel       : process.env.NEO_OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding',
            keep_alive           : TIER1_DEFAULTS.ollama.keep_alive,
            requireParallelModels: TIER1_DEFAULTS.ollama.requireParallelModels
        });
        expect(Config.openAiCompatible).toMatchObject({
            host                    : process.env.NEO_OPENAI_COMPATIBLE_HOST || 'http://127.0.0.1:11434',
            model                   : process.env.NEO_OPENAI_COMPATIBLE_MODEL || 'gemma-4-31b-it',
            embeddingModel          : process.env.NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL || 'text-embedding-qwen3-embedding-8b',
            apiKey                  : process.env.NEO_OPENAI_COMPATIBLE_API_KEY || '',
            unloadRetryCount        : Number(process.env.NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_COUNT) || 3,
            unloadRetryDelayMs      : Number(process.env.NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_DELAY_MS) || 500,
            contentionRetryCount    : Number(process.env.NEO_OPENAI_COMPATIBLE_CONTENTION_RETRY_COUNT) || 2,
            contentionRetryDelayMs  : Number(process.env.NEO_OPENAI_COMPATIBLE_CONTENTION_RETRY_DELAY_MS) || 1000,
            contentionTimeoutMs     : Number(process.env.NEO_OPENAI_COMPATIBLE_CONTENTION_TIMEOUT_MS) || 15000,
            batchEmbeddingChunkSize: Number(process.env.NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_CHUNK_SIZE) || 5,
            batchEmbeddingYieldMs   : Number(process.env.NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_YIELD_MS) || 0,
            keep_alive              : TIER1_DEFAULTS.openAiCompatible.keep_alive,
            requireParallelModels   : TIER1_DEFAULTS.openAiCompatible.requireParallelModels
        });
        expect(Config.localModels).toMatchObject({
            chat: {
                contextLimitTokens      : Number(process.env.NEO_LOCAL_MODELS_CHAT_CONTEXT_LIMIT_TOKENS) || 262144,
                safeProcessingLimitTokens: Number(process.env.NEO_LOCAL_MODELS_CHAT_SAFE_PROCESSING_LIMIT_TOKENS) || 200000
            },
            embedding: {
                contextLimitTokens      : Number(process.env.NEO_LOCAL_MODELS_EMBEDDING_CONTEXT_LIMIT_TOKENS) || 32768,
                safeProcessingLimitTokens: Number(process.env.NEO_LOCAL_MODELS_EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS) || 28672
            }
        });
        expect(Config.engines.chroma).toEqual({
            dataDir        : expect.stringMatching(/\.neo-ai-data[/\\]chroma[/\\]unified$/),
            host           : process.env.NEO_CHROMA_HOST || 'localhost',
            port           : Number(process.env.NEO_CHROMA_PORT) || 8000,
            database       : process.env.NEO_CHROMA_DATABASE || 'default_database',
            databaseTest   : process.env.NEO_CHROMA_DATABASE_TEST || CHROMA_TEST_DATABASE,
            useTestDatabase: true
        });
    });

    test('keeps local embedding context env overrides role-scoped (#12286)', () => {
        const originalContext = Config.localModels.embedding.contextLimitTokens,
              originalSafe    = Config.localModels.embedding.safeProcessingLimitTokens;

        Config.setEnvOverride('NEO_LOCAL_MODELS_EMBEDDING_CONTEXT_LIMIT_TOKENS', 12345);
        Config.setEnvOverride('NEO_LOCAL_MODELS_EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS', 11111);

        expect(Config.localModels.embedding).toMatchObject({
            contextLimitTokens      : 12345,
            safeProcessingLimitTokens: 11111
        });
        expect(Config.localModels.chat.contextLimitTokens).toBe(Number(process.env.NEO_LOCAL_MODELS_CHAT_CONTEXT_LIMIT_TOKENS) || 262144);

        Config.setEnvOverride('NEO_LOCAL_MODELS_EMBEDDING_CONTEXT_LIMIT_TOKENS', originalContext);
        Config.setEnvOverride('NEO_LOCAL_MODELS_EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS', originalSafe);
    });

    test('ships top-level deployment and maintenance policy defaults', async () => {
        expect(Config.orchestrator.deploymentMode).toBe('local');
        expect(Config.orchestrator.intervals).toMatchObject({
            pollMs          : 3000,
            summarySweepMs  : 10 * 60 * 1000,
            kbSyncMs        : 30 * 60 * 1000,
            backupMs        : 24 * 60 * 60 * 1000,
            graphLogCompactionMs: 24 * 60 * 60 * 1000,
            primaryDevSyncMs: 10 * 60 * 1000,
            dreamMs         : 60 * 60 * 1000,
            goldenPathMs    : 60 * 60 * 1000,
            swarmHeartbeatMs: 15 * 60 * 1000
        });
        expect(Config.orchestrator.localOnly).toEqual({
            primaryDevSyncEnabled: null,
            kbSyncEnabled        : null,
            chromaDaemonEnabled  : null,
            bridgeDaemonEnabled  : null,
            embedDaemonEnabled   : null,
            goldenPathRepoEnrichmentEnabled: null,
            swarmHeartbeatEnabled: null,
            wakeDispatchEnabled  : null
        });

        // The swarm-heartbeat candidate-discovery default is the activity-derived source
        // ("activity-derived signals" framing).
        // Per-MC-instance derived; no team-registry coupling; tenant-safe for external
        // workspaces (each deployment's MC has its own A2A activity). `targets` is the
        // optional explicit-handle-list override (highest resolver precedence) — null by
        // default so the resolver falls through to `targetSource` semantics.
        expect(Config.orchestrator.swarmHeartbeat).toEqual({
            targetSource           : 'active-a2a-participants',
            targets                : null,
            // Wake-policy leaves: NEO_-prefixed env names bound (NEO_IDLE_THRESHOLD_MS /
            // NEO_SWARM_WAKE_COOLDOWN_SECONDS / NEO_SWARM_IDENTITIES), deployment-portable defaults.
            idleThresholdMs         : 10 * 60 * 1000,
            swarmWakeCooldownSeconds: 600,
            allIdleIdentities       : null
        });
        const graphLogCompactionEnabledEnv = process.env.NEO_ORCHESTRATOR_GRAPHLOG_COMPACTION_ENABLED?.trim().toLowerCase();
        const graphLogCompactionVacuumEnv  = process.env.NEO_ORCHESTRATOR_GRAPHLOG_COMPACTION_VACUUM?.trim().toLowerCase();
        const graphLogCompactionDisabled   = ['false', 'no', 'off', '0'].includes(graphLogCompactionEnabledEnv);
        const graphLogCompactionVacuum     = ['true', 'yes', 'on', '1'].includes(graphLogCompactionVacuumEnv);

        expect(Config.orchestrator.graphLogCompaction).toEqual({
            enabled: graphLogCompactionEnabledEnv === undefined ? true : !graphLogCompactionDisabled,
            vacuum : graphLogCompactionVacuum
        });

        // Provider-readiness probe parameters consumed by the orchestrator dream task
        // + standalone Sandman CLI runner. Values are concrete defaults — no module-level
        // constants substitute when callers omit them.
        expect(Config.orchestrator.providerReadiness).toEqual({
            attempts : Number(process.env.NEO_ORCHESTRATOR_PROVIDER_READY_ATTEMPTS)   || 30,
            delayMs  : Number(process.env.NEO_ORCHESTRATOR_PROVIDER_READY_DELAY_MS)   || 1000,
            timeoutMs: Number(process.env.NEO_ORCHESTRATOR_PROVIDER_READY_TIMEOUT_MS) || 3000
        });
        const lmsEnabledEnv = process.env.NEO_ORCHESTRATOR_LMS_ENABLED?.trim().toLowerCase();
        const lmsDisabled   = ['false', 'no', 'off', '0'].includes(lmsEnabledEnv);

        expect(Config.orchestrator.lms).toMatchObject({
            enabled: lmsEnabledEnv === undefined ? true : !lmsDisabled,
            model  : process.env.NEO_ORCHESTRATOR_LMS_MODEL || 'qwen3-embedding-8b',
            port   : process.env.NEO_ORCHESTRATOR_LMS_PORT || '1234'
        });

        expect(Config.maintenance.backup).toEqual({
            intervalMs: 24 * 60 * 60 * 1000,
            retention: {
                keepMinimum: 3,
                maxDays    : 30
            }
        });
        expect(Config.maintenance.defrag).toEqual({
            intervalMs: 7 * 24 * 60 * 60 * 1000,
            snapshotRetention: {
                keepMinimum: 3,
                maxDays    : 7
            }
        });
    });

    test('ships default-off GitLab-PAT hardening leaves as CSV-backed arrays', () => {
        expect(Config.auth.allowedClientIds).toEqual([]);
        expect(Config.auth.allowedUsers).toEqual([]);

        Config.setEnvOverride('NEO_AUTH_ALLOWED_CLIENT_IDS', ['mcp-oauth-app']);
        Config.setEnvOverride('NEO_AUTH_ALLOWED_USERS', ['neo-gpt']);

        expect(Config.auth.allowedClientIds).toEqual(['mcp-oauth-app']);
        expect(Config.auth.allowedUsers).toEqual(['neo-gpt']);

        Config.setEnvOverride('NEO_AUTH_ALLOWED_CLIENT_IDS', []);
        Config.setEnvOverride('NEO_AUTH_ALLOWED_USERS', []);
    });

    test('keeps config ledgers inside config classes', async () => {
        const templateUrls = [
            '../../../../ai/config.template.mjs',
            '../../../../ai/mcp/server/github-workflow/config.template.mjs',
            '../../../../ai/mcp/server/gitlab-workflow/config.template.mjs',
            '../../../../ai/mcp/server/knowledge-base/config.template.mjs',
            '../../../../ai/mcp/server/memory-core/config.template.mjs',
            '../../../../ai/mcp/server/neural-link/config.template.mjs'
        ];

        for (const templateUrl of templateUrls) {
            const source = await fs.readFile(new URL(templateUrl, import.meta.url), 'utf8');

            // The ledger lives inside the config class as a single `static config` block
            // whose `data` config holds the `{env?, default, parse?}` leaves — never as a
            // module-level `const` (the old parallel defaultConfig/envBindings shape, and
            // its meta-leaf successor, would both leak the ledger out of the class).
            expect(source).not.toMatch(/^const\s+(defaultConfig|envBindings|metaTree)\s*=/m);
            expect(source).toMatch(/static\s+config\s*=/);
            expect(source).toMatch(/data\s*:/);
        }
    });
});
