import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../../src/Neo.mjs';
import ConfigProvider, {createConfigProxy} from '../../../../../../../ai/ConfigProvider.mjs';
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

        // Deterministic realm root: KB now inherits backupPath / auth.* /
        // dummyEmbeddingFunction from Tier-1 via the getParent() chain. The template import registers
        // Neo.ai.Config only on first module-eval, so install a fresh Tier-1 root to keep inheritance
        // deterministic across reused Playwright workers.
        const tier1Template = (await import('../../../../../../../ai/config.template.mjs')).default;
        Neo.ai = Neo.ai || {};
        Neo.ai.Config = Neo.create(ConfigProvider, {data: tier1Template._data});
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
    });

    test('inherits Tier-1 auth + backupPath via the realm chain; keeps KB-local Chroma + collection', () => {
        // auth.* and backupPath are no longer declared locally — they resolve UP the
        // getParent() chain to the Tier-1 realm root. Read them KEYED, never as a whole namespace:
        // `toEqual(config.auth)` would enumerate, and namespace enumeration is the deferred
        // getTopLevelDataKeys local-only edge → inherited keys are invisible to it.
        expect(config.auth.host).toBe(TIER1_DEFAULTS.auth.host);
        expect(config.auth.port).toBe(TIER1_DEFAULTS.auth.port);
        expect(config.auth.realm).toBe(TIER1_DEFAULTS.auth.realm);
        expect(config.auth.issuerUrl).toBe(TIER1_DEFAULTS.auth.issuerUrl);
        expect(config.auth.clientId).toBe(TIER1_DEFAULTS.auth.clientId);
        expect(config.auth.clientSecret).toBe(TIER1_DEFAULTS.auth.clientSecret);
        expect(config.auth.trustProxyIdentity).toBe(TIER1_DEFAULTS.auth.trustProxyIdentity);
        expect(config.backupPath).toBe(TIER1_DEFAULTS.backupPath);

        // KB-local leaves: Chroma host/port stay local top-level aliases (pending the S3/S4
        // consumer codemod to engines.chroma.*); collection + path are genuinely KB-owned.
        expect(config.host).toBe(TIER1_DEFAULTS.engines.chroma.host);
        expect(config.port).toBe(TIER1_DEFAULTS.engines.chroma.port);
        expect(config.collectionName).toBe('neo-knowledge-base');
        expect(config.path).toContain('.neo-ai-data/chroma/unified');
    });

    test('env overrides win — KB-local leaves at the child, Tier-1-owned leaves at the owner (inherited)', () => {
        process.env.NEO_DEBUG       = 'true';
        process.env.NEO_CHROMA_HOST = 'chroma';
        process.env.NEO_CHROMA_PORT = '8010';
        process.env.NEO_AUTH_REALM  = 'tenant-realm';
        process.env.NEO_BACKUP_PATH = '/tmp/neo-kb-backups';

        // KB-LOCAL leaves (Chroma host/port) — env applies at the CHILD instance directly.
        // Fresh isolated instance (not the module-cached singleton, whose reactive state is
        // contaminated by sibling specs). config._data carries the raw KB meta-leaf tree.
        const freshKB = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

        // TIER-1-OWNED leaves (auth.*, backupPath) — post-split the child no longer declares them,
        // so env precedence lives at the OWNER. Build a fresh realm root WITH the env set and
        // register it so the child inherits the override up the getParent() chain.
        const prevRoot  = Neo.ai?.Config;
        const freshRoot = Neo.create(ConfigProvider, {data: Neo.ai.Config._data});
        Neo.ai.Config   = freshRoot;

        try {
            expect(freshKB.debug).toBe(true);                       // KB-local, env at child
            expect(freshKB.host).toBe('chroma');                    // KB-local, env at child
            expect(freshKB.port).toBe(8010);                        // KB-local, env at child
            expect(freshKB.auth.realm).toBe('tenant-realm');        // Tier-1-owned, env at owner → inherited
            expect(freshKB.backupPath).toBe('/tmp/neo-kb-backups'); // Tier-1-owned → inherited
        } finally {
            if (prevRoot === undefined) {delete Neo.ai.Config} else {Neo.ai.Config = prevRoot}
            freshKB.destroy();
            freshRoot.destroy()
        }
    });

    test('keeps debug off by default and accepts NEO_DEBUG as a KB-local override', () => {
        const defaultKB = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

        try {
            expect(defaultKB.debug).toBe(false);
        } finally {
            defaultKB.destroy()
        }

        process.env.NEO_DEBUG = 'true';

        const freshKB = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

        try {
            expect(freshKB.debug).toBe(true);
        } finally {
            freshKB.destroy()
        }
    });

    test('invalid NEO_DEBUG values fall back to the debug-off default', () => {
        process.env.NEO_DEBUG = 'maybe';

        const
            warnings     = [],
            originalWarn = console.warn;

        let freshKB;

        console.warn = message => warnings.push(message);

        try {
            freshKB = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

            expect(freshKB.debug).toBe(false);
            expect(warnings.some(message => message.includes('Invalid NEO_DEBUG'))).toBe(true);
        } finally {
            console.warn = originalWarn;
            freshKB?.destroy()
        }
    });
});
