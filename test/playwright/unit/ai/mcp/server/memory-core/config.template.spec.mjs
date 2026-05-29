import { test, expect } from '@playwright/test';
import path from 'path';
import Neo from '../../../../../../../src/Neo.mjs';
import BaseConfig, {createConfigProxy} from '../../../../../../../ai/BaseConfig.mjs';
import {TIER1_DEFAULTS} from '../../../../../fixtures/aiConfigDefaults.mjs';

test.describe('Memory Core Config (#10010)', () => {
    let originalEnv;
    let config;
    let originalTier1Config;
    let originalTier1ClassHierarchy;
    let originalConfig;
    let originalClassHierarchy;

    test.beforeAll(async () => {
        originalEnv = { ...process.env };
        originalTier1Config         = Neo.ai?.Config;
        originalTier1ClassHierarchy = Neo.classHierarchyMap?.['Neo.ai.Config'];
        originalConfig         = Neo.ai?.mcp?.server?.['memory-core']?.Config;
        originalClassHierarchy = Neo.classHierarchyMap?.['Neo.ai.mcp.server.memory-core.Config'];

        if (Neo.ai?.Config) {
            delete Neo.ai.Config;
        }
        if (Neo.classHierarchyMap?.['Neo.ai.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.Config'];
        }

        // Remove the class from Neo's namespace to prevent collisions if another spec
        // already imported the production-class template in the same worker.
        if (Neo.ai?.mcp?.server?.['memory-core']?.Config) {
            delete Neo.ai.mcp.server['memory-core'].Config;
        }
        if (Neo.classHierarchyMap?.['Neo.ai.mcp.server.memory-core.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.mcp.server.memory-core.Config'];
        }

        config = (await import('../../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;
    });

    test.afterAll(() => {
        if (originalTier1Config !== undefined) {
            Neo.ai.Config = originalTier1Config;
        } else if (Neo.ai?.Config) {
            delete Neo.ai.Config;
        }

        if (originalTier1ClassHierarchy !== undefined) {
            Neo.classHierarchyMap['Neo.ai.Config'] = originalTier1ClassHierarchy;
        } else if (Neo.classHierarchyMap?.['Neo.ai.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.Config'];
        }

        // Restore any runtime config registration that existed before this template test.
        if (originalConfig !== undefined) {
            Neo.ai.mcp.server['memory-core'].Config = originalConfig;
        } else if (Neo.ai?.mcp?.server?.['memory-core']?.Config) {
            delete Neo.ai.mcp.server['memory-core'].Config;
        }

        if (originalClassHierarchy !== undefined) {
            Neo.classHierarchyMap['Neo.ai.mcp.server.memory-core.Config'] = originalClassHierarchy;
        } else if (Neo.classHierarchyMap?.['Neo.ai.mcp.server.memory-core.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.mcp.server.memory-core.Config'];
        }
    });

    test.afterEach(() => {
        // Restore environment variables
        Object.keys(process.env).forEach(key => {
            if (!(key in originalEnv)) {
                delete process.env[key];
            } else {
                process.env[key] = originalEnv[key];
            }
        });
    });

    test('defaultPolicy initializes to legacy', () => {
        expect(config.memorySharing.defaultPolicy).toBe('legacy');
    });

    test('maps deployment-wide Tier-1 defaults for provider, auth, and storage groups', () => {
        expect(config.modelProvider).toBe(TIER1_DEFAULTS.modelProvider);
        expect(config.graphProvider).toBe(TIER1_DEFAULTS.graphProvider);
        expect(config.embeddingProvider).toBe(TIER1_DEFAULTS.embeddingProvider);
        expect(config.ollama).toEqual(TIER1_DEFAULTS.ollama);
        expect(config.openAiCompatible).toEqual(TIER1_DEFAULTS.openAiCompatible);
        expect(config.vectorDimension).toBe(TIER1_DEFAULTS.vectorDimension);
        expect(config.backupPath).toBe(TIER1_DEFAULTS.backupPath);
        expect(config.modelName).toBe(TIER1_DEFAULTS.modelName);
        expect(config.embeddingModel).toBe(TIER1_DEFAULTS.embeddingModel);

        expect(config.auth).toEqual(TIER1_DEFAULTS.auth);
        expect(config.engines.chroma).toMatchObject({
            host: TIER1_DEFAULTS.engines.chroma.host,
            port: TIER1_DEFAULTS.engines.chroma.port
        });
        // MC reads the unified persist-dir SSOT (`AiConfig.engines.chroma.dataDir`),
        // not a server-local dir. Was the stale `.neo-ai-data/chroma/memory-core` — the bug.
        expect(config.engines.chroma.dataDir).toBe(TIER1_DEFAULTS.engines.chroma.dataDir);
        expect(config.engines.chroma.dataDir).toContain('.neo-ai-data/chroma/knowledge-base');
    });

    test('inherits concrete graphProvider defaults from Tier-1 config', () => {
        expect(TIER1_DEFAULTS.graphProvider).toBe('openAiCompatible');
        expect(config.graphProvider).toBe('openAiCompatible');
    });

    test('env overrides remain final after Tier-1 default mapping', () => {
        process.env.NEO_MODEL_PROVIDER = 'openAiCompatible';
        process.env.NEO_GRAPH_PROVIDER = 'ollama';
        process.env.NEO_EMBEDDING_PROVIDER = 'ollama';
        process.env.NEO_AUTH_REALM = 'tenant-realm';
        process.env.NEO_BACKUP_PATH = '/tmp/neo-memory-backups';
        process.env.NEO_OLLAMA_KEEP_ALIVE = '0';
        process.env.NEO_OLLAMA_REQUIRE_PARALLEL_MODELS = '3';
        process.env.NEO_OPENAI_COMPATIBLE_KEEP_ALIVE = '10m';
        process.env.NEO_OPENAI_COMPATIBLE_REQUIRE_PARALLEL_MODELS = '4';
        process.env.NEO_CHROMA_HOST = 'chroma';
        process.env.NEO_CHROMA_PORT = '8010';

        // Env is decoded at construction via #applyEnvLayer. Build a FRESH isolated
        // instance (env set above) instead of re-constructing the shared module-cached
        // singleton, whose reactive state is contaminated by sibling specs in the parallel
        // suite. config.metaTree carries the resolved Tier-1 leaf defaults.
        const freshCfg = createConfigProxy(Neo.create(BaseConfig, {metaTree: config.metaTree}));

        expect(freshCfg.modelProvider).toBe('openAiCompatible');
        expect(freshCfg.graphProvider).toBe('ollama');
        expect(freshCfg.embeddingProvider).toBe('ollama');
        expect(freshCfg.auth.realm).toBe('tenant-realm');
        expect(freshCfg.backupPath).toBe('/tmp/neo-memory-backups');
        expect(freshCfg.ollama.keep_alive).toBe(0);
        expect(freshCfg.ollama.requireParallelModels).toBe(3);
        expect(freshCfg.openAiCompatible.keep_alive).toBe('10m');
        expect(freshCfg.openAiCompatible.requireParallelModels).toBe(4);
        expect(freshCfg.engines.chroma).toMatchObject({
            host: 'chroma',
            port: 8010
        });

        freshCfg.destroy();
    });

    test('NEO_MEMORY_SHARING_DEFAULT_POLICY env override parses correctly', () => {
        process.env.NEO_MEMORY_SHARING_DEFAULT_POLICY = 'team';

        // Fresh isolated instance picks up the env via #applyEnvLayer at construction.
        const freshCfg = createConfigProxy(Neo.create(BaseConfig, {metaTree: config.metaTree}));

        expect(freshCfg.memorySharing.defaultPolicy).toBe('team');

        freshCfg.destroy();
    });

    test('invalid NEO_MEMORY_SHARING_DEFAULT_POLICY throws Error', () => {
        process.env.NEO_MEMORY_SHARING_DEFAULT_POLICY = 'public';

        // The leaf `parse` fn (parseMemorySharingPolicy) runs inside #applyEnvLayer at
        // construction; a throwing parser propagates out of Neo.create.
        expect(() => Neo.create(BaseConfig, {metaTree: config.metaTree})).toThrow(
            /\[Config\] Invalid NEO_MEMORY_SHARING_DEFAULT_POLICY value: "public"\. Must be one of: legacy, private, team/
        );
    });
});
