import { test, expect } from '@playwright/test';
import path from 'path';
import Neo from '../../../../../../../src/Neo.mjs';
import ConfigProvider, {createConfigProxy} from '../../../../../../../ai/ConfigProvider.mjs';
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

        // Deterministic realm root: MC declares no realm leaves locally and inherits them
        // up the getParent() chain, so these tests need Neo.ai.Config present. The MC template's
        // side-effect import only registers it on FIRST module-eval — in a reused Playwright worker
        // (cached module) that's a no-op — so install a fresh Tier-1 root built from the canonical
        // template tree, making inheritance deterministic across workers.
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

    test('defaultPolicy initializes to team (#12527)', () => {
        expect(config.memorySharing.defaultPolicy).toBe('team');
    });

    test('inherits deployment-wide Tier-1 defaults (provider, auth, ollama, openAiCompatible, storage) via the realm chain', () => {
        // MC declares none of these locally — they resolve UP the getParent() chain to the
        // Tier-1 realm root. Read KEYED, never whole-namespace: `toEqual(config.ollama)` would
        // enumerate, and namespace enumeration is the deferred getTopLevelDataKeys local-only edge.
        expect(config.modelProvider).toBe(TIER1_DEFAULTS.modelProvider);
        expect(config.graphProvider).toBe(TIER1_DEFAULTS.graphProvider);
        expect(config.embeddingProvider).toBe(TIER1_DEFAULTS.embeddingProvider);
        expect(config.vectorDimension).toBe(TIER1_DEFAULTS.vectorDimension);
        expect(config.backupPath).toBe(TIER1_DEFAULTS.backupPath);
        expect(config.modelName).toBe(TIER1_DEFAULTS.modelName);
        expect(config.embeddingModel).toBe(TIER1_DEFAULTS.embeddingModel);

        expect(config.auth.host).toBe(TIER1_DEFAULTS.auth.host);
        expect(config.auth.port).toBe(TIER1_DEFAULTS.auth.port);
        expect(config.auth.realm).toBe(TIER1_DEFAULTS.auth.realm);
        expect(config.auth.trustProxyIdentity).toBe(TIER1_DEFAULTS.auth.trustProxyIdentity);

        expect(config.ollama.host).toBe(TIER1_DEFAULTS.ollama.host);
        expect(config.ollama.model).toBe(TIER1_DEFAULTS.ollama.model);
        expect(config.ollama.embeddingModel).toBe(TIER1_DEFAULTS.ollama.embeddingModel);

        expect(config.openAiCompatible.host).toBe(TIER1_DEFAULTS.openAiCompatible.host);
        expect(config.openAiCompatible.model).toBe(TIER1_DEFAULTS.openAiCompatible.model);
        expect(config.openAiCompatible.embeddingModel).toBe(TIER1_DEFAULTS.openAiCompatible.embeddingModel);

        expect(config.engines.chroma.host).toBe(TIER1_DEFAULTS.engines.chroma.host);
        expect(config.engines.chroma.port).toBe(TIER1_DEFAULTS.engines.chroma.port);
        // MC reads the unified persist-dir SSOT, not a server-local dir.
        // Was the stale `.neo-ai-data/chroma/memory-core` — the bug.
        expect(config.engines.chroma.dataDir).toBe(TIER1_DEFAULTS.engines.chroma.dataDir);
        expect(config.engines.chroma.dataDir).toContain('.neo-ai-data/chroma/unified');
    });

    test('inherits the Tier-1 active-session idle threshold (#9959)', () => {
        expect(config.orchestrator.swarmHeartbeat.idleThresholdMs).toBe(10 * 60 * 1000);
    });

    test('inherits concrete graphProvider defaults from Tier-1 config', () => {
        expect(TIER1_DEFAULTS.graphProvider).toBe('openAiCompatible');
        expect(config.graphProvider).toBe('openAiCompatible');
    });

    test('declares GraphLog compaction watermark paths', () => {
        expect(config.wakeDaemon.bridgeLastSyncIdPath).toContain('.neo-ai-data/wake-daemon/lastSyncId');
        expect(config.wakeDaemon.wakeSubscriptionLiveCursorPath).toContain('.neo-ai-data/wake-daemon/wakeSubscriptionLiveCursor');
    });

    test('env overrides GraphLog compaction watermark paths', () => {
        process.env.NEO_BRIDGE_LAST_SYNC_ID_PATH = '/tmp/neo-bridge-last-sync-id';
        process.env.NEO_AI_WAKE_SUBSCRIPTION_CURSOR_FILE = '/tmp/neo-wake-live-cursor';

        const freshCfg = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

        try {
            expect(freshCfg.wakeDaemon.bridgeLastSyncIdPath).toBe('/tmp/neo-bridge-last-sync-id');
            expect(freshCfg.wakeDaemon.wakeSubscriptionLiveCursorPath).toBe('/tmp/neo-wake-live-cursor');
        } finally {
            freshCfg.destroy();
        }
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

        // Post-split, MC declares none of these locally — they are Tier-1-owned, so env
        // precedence lives at the OWNER. Build a fresh realm root WITH the env set, register it, and
        // a fresh MC child inherits the overrides up the getParent() chain. (config._data is the raw
        // MC meta-leaf tree; Neo.ai.Config._data is the Tier-1 realm tree, loaded via MC's import.)
        const prevRoot  = Neo.ai?.Config;
        const freshRoot = Neo.create(ConfigProvider, {data: Neo.ai.Config._data});
        Neo.ai.Config   = freshRoot;
        const freshMC   = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

        try {
            expect(freshMC.modelProvider).toBe('openAiCompatible');
            expect(freshMC.graphProvider).toBe('ollama');
            expect(freshMC.embeddingProvider).toBe('ollama');
            expect(freshMC.auth.realm).toBe('tenant-realm');
            expect(freshMC.backupPath).toBe('/tmp/neo-memory-backups');
            expect(freshMC.ollama.keep_alive).toBe(0);
            expect(freshMC.ollama.requireParallelModels).toBe(3);
            expect(freshMC.openAiCompatible.keep_alive).toBe('10m');
            expect(freshMC.openAiCompatible.requireParallelModels).toBe(4);
            expect(freshMC.engines.chroma.host).toBe('chroma');
            expect(freshMC.engines.chroma.port).toBe(8010);
        } finally {
            if (prevRoot === undefined) {delete Neo.ai.Config} else {Neo.ai.Config = prevRoot}
            freshMC.destroy();
            freshRoot.destroy()
        }
    });

    test('NEO_MEMORY_SHARING_DEFAULT_POLICY env override parses correctly', () => {
        process.env.NEO_MEMORY_SHARING_DEFAULT_POLICY = 'team';

        // Fresh isolated instance picks up the env via #applyEnvLayer at construction.
        const freshCfg = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

        expect(freshCfg.memorySharing.defaultPolicy).toBe('team');

        freshCfg.destroy();
    });

    test('invalid NEO_MEMORY_SHARING_DEFAULT_POLICY throws Error', () => {
        process.env.NEO_MEMORY_SHARING_DEFAULT_POLICY = 'public';

        // The leaf `parse` fn (parseMemorySharingPolicy) runs inside #applyEnvLayer at
        // construction; a throwing parser propagates out of Neo.create.
        expect(() => Neo.create(ConfigProvider, {data: config._data})).toThrow(
            /\[Config\] Invalid NEO_MEMORY_SHARING_DEFAULT_POLICY value: "public"\. Must be one of: legacy, private, team/
        );
    });

    test('storagePaths.graph resolves by construction from the useTestDatabase toggle (ADR 0019 §A4/A8; #12491)', () => {
        // The reshape replaced the inline `process.env.UNIT_TEST_MODE ? ':memory:' : prod` leaf ternary
        // with two declarative leaves + a formula. Under the unit suite (UNIT_TEST_MODE=true) the toggle
        // resolves true and the `storagePaths.graph` formula returns `graphTest` — self-validating
        // safe-by-construction isolation (the ~10 graph-path consumers read this one resolved value).
        expect(config.storagePaths.useTestDatabase).toBe(true);
        expect(config.storagePaths.graphTest).toBe(':memory:');
        expect(config.storagePaths.graphProd).toContain('.neo-ai-data/sqlite/memory-core-graph.sqlite');
        expect(config.storagePaths.graph).toBe(':memory:');
        expect(config.storagePaths.graph).toBe(config.storagePaths.graphTest);
    });

    test('collections.memory/session resolve by construction to per-worker-unique test names under the toggle (#12499)', () => {
        // The reshape replaced the inline `process.env.UNIT_TEST_MODE ? test-... : prod` leaf ternaries
        // with *Prod/*Test leaves + formulas; the test names are per-worker-unique module consts. Under
        // the unit suite (UNIT_TEST_MODE=true) the formulas resolve the test names (never prod).
        expect(config.collections.useTestDatabase).toBe(true);
        expect(config.collections.memoryProd).toBe('neo-agent-memory');
        expect(config.collections.sessionProd).toBe('neo-agent-sessions');
        expect(config.collections.memory).toMatch(/^test-memory-/);
        expect(config.collections.session).toMatch(/^test-session-/);
        expect(config.collections.memory).toBe(config.collections.memoryTest);
        expect(config.collections.session).toBe(config.collections.sessionTest);
        expect(config.collections.graph).toBe('neo-native-graph');
    });

    test('remRunRetentionLimit defaults to 200 and parses NEO_REM_RUN_RETENTION_LIMIT as a number (#12123)', () => {
        expect(config.remRunRetentionLimit).toBe(200);

        process.env.NEO_REM_RUN_RETENTION_LIMIT = '50';

        // Fresh isolated instance picks up the env via #applyEnvLayer at construction —
        // never mutate the shared singleton.
        const freshCfg = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

        try {
            expect(freshCfg.remRunRetentionLimit).toBe(50);
        } finally {
            freshCfg.destroy();
        }
    });
});
