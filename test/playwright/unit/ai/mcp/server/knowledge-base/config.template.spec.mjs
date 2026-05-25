import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import AiConfig       from '../../../../../../../ai/config.mjs';

test.describe('Knowledge Base Config Tier-1 defaults (#11963)', () => {
    let originalEnv;
    let config;

    test.beforeAll(async () => {
        originalEnv = {...process.env};

        if (Neo.ai?.mcp?.server?.['knowledge-base']?.Config) {
            delete Neo.ai.mcp.server['knowledge-base'].Config;
        }
        if (Neo.classHierarchyMap?.['Neo.ai.mcp.server.knowledge-base.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.mcp.server.knowledge-base.Config'];
        }

        config = (await import('../../../../../../../ai/mcp/server/knowledge-base/config.template.mjs')).default;
    });

    test.afterAll(() => {
        if (Neo.ai?.mcp?.server?.['knowledge-base']?.Config) {
            delete Neo.ai.mcp.server['knowledge-base'].Config;
        }
        if (Neo.classHierarchyMap?.['Neo.ai.mcp.server.knowledge-base.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.mcp.server.knowledge-base.Config'];
        }
    });

    test.afterEach(() => {
        Object.keys(process.env).forEach(key => {
            if (!(key in originalEnv)) {
                delete process.env[key];
            } else {
                process.env[key] = originalEnv[key];
            }
        });

        config.data = Neo.clone(config.defaultConfig, true);
        config.applyEnv();
    });

    test('maps deployment-wide Tier-1 auth and unified Chroma defaults', () => {
        expect(config.auth).toEqual(AiConfig.auth);
        expect(config.host).toBe(AiConfig.engines.chroma.host);
        expect(config.port).toBe(AiConfig.engines.chroma.port);

        expect(config.collectionName).toBe('neo-knowledge-base');
        expect(config.path).toContain('.neo-ai-data/chroma/knowledge-base');
    });

    test('env overrides remain final after Tier-1 default mapping', () => {
        process.env.NEO_AUTH_REALM = 'tenant-realm';
        process.env.NEO_CHROMA_HOST = 'chroma';
        process.env.NEO_CHROMA_PORT = '8010';

        config.data = Neo.clone(config.defaultConfig, true);
        config.applyEnv();

        expect(config.auth.realm).toBe('tenant-realm');
        expect(config.host).toBe('chroma');
        expect(config.port).toBe(8010);
    });
});
