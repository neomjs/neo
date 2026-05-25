import { test, expect } from '@playwright/test';
import path from 'path';
import Neo from '../../../../../../../src/Neo.mjs';
import AiConfig from '../../../../../../../ai/config.mjs';

test.describe('Memory Core Config (#10010)', () => {
    let originalEnv;
    let config;

    test.beforeAll(async () => {
        originalEnv = { ...process.env };

        // Remove the class from Neo's namespace to prevent collisions if another spec
        // already imported the real config.mjs in the same worker.
        if (Neo.ai?.mcp?.server?.['memory-core']?.Config) {
            delete Neo.ai.mcp.server['memory-core'].Config;
        }
        if (Neo.classHierarchyMap?.['Neo.ai.mcp.server.memory-core.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.mcp.server.memory-core.Config'];
        }

        config = (await import('../../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;
    });

    test.afterAll(() => {
        // Remove the class from Neo's namespace to prevent collisions with other specs
        // that import the real config.mjs in the same worker.
        if (Neo.ai?.mcp?.server?.['memory-core']?.Config) {
            delete Neo.ai.mcp.server['memory-core'].Config;
        }
        if (Neo.classHierarchyMap?.['Neo.ai.mcp.server.memory-core.Config']) {
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
        expect(config.modelProvider).toBe(AiConfig.modelProvider);
        expect(config.embeddingProvider).toBe(AiConfig.embeddingProvider);
        expect(config.ollama).toEqual(AiConfig.ollama);
        expect(config.openAiCompatible).toEqual(AiConfig.openAiCompatible);
        expect(config.vectorDimension).toBe(AiConfig.vectorDimension);
        expect(config.modelName).toBe(AiConfig.modelName);
        expect(config.embeddingModel).toBe(AiConfig.embeddingModel);

        expect(config.auth).toEqual(AiConfig.auth);
        expect(config.engines.chroma).toMatchObject({
            host: AiConfig.engines.chroma.host,
            port: AiConfig.engines.chroma.port
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
