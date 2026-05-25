import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../../src/Neo.mjs';
import {TIER1_DEFAULTS} from '../../../../../fixtures/aiConfigDefaults.mjs';

test.describe('Knowledge Base Config Tier-1 defaults (#11963)', () => {
    let originalEnv;
    let config;
    let originalTier1Config;
    let originalTier1ClassHierarchy;
    let originalConfig;
    let originalClassHierarchy;

    test.beforeAll(async () => {
        originalEnv = {...process.env};
        originalTier1Config         = Neo.ai?.Config;
        originalTier1ClassHierarchy = Neo.classHierarchyMap?.['Neo.ai.Config'];
        originalConfig         = Neo.ai?.mcp?.server?.['knowledge-base']?.Config;
        originalClassHierarchy = Neo.classHierarchyMap?.['Neo.ai.mcp.server.knowledge-base.Config'];

        if (Neo.ai?.Config) {
            delete Neo.ai.Config;
        }
        if (Neo.classHierarchyMap?.['Neo.ai.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.Config'];
        }

        if (Neo.ai?.mcp?.server?.['knowledge-base']?.Config) {
            delete Neo.ai.mcp.server['knowledge-base'].Config;
        }
        if (Neo.classHierarchyMap?.['Neo.ai.mcp.server.knowledge-base.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.mcp.server.knowledge-base.Config'];
        }

        config = (await import('../../../../../../../ai/mcp/server/knowledge-base/config.template.mjs')).default;
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

        if (originalConfig !== undefined) {
            Neo.ai.mcp.server['knowledge-base'].Config = originalConfig;
        } else if (Neo.ai?.mcp?.server?.['knowledge-base']?.Config) {
            delete Neo.ai.mcp.server['knowledge-base'].Config;
        }

        if (originalClassHierarchy !== undefined) {
            Neo.classHierarchyMap['Neo.ai.mcp.server.knowledge-base.Config'] = originalClassHierarchy;
        } else if (Neo.classHierarchyMap?.['Neo.ai.mcp.server.knowledge-base.Config']) {
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
        expect(config.auth).toEqual(TIER1_DEFAULTS.auth);
        expect(config.backupPath).toBe(TIER1_DEFAULTS.backupPath);
        expect(config.host).toBe(TIER1_DEFAULTS.engines.chroma.host);
        expect(config.port).toBe(TIER1_DEFAULTS.engines.chroma.port);

        expect(config.collectionName).toBe('neo-knowledge-base');
        expect(config.path).toContain('.neo-ai-data/chroma/knowledge-base');
    });

    test('env overrides remain final after Tier-1 default mapping', () => {
        process.env.NEO_AUTH_REALM = 'tenant-realm';
        process.env.NEO_BACKUP_PATH = '/tmp/neo-kb-backups';
        process.env.NEO_CHROMA_HOST = 'chroma';
        process.env.NEO_CHROMA_PORT = '8010';

        config.data = Neo.clone(config.defaultConfig, true);
        config.applyEnv();

        expect(config.auth.realm).toBe('tenant-realm');
        expect(config.backupPath).toBe('/tmp/neo-kb-backups');
        expect(config.host).toBe('chroma');
        expect(config.port).toBe(8010);
    });
});
