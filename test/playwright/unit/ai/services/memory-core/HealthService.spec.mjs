import {setup} from '../../../../setup.mjs';

const appName = 'HealthServiceTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}         from '@playwright/test';
import Neo                    from '../../../../../../src/Neo.mjs';
import * as core              from '../../../../../../src/core/_export.mjs';
import InstanceManager        from '../../../../../../src/manager/Instance.mjs';
import AiConfig               from '../../../../../../ai/config.mjs';
import ChromaManager          from '../../../../../../ai/services/memory-core/managers/ChromaManager.mjs';
import StorageRouter          from '../../../../../../ai/services/memory-core/managers/StorageRouter.mjs';
import ChromaLifecycleService from '../../../../../../ai/services/memory-core/lifecycle/ChromaLifecycleService.mjs';
import logger                 from '../../../../../../ai/mcp/server/memory-core/logger.mjs';

/**
 * @summary Coverage for the identity observability block in the healthcheck payload.
 *
 * The integration test (HealthService.healthcheck() end-to-end) requires ChromaDB + StorageRouter
 * + multiple service singletons. Those are out of scope here — this spec pins the PURE projection
 * logic via `buildIdentityBlock`, which is the load-bearing function for the AC shape contract.
 * Integration correctness is validated post-merge via empirical restart + healthcheck inspection.
 *
 * @see Neo.ai.services.memory-core.HealthService#buildIdentityBlock
 */
test.describe('HealthService #10176 — buildIdentityBlock', () => {
    let buildIdentityBlock;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/HealthService.mjs');
        buildIdentityBlock = mod.buildIdentityBlock;
    });


    test('null state projects to unresolved + unbound', () => {
        expect(buildIdentityBlock(null)).toEqual({
            source : 'unresolved',
            bound  : false,
            nodeId : null,
            warning: null
        });
    });

    test('explicit unresolved state (resolver yielded no userId) projects to unresolved + unbound', () => {
        // StdioIdentityResolver's failure mode: env-var missing AND gh-cli failed/timed-out.
        // Server.mjs may pass through the explicit shape or null — both paths land in the
        // same observable state. This covers the explicit-shape path.
        const state = {userId: null, agentIdentityNodeId: null, source: 'unresolved'};
        expect(buildIdentityBlock(state)).toEqual({
            source : 'unresolved',
            bound  : false,
            nodeId : null,
            warning: null
        });
    });

    test('env-var resolution with matching graph node projects to bound', () => {
        // The expected success shape for A2A operation: NEO_AGENT_IDENTITY env var pinned at
        // harness level, graph node seeded during boot-time self-seed, bindAgentIdentity
        // resolved the node at boot.
        const state = {
            userId             : 'neo-opus-ada',
            agentIdentityNodeId: '@neo-opus-ada',
            source             : 'env-var'
        };
        expect(buildIdentityBlock(state)).toEqual({
            source : 'env-var',
            bound  : true,
            nodeId : '@neo-opus-ada',
            warning: null
        });
    });

    test('gh-cli resolution with matching graph node projects to bound', () => {
        // Human-developer path or harness without NEO_AGENT_IDENTITY pin: gh CLI resolves
        // the authenticated login, graph has the seeded node, bindAgentIdentity succeeds.
        const state = {
            userId             : 'tobiu',
            agentIdentityNodeId: '@tobiu',
            source             : 'gh-cli'
        };
        expect(buildIdentityBlock(state)).toEqual({
            source : 'gh-cli',
            bound  : true,
            nodeId : '@tobiu',
            warning: null
        });
    });

    test('env-var userId without graph node projects a structured warning', () => {
        // Diagnostic shape: resolver worked, but the AgentIdentity graph node for that
        // login does not exist. The operator can immediately check identity seeding
        // instead of mining boot logs.
        const state = {
            userId             : 'neo-opus-grace',
            agentIdentityNodeId: null,
            source             : 'env-var'
        };

        const block = buildIdentityBlock(state);

        expect(block.source).toBe('env-var');
        expect(block.bound).toBe(false);
        expect(block.nodeId).toBeNull();
        expect(block.warning).toContain("NEO_AGENT_IDENTITY is pinned to 'neo-opus-grace'");
        expect(block.warning).toContain('stale checkout');
        expect(block.warning).toContain('ai/scripts/setup/seedAgentIdentities.mjs');
        expect(block.warning).toContain('ai/graph/identityRoots.mjs');
    });

    test('gh-cli userId without graph node stays unbound without warning', () => {
        const state = {
            userId             : 'local-human',
            agentIdentityNodeId: null,
            source             : 'gh-cli'
        };

        expect(buildIdentityBlock(state)).toEqual({
            source : 'gh-cli',
            bound  : false,
            nodeId : null,
            warning: null
        });
    });

    test('cloud request identity sources stay unbound without warning', () => {
        for (const source of ['proxy-header', 'oidc']) {
            expect(buildIdentityBlock({
                userId             : 'tenant-user',
                agentIdentityNodeId: null,
                source
            })).toEqual({
                source,
                bound  : false,
                nodeId : null,
                warning: null
            });
        }
    });

    test('missing source defaults to unresolved', () => {
        // Defense-in-depth: if a caller ever passes a state with userId but no source field
        // (shouldn't happen per StdioIdentityResolver contract, but guard against drift),
        // we project to the safe 'unresolved' value rather than undefined/leaked.
        const state = {
            userId             : 'neo-opus-ada',
            agentIdentityNodeId: '@neo-opus-ada'
            // no source
        };
        expect(buildIdentityBlock(state)).toEqual({
            source : 'unresolved',
            bound  : true,
            nodeId : '@neo-opus-ada',
            warning: null
        });
    });
});

test.describe('HealthService #13312 — startup dependency observability', () => {
    let HealthService;

    test.beforeAll(async () => {
        HealthService = (await import('../../../../../../ai/services/memory-core/HealthService.mjs')).default;
    });

    test('records degraded startup tiers without exposing mutable internal state', () => {
        const dependencyName = `unit-startup-dependency-${Date.now()}`;

        try {
            HealthService.recordStartupDependency(dependencyName, 'degraded', {
                className: 'Test.Unit.MemoryCore.StartupDependency',
                error    : 'attempt to write a readonly database'
            });

            const state = HealthService.getStartupDependencyState();

            expect(state[dependencyName]).toMatchObject({
                status   : 'degraded',
                className: 'Test.Unit.MemoryCore.StartupDependency',
                error    : 'attempt to write a readonly database'
            });
            expect(state[dependencyName].recordedAt).toEqual(expect.any(String));

            state[dependencyName].status = 'mutated';

            expect(HealthService.getStartupDependencyState()[dependencyName].status).toBe('degraded');
        } finally {
            HealthService.clearStartupDependencyState();
        }
    });

    test('clearCache writes file-only diagnostics without console debug spam (#13995)', () => {
        const originalDebug     = logger.debug,
              originalFileDebug = logger.fileDebug,
              debugCalls        = [],
              fileDebugCalls    = [];

        logger.debug     = (...args) => debugCalls.push(args);
        logger.fileDebug = (...args) => fileDebugCalls.push(args);

        try {
            HealthService.clearCache();

            expect(debugCalls).toHaveLength(0);
            expect(fileDebugCalls).toHaveLength(1);
            expect(fileDebugCalls[0][0]).toContain('Cache cleared');
        } finally {
            logger.debug     = originalDebug;
            logger.fileDebug = originalFileDebug;
        }
    });
});

/**
 * @summary Coverage for the Memory Core runtime freshness diagnostic.
 *
 * The incident was a healthy long-lived MCP process reporting stale provider/config state after
 * `ai/config.mjs` had been migrated on disk. These tests pin the pure classification contract and
 * the injected reader seam without restarting a live MCP server.
 *
 * @see Neo.ai.services.memory-core.HealthService#resolveRuntimeFreshness
 */
test.describe.serial('HealthService #12772 — runtimeFreshness', () => {
    let HealthService;

    test.beforeAll(async () => {
        HealthService = (await import('../../../../../../ai/services/memory-core/HealthService.mjs')).default;
    });

    test.afterEach(() => {
        HealthService.runtimeFreshnessReader = null;
        HealthService.clearCache();
    });

    test('classifies matching boot/current identity as current', async () => {
        HealthService.runtimeFreshnessReader = async () => ({
            boot: {
                gitHead      : 'abc123',
                configDigest : 'sha256:same-config',
                openApiDigest: 'sha256:same-openapi'
            },
            current: {
                gitHead      : 'abc123',
                configDigest : 'sha256:same-config',
                openApiDigest: 'sha256:same-openapi'
            }
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result).toMatchObject({
            status: 'current',
            stale : {
                configDigest : false,
                openApiDigest: false
            },
            hint: null
        });
        expect(result.details).toContain('Runtime source/config identity matches the current checkout.');
        expect(result.boot).toBeUndefined();
        expect(result.current).toBeUndefined();
    });

    test('classifies stale config identity with restart guidance', async () => {
        HealthService.runtimeFreshnessReader = async () => ({
            boot: {
                gitHead      : 'abc123',
                configDigest : 'sha256:old-config',
                openApiDigest: 'sha256:same-openapi'
            },
            current: {
                gitHead      : 'abc123',
                configDigest : 'sha256:new-config',
                openApiDigest: 'sha256:same-openapi'
            }
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result).toMatchObject({
            status: 'stale',
            stale : {
                configDigest : true,
                openApiDigest: false
            },
            hint: 'Restart or reconnect the Memory Core MCP server to refresh cached provider/config state.'
        });
        expect(result.details[0]).toContain('Memory Core MCP server');
        expect(result.details[0]).toContain('configDigest');
    });

    test('does not track gitHead — injected gitHead drift is ignored entirely', async () => {
        // Memory Core supplies no rootDir to the shared tracker, so gitHead is never read or
        // surfaced. Even a reader returning differing gitHead values must not appear in `stale`
        // nor flip status: the freshness signal is digest-only and portable off a git checkout.
        HealthService.runtimeFreshnessReader = async () => ({
            boot: {
                gitHead      : 'old-head',
                configDigest : 'sha256:same-config',
                openApiDigest: 'sha256:same-openapi'
            },
            current: {
                gitHead      : 'new-head',
                configDigest : 'sha256:same-config',
                openApiDigest: 'sha256:same-openapi'
            }
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result.status).toBe('current');
        expect(result.stale).not.toHaveProperty('gitHead');
        expect(result.stale).toEqual({configDigest: false, openApiDigest: false});
        expect(result.details.join(' ')).not.toContain('informational');
    });

    test('classifies missing identity as unknown without throwing', async () => {
        HealthService.runtimeFreshnessReader = async () => ({
            boot   : {},
            current: {},
            errors : ['current config digest unavailable: fixture']
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result).toMatchObject({
            status: 'unknown',
            stale : {
                configDigest : null,
                openApiDigest: null
            },
            hint: null
        });
        expect(result.details).toContain('current config digest unavailable: fixture');
    });
});

/**
 * @summary Coverage for the request-fresh cached healthcheck path.
 *
 * The live bug was in the healthy-cache fast path: direct healthcheck callers observed the cached
 * payload's original `timestamp` and collection counts even after later writes. The tests patch the
 * singleton collaborators to keep the path unit-fast while still exercising the public `healthcheck()`
 * API instead of a detached helper.
 *
 * @see Neo.ai.services.memory-core.HealthService#healthcheck
 */
test.describe('HealthService #12382 — cached healthcheck freshness', () => {
    test.describe.configure({mode: 'serial'});

    let HealthService;
    let TextEmbeddingService;
    let memoryCount;
    let originalDateNow;
    let originalEmbedText;
    let originalGeminiApiKey;
    let originals;
    let summaryCount;
    let summaryGetCalls;
    let summaryUnavailableOnCall;

    const makeCollection = countGetter => ({
        count: async () => countGetter(),
        get  : async () => ({ids: [], metadatas: []})
    });
    const createNotFoundError = () => {
        const error = new Error('The requested resource could not be found');
        error.name  = 'ChromaNotFoundError';
        return error
    };

    test.beforeAll(async () => {
        HealthService = (await import('../../../../../../ai/services/memory-core/HealthService.mjs')).default;
        TextEmbeddingService = (await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;
    });

    test.beforeEach(() => {
        originalDateNow    = Date.now;
        originalEmbedText  = TextEmbeddingService.embedText;
        originalGeminiApiKey = process.env.GEMINI_API_KEY;
        memoryCount        = 10;
        summaryCount       = 20;
        summaryGetCalls    = 0;
        summaryUnavailableOnCall = null;

        const memoryCollection  = makeCollection(() => memoryCount);
        const summaryCollection = makeCollection(() => summaryCount);

        originals = {
            chromaConnected          : ChromaManager.connected,
            chromaReady              : ChromaManager.ready,
            chromaConnect            : ChromaManager.connect,
            invalidateCollectionCache: ChromaManager.invalidateCollectionCache,
            getMemoryCollection      : StorageRouter.getMemoryCollection,
            getSummaryCollection     : StorageRouter.getSummaryCollection,
            getDatabaseStatus        : ChromaLifecycleService.getDatabaseStatus
        };

        ChromaManager.connected = true;
        ChromaManager.ready     = async () => {};
        ChromaManager.connect   = async () => {
            ChromaManager.connected = true;
            return true;
        };

        StorageRouter.getMemoryCollection = async () => memoryCollection;
        StorageRouter.getSummaryCollection = async () => {
            summaryGetCalls++;
            return summaryGetCalls === summaryUnavailableOnCall ? null : summaryCollection
        };

        ChromaLifecycleService.getDatabaseStatus = () => ({running: true});
        TextEmbeddingService.embedText            = async () => new Array(4096).fill(0.1);
        process.env.GEMINI_API_KEY               = 'unit-test-key';

        HealthService.setStdioIdentityState(null);
        HealthService.runtimeFreshnessReader = null;
        HealthService.clearStartupDependencyState();
        HealthService.clearCache();
    });

    test.afterEach(() => {
        Date.now = originalDateNow;

        if (originalGeminiApiKey === undefined) {
            delete process.env.GEMINI_API_KEY;
        } else {
            process.env.GEMINI_API_KEY = originalGeminiApiKey;
        }

        ChromaManager.connected = originals.chromaConnected;
        ChromaManager.ready     = originals.chromaReady;
        ChromaManager.connect   = originals.chromaConnect;
        ChromaManager.invalidateCollectionCache = originals.invalidateCollectionCache;
        StorageRouter.getMemoryCollection      = originals.getMemoryCollection;
        StorageRouter.getSummaryCollection     = originals.getSummaryCollection;
        ChromaLifecycleService.getDatabaseStatus = originals.getDatabaseStatus;
        TextEmbeddingService.embedText            = originalEmbedText;

        HealthService.setStdioIdentityState(null);
        HealthService.runtimeFreshnessReader = null;
        HealthService.clearStartupDependencyState();
        HealthService.clearCache();
    });

    test('direct healthcheck refreshes cached timestamp and collection counts without mutating the cache', async () => {
        const cached = await HealthService.healthcheck();

        expect(cached.status, JSON.stringify({
            details  : cached.details,
            startup  : cached.startup,
            identity : cached.identity,
            providers: cached.providers
        }, null, 2)).toBe('healthy');
        expect(cached.database.connection.collections.memories.count).toBe(10);
        expect(cached.database.connection.collections.summaries.count).toBe(20);

        memoryCount  = 11;
        summaryCount = 21;

        const requestNow = originalDateNow() + 60_000;
        Date.now = () => requestNow;

        const fresh = await HealthService.healthcheck();

        expect(fresh.timestamp).toBe(new Date(requestNow).toISOString());
        expect(fresh.database.connection.collections.memories).toMatchObject({exists: true, count: 11});
        expect(fresh.database.connection.collections.summaries).toMatchObject({exists: true, count: 21});

        expect(fresh).not.toBe(cached);
        expect(fresh.database).not.toBe(cached.database);
        expect(fresh.database.connection).not.toBe(cached.database.connection);
        expect(cached.database.connection.collections.memories.count).toBe(10);
        expect(cached.database.connection.collections.summaries.count).toBe(20);

        const ensureHealthyFastPath = await HealthService.healthcheck({freshObservability: false});
        expect(ensureHealthyFastPath).toBe(cached);
        expect(ensureHealthyFastPath.database.connection.collections.memories.count).toBe(10);
    });

    test('direct healthcheck refreshes runtime freshness while reusing cached dependency status', async () => {
        let currentConfigDigest = 'sha256:boot-config';
        HealthService.runtimeFreshnessReader = async () => ({
            boot: {
                gitHead      : 'abc123',
                configDigest : 'sha256:boot-config',
                openApiDigest: 'sha256:same-openapi'
            },
            current: {
                gitHead      : 'abc123',
                configDigest : currentConfigDigest,
                openApiDigest: 'sha256:same-openapi'
            }
        });

        const cached = await HealthService.healthcheck();

        expect(cached.status, JSON.stringify({
            details  : cached.details,
            startup  : cached.startup,
            identity : cached.identity,
            providers: cached.providers
        }, null, 2)).toBe('healthy');
        expect(cached.runtimeFreshness.status).toBe('current');

        currentConfigDigest = 'sha256:migrated-config';
        Date.now = () => originalDateNow() + 60_000;

        const fresh = await HealthService.healthcheck();

        expect(fresh.status).toBe('healthy');
        expect(fresh.runtimeFreshness).toMatchObject({
            status: 'stale',
            stale : {
                configDigest : true,
                openApiDigest: false
            }
        });
        expect(fresh.runtimeFreshness.hint).toContain('Memory Core MCP server');
        expect(fresh.database.connection.collections.memories.count).toBe(10);
    });

    test('direct healthcheck reuses a recent healthy embedding write canary', async () => {
        let embedCalls = 0;
        TextEmbeddingService.embedText = async () => {
            embedCalls++;
            return new Array(4096).fill(0.1);
        };

        const firstNow = originalDateNow();
        Date.now = () => firstNow;

        const cached = await HealthService.healthcheck();

        expect(cached.status).toBe('healthy');
        expect(embedCalls).toBe(1);

        memoryCount  = 11;
        summaryCount = 21;
        Date.now = () => firstNow + 30_000;

        const fresh = await HealthService.healthcheck();

        expect(fresh.status).toBe('healthy');
        expect(fresh.database.connection.collections.memories.count).toBe(11);
        // The verbose writeCanary sub-object is trimmed from the lean payload; a healthy probe
        // leaves status healthy and re-uses the cached canary result (no second embed call).
        expect(fresh.providers.embedding).not.toHaveProperty('writeCanary');
        expect(embedCalls).toBe(1);
    });

    test('expired embedding write canary cache probes again and degrades on failure', async () => {
        let embedCalls = 0;
        TextEmbeddingService.embedText = async () => {
            embedCalls++;
            if (embedCalls === 1) {
                return new Array(4096).fill(0.1);
            }
            throw new Error('embedding provider busy');
        };

        const firstNow = originalDateNow();
        Date.now = () => firstNow;

        const cached = await HealthService.healthcheck();

        expect(cached.status).toBe('healthy');
        expect(embedCalls).toBe(1);

        Date.now = () => firstNow + 61_000;

        const refreshed = await HealthService.healthcheck();

        expect(embedCalls).toBe(2);
        expect(refreshed.status).toBe('degraded');
        // Degradation DETECTION survives the trim via status + details; the verbose writeCanary
        // sub-object no longer ships in the payload.
        expect(refreshed.providers.embedding).not.toHaveProperty('writeCanary');
        expect(refreshed.details).toContain('Embedding write canary failed: embedding provider busy');
        expect(refreshed.details).not.toContain('All features are operational');
    });

    test('healthcheck degrades env-pinned unbound identity warning', async () => {
        HealthService.setStdioIdentityState({
            userId             : 'neo-opus-grace',
            agentIdentityNodeId: null,
            source             : 'env-var'
        });

        const result = await HealthService.healthcheck();

        expect(result.status).toBe('degraded');
        expect(result.identity).toMatchObject({
            source: 'env-var',
            bound : false,
            nodeId: null
        });
        expect(result.identity.warning).toContain("NEO_AGENT_IDENTITY is pinned to 'neo-opus-grace'");
        expect(result.details).toContain(`WARN: ${result.identity.warning}`);
        expect(result.details).not.toContain('All features are operational');
    });

    test('unhealthy cached-refresh shape clears cache and falls through to a full healthcheck', async () => {
        const cached = await HealthService.healthcheck();

        expect(cached.database.connection.collections.summaries.count).toBe(20);

        memoryCount  = 12;
        summaryCount = 22;
        summaryUnavailableOnCall = summaryGetCalls + 1;
        Date.now = () => originalDateNow() + 60_000;

        const refreshed = await HealthService.healthcheck();

        expect(refreshed.status).toBe('healthy');
        expect(refreshed).not.toBe(cached);
        expect(refreshed.database.connection.collections.memories.count).toBe(12);
        expect(refreshed.database.connection.collections.summaries.count).toBe(22);
    });

    test('#13466: memory count stale handle invalidates and retries once', async () => {
        let   memoryReads = 0;
        const invalidated = [];

        ChromaManager.invalidateCollectionCache = type => invalidated.push(type);
        StorageRouter.getMemoryCollection = async () => {
            memoryReads++;

            return {
                count: async () => {
                    if (memoryReads === 1) {
                        throw createNotFoundError()
                    }

                    return 13
                },
                get: async () => ({ids: [], metadatas: []})
            }
        };

        const result = await HealthService.healthcheck();

        expect(memoryReads).toBe(2);
        expect(invalidated).toEqual(['memory']);
        expect(result.status).toBe('healthy');
        expect(result.database.connection.collections.memories).toMatchObject({
            exists: true,
            count : 13
        });
        expect(result.details).toContain('All features are operational');
    });

    test('#13466: summary count stale handle invalidates and retries once', async () => {
        let   summaryReads = 0;
        const invalidated  = [];

        ChromaManager.invalidateCollectionCache = type => invalidated.push(type);
        StorageRouter.getSummaryCollection = async () => {
            summaryReads++;

            return {
                count: async () => {
                    if (summaryReads === 1) {
                        throw createNotFoundError()
                    }

                    return 23
                },
                get: async () => ({ids: [], metadatas: []})
            }
        };

        const result = await HealthService.healthcheck();

        expect(summaryReads).toBe(2);
        expect(invalidated).toEqual(['summary']);
        expect(result.status).toBe('healthy');
        expect(result.database.connection.collections.summaries).toMatchObject({
            exists: true,
            count : 23
        });
        expect(result.details).toContain('All features are operational');
    });

    test('embedding write canary failure degrades healthcheck status', async () => {
        TextEmbeddingService.embedText = async () => {
            throw new Error('embedding provider busy');
        };

        const result = await HealthService.healthcheck();

        expect(result.status).toBe('degraded');
        // The lean payload omits the writeCanary sub-object; a failed probe still degrades the
        // probe via status + a details entry naming the failure.
        expect(result.providers.embedding).not.toHaveProperty('writeCanary');
        expect(result.details).toContain('Embedding write canary failed: embedding provider busy');
        expect(result.details).not.toContain('All features are operational');
    });

    test('#13458: embedding write canary timeout degrades healthcheck instead of hanging', async () => {
        TextEmbeddingService.embedText = async () => new Promise(() => {});

        const result = await HealthService.healthcheck({
            embeddingWriteCanaryTimeoutMs: 5
        });

        expect(result.status).toBe('degraded');
        expect(result.details).toContain('Embedding write canary failed: Embedding write canary timed out after 5ms');
        expect(result.details).not.toContain('All features are operational');
    });

    test('#13458: collection count timeout makes healthcheck resolve unhealthy instead of hanging', async () => {
        StorageRouter.getMemoryCollection = async () => ({
            count: async () => new Promise(() => {}),
            get  : async () => ({ids: [], metadatas: []})
        });

        const result = await HealthService.healthcheck({
            chromaProbeTimeoutMs: 5
        });

        expect(result.status).toBe('unhealthy');
        expect(result.database.connection.collections.memories).toMatchObject({
            exists: true,
            count : 0,
            error : 'memory collection count health probe timed out after 5ms'
        });
        expect(result.details).toContain('Failed to access collections: memory collection count health probe timed out after 5ms');
    });
});

/**
 * @summary Coverage for Chroma migration observability.
 *
 * The live regression was not just "missing userId"; restored session summaries also had
 * single-peer userIds while `participatingAgents` named another core swarm maintainer. This
 * pure projection pins both counters without requiring a live ChromaDB instance.
 *
 * @see Neo.ai.services.memory-core.HealthService#buildChromaMigrationStats
 */
test.describe('HealthService #11181 — buildChromaMigrationStats', () => {
    let buildChromaMigrationStats;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/HealthService.mjs');
        buildChromaMigrationStats = mod.buildChromaMigrationStats;
    });

    test('memory metadata counts missing userId as migration debt', () => {
        const result = buildChromaMigrationStats([
            {},
            {userId: ''},
            {userId: 'shared'},
            {userId: 'neo-gpt'}
        ]);

        expect(result.totalRecords).toBe(4);
        expect(result.missingUserId).toBe(2);
        expect(result.shared).toBe(1);
        expect(result.migrationDebt).toBe(2);
        expect(result.perUserId).toEqual({
            shared   : 1,
            'neo-gpt': 1
        });
    });

    test('summary metadata flags core-swarm participants not shared as visibility debt', () => {
        const result = buildChromaMigrationStats([
            {},
            {userId: 'neo-gemini-pro', participatingAgents: '@neo-gpt'},
            {userId: 'shared', participatingAgents: '@neo-opus-ada'},
            {userId: 'alice', participatingAgents: '@alice'},
            {userId: '', participatingAgents: '@neo-gemini-pro'}
        ], {summaryCollection: true});

        expect(result.totalRecords).toBe(5);
        expect(result.missingUserId).toBe(2);
        expect(result.shared).toBe(1);
        expect(result.coreSwarmParticipant).toBe(3);
        expect(result.coreSwarmParticipantHidden).toBe(2);
        expect(result.migrationDebt).toBe(3);
    });
});

/**
 * @summary Coverage for the embedding-provider observability block in the healthcheck payload.
 *
 * Pins the pure-projection contract of `buildEmbeddingProviderBlock` — the module-scope function
 * that extracts active embedding-provider state from `aiConfig` for the
 * healthcheck `providers.embedding` field. Integration correctness (live provider request) is
 * operator-territory L3 validation against a running local-model server; this spec covers the L1-L2
 * substrate shape that operators rely on to verify the provider configured matches the provider
 * actually selected at boot.
 *
 * @see Neo.ai.services.memory-core.HealthService#buildEmbeddingProviderBlock
 */
test.describe('HealthService #10723/#10773/#10804 — buildEmbeddingProviderBlock', () => {
    let buildEmbeddingProviderBlock;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/HealthService.mjs');
        buildEmbeddingProviderBlock = mod.buildEmbeddingProviderBlock;
    });

    test('openAiCompatible provider surfaces single provider block', () => {
        const cfg = {
            embeddingProvider: 'openAiCompatible',
            vectorDimension  : 4096,
            openAiCompatible : {
                host          : 'http://127.0.0.1:8000',
                embeddingModel: 'text-embedding-qwen3-embedding-1.5b'
            }
        };
        expect(buildEmbeddingProviderBlock(cfg)).toEqual({
            active    : 'openAiCompatible',
            host      : 'http://127.0.0.1:8000',
            model     : 'text-embedding-qwen3-embedding-1.5b',
            dimensions: 4096
        });
    });

    test('gemini provider surfaces cloud model + dimensions', () => {
        const cfg = {
            embeddingProvider: 'gemini',
            vectorDimension  : 3072,
            embeddingModel   : 'gemini-embedding-001'
        };
        expect(buildEmbeddingProviderBlock(cfg)).toEqual({
            active    : 'gemini',
            host      : null,
            model     : 'gemini-embedding-001',
            dimensions: 3072
        });
    });

    test('ollama provider surfaces host + embeddingModel + dimensions', () => {
        const cfg = {
            embeddingProvider: 'ollama',
            vectorDimension  : 4096,
            ollama           : {
                host          : 'http://127.0.0.1:11434',
                embeddingModel: 'qwen3-embedding'
            }
        };
        expect(buildEmbeddingProviderBlock(cfg)).toEqual({
            active    : 'ollama',
            host      : 'http://127.0.0.1:11434',
            model     : 'qwen3-embedding',
            dimensions: 4096
        });
    });

    test('unset embeddingProvider defaults provider to openAiCompatible', () => {
        const cfg = {
            vectorDimension : 4096,
            openAiCompatible: {
                host          : 'http://127.0.0.1:11434',
                embeddingModel: 'text-embedding-qwen3-embedding-8b'
            }
        };
        expect(buildEmbeddingProviderBlock(cfg)).toEqual({
            active    : 'openAiCompatible',
            host      : 'http://127.0.0.1:11434',
            model     : 'text-embedding-qwen3-embedding-8b',
            dimensions: 4096
        });
    });

    test('unrecognized provider surfaces scoped error field, does not throw', () => {
        const cfg = {
            embeddingProvider: 'fooProvider',
            vectorDimension  : 4096
        };
        const result = buildEmbeddingProviderBlock(cfg);
        expect(result.active).toBe('fooProvider');
        expect(result.host).toBeNull();
        expect(result.model).toBeNull();
        expect(result.dimensions).toBe(4096);
        expect(result.error).toMatch(/Unrecognized embeddingProvider/);
    });

    test('openAiCompatible without nested config surfaces null host + null model + dimensions', () => {
        const cfg = {
            embeddingProvider: 'openAiCompatible',
            vectorDimension  : 4096
            // openAiCompatible config block deliberately absent — defensive against incomplete config
        };
        expect(buildEmbeddingProviderBlock(cfg)).toEqual({
            active    : 'openAiCompatible',
            host      : null,
            model     : null,
            dimensions: 4096
        });
    });

    test('dimensions fields always reflect vectorDimension regardless of provider', () => {
        for (const provider of ['gemini', 'openAiCompatible', 'ollama', 'unrecognized']) {
            const cfg    = {embeddingProvider: provider, vectorDimension: 768};
            const result = buildEmbeddingProviderBlock(cfg);
            expect(result.dimensions).toBe(768);
        }
    });
});

/**
 * @summary Coverage for the embedding write canary in the healthcheck payload.
 *
 * The provider block reports configured routing; the write canary probes the write-side
 * embedding call that `add_memory` needs before it can insert into ChromaDB.
 *
 * @see Neo.ai.services.memory-core.HealthService#buildEmbeddingWriteCanaryBlock
 */
test.describe('HealthService #12487 — buildEmbeddingWriteCanaryBlock', () => {
    let buildEmbeddingWriteCanaryBlock;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/HealthService.mjs');
        buildEmbeddingWriteCanaryBlock = mod.buildEmbeddingWriteCanaryBlock;
    });

    test('reports healthy when the active provider returns a vector', async () => {
        let   nowCalls = 0;
        const result   = await buildEmbeddingWriteCanaryBlock({
            cfg: {
                embeddingProvider: 'openAiCompatible',
                vectorDimension  : 3
            },
            embedText: async (input, provider) => {
                expect(input).toBe('neo-healthcheck-embedding-write-canary');
                expect(provider).toBe('openAiCompatible');
                return [0.1, 0.2, 0.3];
            },
            now: () => nowCalls++ ? 125 : 100
        });

        expect(result).toEqual({
            status            : 'healthy',
            provider          : 'openAiCompatible',
            dimensions        : 3,
            expectedDimensions: 3,
            durationMs        : 25
        });
    });

    test('reports failed when the active provider throws', async () => {
        const result = await buildEmbeddingWriteCanaryBlock({
            cfg: {
                embeddingProvider: 'openAiCompatible',
                vectorDimension  : 4096
            },
            embedText: async () => {
                throw new Error('embedding provider busy');
            },
            now: () => 100
        });

        expect(result).toMatchObject({
            status            : 'failed',
            provider          : 'openAiCompatible',
            dimensions        : null,
            expectedDimensions: 4096,
            durationMs        : 0,
            error             : 'embedding provider busy'
        });
    });

    test('#13458: reports failed when the active provider never resolves', async () => {
        const result = await buildEmbeddingWriteCanaryBlock({
            cfg: {
                embeddingProvider: 'openAiCompatible',
                vectorDimension  : 4096
            },
            embedText: async () => new Promise(() => {}),
            now      : () => 100,
            timeoutMs: 5
        });

        expect(result).toMatchObject({
            status            : 'failed',
            provider          : 'openAiCompatible',
            dimensions        : null,
            expectedDimensions: 4096,
            durationMs        : 0,
            error             : 'Embedding write canary timed out after 5ms'
        });
    });

    test('reports failed when the provider returns no vector', async () => {
        const result = await buildEmbeddingWriteCanaryBlock({
            cfg: {
                embeddingProvider: 'ollama',
                vectorDimension  : 4096
            },
            embedText: async () => [],
            now      : () => 100
        });

        expect(result).toMatchObject({
            status            : 'failed',
            provider          : 'ollama',
            dimensions        : 0,
            expectedDimensions: 4096,
            error             : 'Embedding write canary returned no vector.'
        });
    });

    test('reports failed when the provider returns a wrong-sized vector', async () => {
        const result = await buildEmbeddingWriteCanaryBlock({
            cfg: {
                embeddingProvider: 'openAiCompatible',
                vectorDimension  : 4096
            },
            embedText: async () => [0.1, 0.2, 0.3],
            now      : () => 100
        });

        expect(result).toMatchObject({
            status            : 'failed',
            provider          : 'openAiCompatible',
            dimensions        : 3,
            expectedDimensions: 4096,
            error             : 'Embedding write canary returned 3 dimensions; expected 4096.'
        });
    });
});

/**
 * @summary Coverage for the source-default embedding provider resolver.
 *
 * The default must be coherent with the unified 4096-dimension Chroma substrate even when
 * standalone scripts run without `NEO_EMBEDDING_PROVIDER`.
 *
 * @see Neo.ai.services.memory-core.helpers.EmbeddingProviderConfig#resolveEmbeddingProvider
 */
test.describe('EmbeddingProviderConfig #11596 — resolveEmbeddingProvider', () => {
    let resolveEmbeddingProvider;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/helpers/embeddingProviderConfig.mjs');
        resolveEmbeddingProvider = mod.resolveEmbeddingProvider;
    });

    test('defaults to openAiCompatible when config and env are unset', () => {
        expect(resolveEmbeddingProvider({config: {}, env: {}})).toBe('openAiCompatible');
    });
});

/**
 * @summary Coverage for the summary-provider observability block in the healthcheck payload.
 *
 * Mirrors the sibling `providers.embedding` block: the end-to-end healthcheck depends on
 * live Memory Core services, while the load-bearing contract for operators is the pure projection of
 * active summary-provider config into a secret-free `providers.summary` shape.
 *
 * @see Neo.ai.services.memory-core.HealthService#buildSummaryProviderBlock
 */
test.describe('HealthService #10724 — buildSummaryProviderBlock', () => {
    let buildProviderPrerequisiteBlock, buildSummaryProviderBlock;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/HealthService.mjs');
        buildProviderPrerequisiteBlock = mod.buildProviderPrerequisiteBlock;
        buildSummaryProviderBlock = mod.buildSummaryProviderBlock;
    });

    test('openAiCompatible config surfaces the lean local-route shape without leaking API key value', () => {
        const result = buildSummaryProviderBlock({
            modelProvider   : 'openAiCompatible',
            openAiCompatible: {
                host  : 'http://127.0.0.1:11434',
                model : 'qwen3-8b',
                apiKey: 'secret-value'
            }
        });

        expect(result).toEqual({
            active: 'openAiCompatible',
            host  : 'http://127.0.0.1:11434',
            model : 'qwen3-8b',
            local : true
        });
        // The lean probe drops the verbose credential/endpoint sub-details; the API key value
        // must never surface regardless.
        expect(JSON.stringify(result)).not.toContain('secret-value');
    });

    test('gemini config surfaces the lean cloud-route shape', () => {
        const result = buildSummaryProviderBlock({
            modelProvider: 'gemini',
            modelName    : 'gemini-2.5-flash'
        });

        expect(result).toEqual({
            active: 'gemini',
            host  : null,
            model : 'gemini-2.5-flash',
            local : false
        });
    });

    test('#13300: missing summary provider defaults to local openAiCompatible, not Gemini', () => {
        const result = buildSummaryProviderBlock({
            openAiCompatible: {
                host : 'http://localhost:1234',
                model: 'local-summary'
            }
        });

        expect(result).toEqual({
            active: 'openAiCompatible',
            host  : 'http://localhost:1234',
            model : 'local-summary',
            local : true
        });
    });

    test('#13300: local summary and embedding providers do not require GEMINI_API_KEY', () => {
        const result = buildProviderPrerequisiteBlock({
            engine           : 'chroma',
            modelProvider    : 'openAiCompatible',
            embeddingProvider: 'openAiCompatible'
        }, {});

        expect(result).toEqual({
            ready  : true,
            summary: {
                provider: 'openAiCompatible',
                ready   : true
            },
            embedding: {
                provider: 'openAiCompatible',
                ready   : true
            },
            details: []
        });
        expect(JSON.stringify(result)).not.toContain('GEMINI_API_KEY');
    });

    test('#13300: Gemini summary provider gets a summary-specific missing-key diagnostic', () => {
        const result = buildProviderPrerequisiteBlock({
            engine           : 'chroma',
            modelProvider    : 'gemini',
            embeddingProvider: 'openAiCompatible'
        }, {});

        expect(result.ready).toBe(false);
        expect(result.summary.ready).toBe(false);
        expect(result.embedding.ready).toBe(true);
        expect(result.details).toEqual([
            "Summary provider 'gemini' requires GEMINI_API_KEY - summarization features unavailable"
        ]);
    });

    test('#13300: Gemini embedding provider gets an embedding-specific missing-key diagnostic', () => {
        const result = buildProviderPrerequisiteBlock({
            engine           : 'chroma',
            modelProvider    : 'openAiCompatible',
            embeddingProvider: 'gemini'
        }, {});

        expect(result.ready).toBe(false);
        expect(result.summary.ready).toBe(true);
        expect(result.embedding.ready).toBe(false);
        expect(result.details).toEqual([
            "Embedding provider 'gemini' requires GEMINI_API_KEY - semantic memory features unavailable"
        ]);
    });
});

/**
 * @summary Coverage for the backup observability block in the healthcheck payload.
 *
 * Pins the pure-projection contract of `buildBackupStateBlock`. It relies on an injected `fs`
 * and `path` mock to avoid touching the real filesystem during the unit test, ensuring fast
 * and isolated validation of the exact `completedAt` semantic requirement.
 *
 * @see Neo.ai.services.memory-core.HealthService#buildBackupStateBlock
 */
test.describe('HealthService #10844 — buildBackupStateBlock', () => {
    let buildBackupStateBlock;

    const mockPath = {
        join: (...args) => args.join('/')
    };

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/HealthService.mjs');
        buildBackupStateBlock = mod.buildBackupStateBlock;
    });

    test('returns null if backupPath does not exist', async () => {
        const mockFs = { pathExists: async () => false };
        const result = await buildBackupStateBlock('/fake/path', mockFs, mockPath);
        expect(result).toEqual({ lastSuccessful: null, count: 0 });
    });

    test('returns null if no backup directories exist', async () => {
        const mockFs = {
            pathExists: async () => true,
            readdir   : async () => [
                { isDirectory: () => false, name: 'backup-2023' },
                { isDirectory: () => true, name: 'other-dir' }
            ]
        };
        const result = await buildBackupStateBlock('/fake/path', mockFs, mockPath);
        expect(result).toEqual({ lastSuccessful: null, count: 0 });
    });

    test('returns timestamp of most recent backup with completedAt marker', async () => {
        const mockFs = {
            pathExists: async (p) => {
                if (p === '/fake/path') return true;
                if (p.endsWith('bundle-meta.json')) return true;
                return false;
            },
            readdir: async () => [
                { isDirectory: () => true, name: 'backup-2023-10-01T12-00-00' },
                { isDirectory: () => true, name: 'backup-2023-10-02T12-00-00' },
                { isDirectory: () => true, name: 'backup-2023-10-03T12-00-00' }
            ],
            readJson: async (p) => {
                // The newest backup failed (no completedAt)
                if (p.includes('backup-2023-10-03')) return { timestamp: '2023-10-03T12:00:00Z' };
                // The middle backup succeeded
                if (p.includes('backup-2023-10-02')) return { timestamp: '2023-10-02T12:00:00Z', completedAt: '2023-10-02T12:05:00Z' };
                // The oldest backup succeeded
                if (p.includes('backup-2023-10-01')) return { timestamp: '2023-10-01T12:00:00Z', completedAt: '2023-10-01T12:05:00Z' };
                throw new Error('Not found');
            }
        };

        const result = await buildBackupStateBlock('/fake/path', mockFs, mockPath);
        expect(result).toEqual({ lastSuccessful: '2023-10-02T12:00:00Z', count: 3 });
    });

    test('returns null if all backups lack completedAt marker', async () => {
        const mockFs = {
            pathExists: async (p) => {
                if (p === '/fake/path') return true;
                if (p.endsWith('bundle-meta.json')) return true;
                return false;
            },
            readdir: async () => [
                { isDirectory: () => true, name: 'backup-2023-10-01T12-00-00' }
            ],
            readJson: async () => ({ timestamp: '2023-10-01T12:00:00Z' }) // No completedAt
        };

        const result = await buildBackupStateBlock('/fake/path', mockFs, mockPath);
        expect(result).toEqual({ lastSuccessful: null, count: 1 });
    });
});

/**
 * @summary Coverage for the wake-substrate observability block.
 *
 * The block has two independent file-I/O paths (gate-state via wakeSafetyGate + liveness
 * via direct fs.stat). Tests cover the cross-product of (gate-file: enabled / disabled / tripped /
 * missing / malformed) × (liveness-file: fresh / stalled / missing) per AC5, plus the fully-degraded
 * defensive case.
 *
 * Test isolation: each test writes to a unique temp directory, points `WAKE_GATE_FILE_PATH`
 * at that fixture, and applies `NEO_HEARTBEAT_ALIVE_PATH` through the AiConfig env-override seam.
 *
 * @see Neo.ai.services.memory-core.HealthService#buildWakeFeaturesBlock
 */
test.describe('HealthService #10783 — buildWakeFeaturesBlock', () => {
    let buildWakeFeaturesBlock;
    let heartbeatAlivePath;
    let originalHeartbeatAlivePath;
    let tmpDir;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/HealthService.mjs');
        buildWakeFeaturesBlock = mod.buildWakeFeaturesBlock;
        heartbeatAlivePath     = mod.heartbeatAlivePath;
        originalHeartbeatAlivePath = AiConfig.wakeDaemonHeartbeatAlivePath;

        const os   = await import('os');
        const path = await import('path');
        const fs   = await import('fs/promises');

        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wake-features-spec-'));
    });

    test.afterAll(async () => {
        const fs = await import('fs/promises');
        if (tmpDir) {
            await fs.rm(tmpDir, {recursive: true, force: true}).catch(() => {});
        }
    });

    test.beforeEach(async () => {
        const path = await import('path');
        const fs   = await import('fs/promises');

        process.env.WAKE_GATE_FILE_PATH      = path.join(tmpDir, `gate-${Date.now()}.json`);
        process.env.NEO_HEARTBEAT_ALIVE_PATH = path.join(tmpDir, `alive-${Date.now()}`);
        AiConfig.setEnvOverride('NEO_HEARTBEAT_ALIVE_PATH', process.env.NEO_HEARTBEAT_ALIVE_PATH);

        // Ensure clean slate between tests (no carryover from prior writes)
        await fs.rm(process.env.WAKE_GATE_FILE_PATH,      {force: true}).catch(() => {});
        await fs.rm(process.env.NEO_HEARTBEAT_ALIVE_PATH, {force: true}).catch(() => {});
    });

    test.afterEach(() => {
        delete process.env.WAKE_GATE_FILE_PATH;
        delete process.env.NEO_HEARTBEAT_ALIVE_PATH;
        AiConfig.setEnvOverride('NEO_HEARTBEAT_ALIVE_PATH', originalHeartbeatAlivePath);
    });

    test('heartbeatAlivePath() reads the resolved AiConfig leaf (#12438)', async () => {
        const path         = await import('path');
        const overridePath = path.join(tmpDir, `alive-helper-${Date.now()}`);

        AiConfig.setEnvOverride('NEO_HEARTBEAT_ALIVE_PATH', overridePath);

        expect(heartbeatAlivePath()).toBe(AiConfig.wakeDaemonHeartbeatAlivePath);
        expect(heartbeatAlivePath()).toBe(overridePath);
    });

    test('gate enabled + liveness fresh → daemonRunning true, gateState enabled', async () => {
        const fs = await import('fs/promises');

        await fs.writeFile(process.env.WAKE_GATE_FILE_PATH, JSON.stringify({
            state: 'enabled', reason: '', trippedAt: null, trippedBy: null
        }));
        await fs.writeFile(process.env.NEO_HEARTBEAT_ALIVE_PATH, '');

        const result = await buildWakeFeaturesBlock();

        expect(result.gateState).toBe('enabled');
        expect(result.daemonRunning).toBe(true);
        expect(result.lastPulseAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(result.secondsSinceLastPulse).toBeGreaterThanOrEqual(0);
    });

    test('gate disabled + liveness fresh → daemonRunning true, gateState disabled', async () => {
        const fs = await import('fs/promises');

        await fs.writeFile(process.env.WAKE_GATE_FILE_PATH, JSON.stringify({
            state: 'disabled', reason: 'maintenance pause', trippedAt: '2026-05-07T10:00:00.000Z', trippedBy: 'cli'
        }));
        await fs.writeFile(process.env.NEO_HEARTBEAT_ALIVE_PATH, '');

        const result = await buildWakeFeaturesBlock();

        expect(result.gateState).toBe('disabled');
        expect(result.gateTrippedBy).toBe('cli');
        expect(result.daemonRunning).toBe(true);
    });

    test('gate tripped + liveness fresh → daemonRunning true, gateState tripped, trip metadata surfaced', async () => {
        const fs = await import('fs/promises');

        await fs.writeFile(process.env.WAKE_GATE_FILE_PATH, JSON.stringify({
            state    : 'tripped',
            reason   : 'orphan-spawn detected at 22:53Z',
            trippedAt: '2026-05-03T22:53:09.450Z',
            trippedBy: 'wake-substrate-monitor'
        }));
        await fs.writeFile(process.env.NEO_HEARTBEAT_ALIVE_PATH, '');

        const result = await buildWakeFeaturesBlock();

        expect(result.gateState).toBe('tripped');
        expect(result.gateTrippedAt).toBe('2026-05-03T22:53:09.450Z');
        expect(result.gateTrippedBy).toBe('wake-substrate-monitor');
    });

    test('gate file missing → gateState unknown (NOT default-tripped)', async () => {
        // Critical observability semantic: healthcheck distinguishes "no gate file present"
        // from "operator-tripped". The wakeSafetyGate enforcement-side default-tripped sentinel
        // is mapped to 'unknown' here so operators see the actual gap, not a misleading
        // tripped state with a suspect reason.
        const fs = await import('fs/promises');

        // No gate file write — leave path absent
        await fs.writeFile(process.env.NEO_HEARTBEAT_ALIVE_PATH, '');

        const result = await buildWakeFeaturesBlock();

        expect(result.gateState).toBe('unknown');
        expect(result.gateTrippedAt).toBeNull();
        expect(result.gateTrippedBy).toBeNull();
    });

    test('gate file malformed → gateState unknown (defensive)', async () => {
        // wakeSafetyGate.readGateState returns trippedBy='malformed-state-file' for this case.
        // Healthcheck observability surfaces it as 'unknown' too — operator sees the gap, not
        // a fake-tripped state derived from corrupt input.
        const fs = await import('fs/promises');

        // Two malformed-JSON paths in wakeSafetyGate.readGateState:
        //   (a) JSON-parse throws       → catch block → trippedBy='read-error'
        //   (b) JSON-parse succeeds but shape lacks `state: string` → trippedBy='malformed-state-file'
        // We test (b) here — valid JSON with wrong shape — to exercise the explicit malformed branch.
        // Per current contract, my block surfaces tripped/malformed-state-file (not unknown)
        // because trippedBy !== 'default-on-missing-file'. Intentional: operator sees the data
        // corruption signal explicitly rather than swallowed-as-unknown.
        await fs.writeFile(process.env.WAKE_GATE_FILE_PATH, JSON.stringify({foo: 'bar'}));
        await fs.writeFile(process.env.NEO_HEARTBEAT_ALIVE_PATH, '');

        const result = await buildWakeFeaturesBlock();

        expect(result.gateState).toBe('tripped');
        expect(result.gateTrippedBy).toBe('malformed-state-file');
    });

    test('liveness file missing → daemonRunning false, lastPulseAt null', async () => {
        const fs = await import('fs/promises');

        await fs.writeFile(process.env.WAKE_GATE_FILE_PATH, JSON.stringify({
            state: 'enabled', reason: '', trippedAt: null, trippedBy: null
        }));
        // No liveness file write — leave path absent

        const result = await buildWakeFeaturesBlock();

        expect(result.gateState).toBe('enabled');
        expect(result.daemonRunning).toBe(false);
        expect(result.lastPulseAt).toBeNull();
        expect(result.secondsSinceLastPulse).toBeNull();
    });

    test('liveness file stalled (mtime > 10min) → daemonRunning false, lastPulseAt populated', async () => {
        const fs = await import('fs/promises');

        await fs.writeFile(process.env.WAKE_GATE_FILE_PATH, JSON.stringify({
            state: 'enabled', reason: '', trippedAt: null, trippedBy: null
        }));
        await fs.writeFile(process.env.NEO_HEARTBEAT_ALIVE_PATH, '');

        // Backdate mtime to 11 minutes ago (past the 10min stale threshold)
        const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000);
        await fs.utimes(process.env.NEO_HEARTBEAT_ALIVE_PATH, elevenMinutesAgo, elevenMinutesAgo);

        const result = await buildWakeFeaturesBlock();

        expect(result.daemonRunning).toBe(false);
        expect(result.lastPulseAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(result.secondsSinceLastPulse).toBeGreaterThan(600);
    });

    test('both files missing → fully defensive defaults, no throw', async () => {
        // Worst-case observability: brand new install, daemon never started, gate never written.
        // Block must not throw; surfaces all-defensive shape.
        const result = await buildWakeFeaturesBlock();

        expect(result).toEqual({
            gateState            : 'unknown',
            gateTrippedAt        : null,
            gateTrippedBy        : null,
            daemonRunning        : false,
            lastPulseAt          : null,
            secondsSinceLastPulse: null
        });
    });

    test('explicit `now` parameter overrides Date.now() for deterministic seconds-since calculation', async () => {
        const fs = await import('fs/promises');

        await fs.writeFile(process.env.NEO_HEARTBEAT_ALIVE_PATH, '');

        // Backdate liveness mtime to a known epoch second
        const livenessTime = new Date('2026-05-07T20:00:00.000Z');
        await fs.utimes(process.env.NEO_HEARTBEAT_ALIVE_PATH, livenessTime, livenessTime);

        // "Now" is exactly 5 seconds after the liveness mtime
        const fixedNow = livenessTime.getTime() + 5000;

        const result = await buildWakeFeaturesBlock(fixedNow);

        expect(result.lastPulseAt).toBe('2026-05-07T20:00:00.000Z');
        expect(result.secondsSinceLastPulse).toBe(5);
        expect(result.daemonRunning).toBe(true); // 5s < 10min stale threshold
    });

    test('POLL_INTERVAL env override widens stale threshold (#10931 AC4)', async () => {
        // Operator-side POLL_INTERVAL override (e.g., 15-min cadence) must propagate to the
        // observability stale threshold so a properly-running daemon at the new cadence is
        // still reported `daemonRunning: true`. Without this propagation, the hardcoded 10-min
        // threshold would falsely flag a 15-min-cadence daemon as stopped after ~11 min idle.
        const fs = await import('fs/promises');

        const originalPollInterval = process.env.POLL_INTERVAL;
        process.env.POLL_INTERVAL = '900'; // 15 min cadence → 30 min stale threshold (2×)

        try {
            await fs.writeFile(process.env.NEO_HEARTBEAT_ALIVE_PATH, '');

            // Backdate liveness mtime to 11 min ago — past the default 10-min hardcoded threshold,
            // but well within the 30-min POLL_INTERVAL=900 stale window.
            const elevenMinAgo = new Date(Date.now() - 11 * 60 * 1000);
            await fs.utimes(process.env.NEO_HEARTBEAT_ALIVE_PATH, elevenMinAgo, elevenMinAgo);

            const result = await buildWakeFeaturesBlock();

            expect(result.daemonRunning).toBe(true); // 11 min < 30 min stale threshold
            expect(result.secondsSinceLastPulse).toBeGreaterThan(600);
            expect(result.secondsSinceLastPulse).toBeLessThan(1800);
        } finally {
            if (originalPollInterval !== undefined) {
                process.env.POLL_INTERVAL = originalPollInterval;
            } else {
                delete process.env.POLL_INTERVAL;
            }
        }
    });
});

test.describe('HealthService — getTaskOutcome mutation boundary (#14492 review)', () => {
    let healthService;

    test.beforeAll(async () => {
        healthService = (await import('../../../../../../ai/services/memory-core/HealthService.mjs')).default;
    });

    test('getTaskOutcome returns a deep clone — mutating the result cannot corrupt the stored outcome', () => {
        healthService.recordTaskOutcome('mutation-boundary-probe', 'skipped', {
            reason    : 'r',
            reasonCode: 'heavy-maintenance-backpressure',
            nested    : {count: 1}
        });

        const first = healthService.getTaskOutcome('mutation-boundary-probe');
        expect(first.details.nested.count).toBe(1);

        // A careless / hostile caller mutates the returned object AND its nested details.
        first.status               = 'HACKED';
        first.details.reasonCode   = 'tampered';
        first.details.nested.count = 999;

        const second = healthService.getTaskOutcome('mutation-boundary-probe');
        expect(second.status).toBe('skipped');
        expect(second.details.reasonCode).toBe('heavy-maintenance-backpressure');
        expect(second.details.nested.count).toBe(1);
        // fresh clone each call — distinct object graphs, never the stored reference
        expect(second).not.toBe(first);
        expect(second.details).not.toBe(first.details);
    });
});
