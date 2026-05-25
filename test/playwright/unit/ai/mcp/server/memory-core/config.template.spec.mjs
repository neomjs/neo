import { test, expect } from '@playwright/test';
import path from 'path';
import Neo from '../../../../../../../src/Neo.mjs';
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

        // Restore config to default by reloading without test env overrides
        config.data = Neo.clone(config.defaultConfig, true);
        config.applyEnv();
    });

    test('defaultPolicy initializes to legacy', () => {
        expect(config.memorySharing.defaultPolicy).toBe('legacy');
    });

    test('maps deployment-wide Tier-1 defaults for provider, auth, and storage groups', () => {
        expect(config.modelProvider).toBe(TIER1_DEFAULTS.modelProvider);
        expect(config.embeddingProvider).toBe(TIER1_DEFAULTS.embeddingProvider);
        expect(config.ollama).toEqual(TIER1_DEFAULTS.ollama);
        expect(config.openAiCompatible).toEqual(TIER1_DEFAULTS.openAiCompatible);
        expect(config.vectorDimension).toBe(TIER1_DEFAULTS.vectorDimension);
        expect(config.modelName).toBe(TIER1_DEFAULTS.modelName);
        expect(config.embeddingModel).toBe(TIER1_DEFAULTS.embeddingModel);

        expect(config.auth).toEqual(TIER1_DEFAULTS.auth);
        expect(config.engines.chroma).toMatchObject({
            host: TIER1_DEFAULTS.engines.chroma.host,
            port: TIER1_DEFAULTS.engines.chroma.port
        });
        expect(config.engines.chroma.dataDir).toContain('.neo-ai-data/chroma/memory-core');
    });

    test('env overrides remain final after Tier-1 default mapping', () => {
        process.env.NEO_MODEL_PROVIDER = 'openAiCompatible';
        process.env.NEO_EMBEDDING_PROVIDER = 'ollama';
        process.env.NEO_AUTH_REALM = 'tenant-realm';
        process.env.NEO_CHROMA_HOST = 'chroma';
        process.env.NEO_CHROMA_PORT = '8010';

        config.data = Neo.clone(config.defaultConfig, true);
        config.applyEnv();

        expect(config.modelProvider).toBe('openAiCompatible');
        expect(config.embeddingProvider).toBe('ollama');
        expect(config.auth.realm).toBe('tenant-realm');
        expect(config.engines.chroma).toMatchObject({
            host: 'chroma',
            port: 8010
        });
    });

    test('NEO_MEMORY_SHARING_DEFAULT_POLICY env override parses correctly', () => {
        process.env.NEO_MEMORY_SHARING_DEFAULT_POLICY = 'team';

        // Re-load the config to pick up env vars
        config.applyEnv();

        expect(config.memorySharing.defaultPolicy).toBe('team');
    });

    test('invalid NEO_MEMORY_SHARING_DEFAULT_POLICY throws Error', () => {
        process.env.NEO_MEMORY_SHARING_DEFAULT_POLICY = 'public';

        expect(() => {
            config.applyEnv();
        }).toThrow(/\[Config\] Invalid NEO_MEMORY_SHARING_DEFAULT_POLICY value: "public"\. Must be one of: legacy, private, team/);
    });
});
