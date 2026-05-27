import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import Neo from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import {TIER1_DEFAULTS} from '../../fixtures/aiConfigDefaults.mjs';

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

    test('defaultConfig remains unmutated across singleton instantiations', async () => {
        const initialPort = Config.mcpHttpPort;

        // Modify through the singleton instance
        Config.data.mcpHttpPort = 9999;
        expect(Config.mcpHttpPort).toBe(9999);

        // Re-run construct to re-clone from defaultConfig using the unwrapped instance
        Neo.ns('Neo.ai.Config').construct({});

        // The re-cloned instance should not inherit the mutated port
        expect(Neo.ns('Neo.ai.Config').data.mcpHttpPort).not.toBe(9999);
        expect(Neo.ns('Neo.ai.Config').data.mcpHttpPort).toBe(initialPort);
    });

    test('ships a machine-neutral orchestrator dev-sync root default', async () => {
        expect(Config.orchestrator.devSyncRoots).toEqual([]);
    });

    test('ships Tier-1 provider and unified Chroma defaults', async () => {
        expect(Config.chatProvider).toBe(process.env.NEO_MODEL_PROVIDER || 'gemini');
        expect(Config.modelProvider).toBe(Config.chatProvider);
        expect(Config.graphProvider).toBe(process.env.NEO_GRAPH_PROVIDER || 'openAiCompatible');
        expect(Config.embeddingProvider).toBe(process.env.NEO_EMBEDDING_PROVIDER || 'openAiCompatible');
        expect(Config.vectorDimension).toBe(Number(process.env.NEO_VECTOR_DIMENSION) || 4096);
        expect(Config.backupPath).toBe(TIER1_DEFAULTS.backupPath);
        expect(Config.modelName).toBe('gemini-2.5-flash');
        expect(Config.embeddingModel).toBe('gemini-embedding-001');

        expect(Config.ollama).toMatchObject({
            host          : process.env.NEO_OLLAMA_HOST || 'http://127.0.0.1:11434',
            model         : process.env.NEO_OLLAMA_MODEL || 'gemma4:31b',
            embeddingModel: process.env.NEO_OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding'
        });
        expect(Config.openAiCompatible).toMatchObject({
            host                    : process.env.NEO_OPENAI_COMPATIBLE_HOST || 'http://127.0.0.1:11434',
            model                   : process.env.NEO_OPENAI_COMPATIBLE_MODEL || 'gemma-4-31b-it',
            embeddingModel          : process.env.NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL || 'text-embedding-qwen3-embedding-8b',
            apiKey                  : process.env.NEO_OPENAI_COMPATIBLE_API_KEY || '',
            unloadRetryCount        : Number(process.env.NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_COUNT) || 3,
            unloadRetryDelayMs      : Number(process.env.NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_DELAY_MS) || 500,
            contextLimitTokens      : Number(process.env.NEO_OPENAI_COMPATIBLE_CONTEXT_LIMIT_TOKENS) || 262144,
            safeProcessingLimitTokens: Number(process.env.NEO_OPENAI_COMPATIBLE_SAFE_PROCESSING_LIMIT_TOKENS) || 200000
        });
        expect(Config.engines.chroma).toEqual({
            host: process.env.NEO_CHROMA_HOST || 'localhost',
            port: Number(process.env.NEO_CHROMA_PORT) || 8000
        });
    });

    test('ships top-level deployment and maintenance policy defaults', async () => {
        expect(Config.orchestrator.deploymentMode).toBe('local');
        expect(Config.orchestrator.intervals).toMatchObject({
            pollMs          : 3000,
            summarySweepMs  : 10 * 60 * 1000,
            kbSyncMs        : 30 * 60 * 1000,
            backupMs        : 24 * 60 * 60 * 1000,
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
            goldenPathRepoEnrichmentEnabled: null,
            swarmHeartbeatEnabled: null,
            wakeDispatchEnabled  : null
        });

        // #12003: swarm-heartbeat candidate-discovery default is the activity-derived
        // source per Discussion #11992 §5.1.1 "activity-derived signals" framing.
        // Per-MC-instance derived; no team-registry coupling; tenant-safe for external
        // workspaces (each deployment's MC has its own A2A activity).
        expect(Config.orchestrator.swarmHeartbeat).toEqual({
            targetSource: 'active-a2a-participants'
        });

        // Provider-readiness probe parameters consumed by the orchestrator dream task
        // + standalone Sandman CLI runner. Values are concrete defaults — no module-level
        // constants substitute when callers omit them.
        expect(Config.orchestrator.providerReadiness).toEqual({
            attempts : Number(process.env.NEO_ORCHESTRATOR_PROVIDER_READY_ATTEMPTS)   || 30,
            delayMs  : Number(process.env.NEO_ORCHESTRATOR_PROVIDER_READY_DELAY_MS)   || 1000,
            timeoutMs: Number(process.env.NEO_ORCHESTRATOR_PROVIDER_READY_TIMEOUT_MS) || 3000
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

            expect(source).not.toMatch(/^const\s+(defaultConfig|envBindings)\s*=/m);
            expect(source).toMatch(/static\s+defaultConfig\s*=/);
            expect(source).toMatch(/static\s+envBindings\s*=/);
        }
    });
});
