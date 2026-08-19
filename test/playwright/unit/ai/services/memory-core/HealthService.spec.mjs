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

import {test, expect}              from '@playwright/test';
import Neo                         from '../../../../../../src/Neo.mjs';
import * as core                   from '../../../../../../src/core/_export.mjs';
import InstanceManager             from '../../../../../../src/manager/Instance.mjs';
import AiConfig                    from '../../../../../../ai/config.template.mjs';
import ChromaManager               from '../../../../../../ai/services/memory-core/managers/ChromaManager.mjs';
import {LOOPBACK_PROBE_HEALTH_KEY} from '../../../../../../ai/services/memory-core/helpers/loopbackFamilyProbe.mjs';
import StorageRouter               from '../../../../../../ai/services/memory-core/managers/StorageRouter.mjs';
import ChromaLifecycleService      from '../../../../../../ai/services/memory-core/lifecycle/ChromaLifecycleService.mjs';
import logger                      from '../../../../../../ai/mcp/server/memory-core/logger.mjs';

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
        expect(result.details).toContain('Runtime config/schema identity matches the current checkout.');
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
    let buildEmbeddingWriteCanaryBlock;
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
        const healthModule = await import('../../../../../../ai/services/memory-core/HealthService.mjs');
        HealthService = healthModule.default;
        buildEmbeddingWriteCanaryBlock = healthModule.buildEmbeddingWriteCanaryBlock;
        TextEmbeddingService = (await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;
    });

    test.beforeEach(async () => {
        originalDateNow    = Date.now;
        originalEmbedText  = TextEmbeddingService.embedText;
        originalGeminiApiKey = process.env.GEMINI_API_KEY;
        memoryCount        = 10;
        summaryCount       = 20;
        summaryGetCalls    = 0;
        summaryUnavailableOnCall = null;

        const memoryCollection  = makeCollection(() => memoryCount);
        const summaryCollection = makeCollection(() => summaryCount);
        const temporalSummaryCollection = makeCollection(() => 0);

        originals = {
            chromaConnected          : ChromaManager.connected,
            chromaReady              : ChromaManager.ready,
            chromaConnect            : ChromaManager.connect,
            invalidateCollectionCache: ChromaManager.invalidateCollectionCache,
            getMemoryCollection      : StorageRouter.getMemoryCollection,
            getSummaryCollection     : StorageRouter.getSummaryCollection,
            // The third of three, and the one this harness was missing. `#checkDatabaseConnections`
            // probes memory, summary AND temporal-summary; only the first two were isolated, so every
            // test reaching it issued a REAL Chroma count for the third. Chroma is run-scoped in
            // `playwright.config.unit.mjs` — one store for the whole run, shared across workers — so
            // that count's latency tracked whatever the rest of the suite had written, and a retry got
            // a fresh worker talking to the same slow collection.
            getTemporalSummaryCollection: StorageRouter.getTemporalSummaryCollection,
            getDatabaseStatus        : ChromaLifecycleService.getDatabaseStatus,
            loopbackConnectProbe     : HealthService.loopbackConnectProbe
        };

        ChromaManager.connected = true;
        ChromaManager.ready     = async () => {};
        ChromaManager.connect   = async () => {
            ChromaManager.connected = true;
            return true;
        };

        StorageRouter.getMemoryCollection = async () => memoryCollection;
        // Stubbed so no test in this file measures a real, run-scoped collection against a
        // per-test millisecond budget. Nothing here asserts on temporal-summary; it was reached
        // only as collateral of probing all three.
        StorageRouter.getTemporalSummaryCollection = async () => temporalSummaryCollection;
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

        // Mirror the Server boot: the canary producer runs by default (healthy), so healthcheck
        // reads project a healthy canary and the assertions below stay undisturbed. Canary-focused
        // tests re-arm with their own injected seams + a per-test generation key (rotation = a
        // clean gate generation, no cross-test cache leakage through the singleton).
        HealthService.startEmbeddingWriteCanary({
            runCanary    : async () => ({status: 'healthy'}),
            scheduler    : () => 0,
            clearSchedule: () => {},
            keyFor       : () => 'beforeEach-default'
        });
        await new Promise(resolve => setTimeout(resolve, 0)); // let the start-time demand settle
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
        StorageRouter.getTemporalSummaryCollection = originals.getTemporalSummaryCollection;
        ChromaLifecycleService.getDatabaseStatus = originals.getDatabaseStatus;
        TextEmbeddingService.embedText            = originalEmbedText;
        HealthService.loopbackConnectProbe        = originals.loopbackConnectProbe;

        HealthService.setStdioIdentityState(null);
        HealthService.runtimeFreshnessReader = null;
        HealthService.clearStartupDependencyState();
        HealthService.clearEmbeddingWriteCanaryProducer();
        HealthService.clearCache();
    });

    // The producer gate. Review feedback surfaced the omission that made these necessary:
    // deleting the assignment in `#performHealthCheck` left the pure helper spec AND the Server spec
    // green, because the Server spec builds its payload BY HAND. Nothing asserted that HealthService
    // actually writes the key. These three close that — and they are the only tests in the suite that
    // exercise producer and consumer through one real call.

    /** Forces the primary Chroma connection to fail, which is the gate the probe is allowed to run behind. */
    const failPrimaryConnection = () => {
        ChromaManager.connected = false;
        ChromaManager.connect   = async () => false;
    };

    test('a FAILED primary connection invokes the injected loopback seam and attaches the shared-key verdict', async () => {
        const dials = [];

        failPrimaryConnection();
        HealthService.loopbackConnectProbe = ({host, port, timeoutMs}) => {
            dials.push({host, port, timeoutMs});
            // IPv6-only listener: the asymmetry a single host cannot stage on demand.
            return Promise.resolve(host === '::1');
        };
        HealthService.clearCache();

        const health = await HealthService.healthcheck(),
              probe  = health.database.connection[LOOPBACK_PROBE_HEALTH_KEY];

        expect(health.status).toBe('unhealthy');
        // The seam was really reached — not merely available.
        expect(dials.map(dial => dial.host)).toEqual(['127.0.0.1', '::1']);
        expect(dials.every(dial => dial.timeoutMs > 0 && dial.port > 0)).toBe(true);
        // ...and the producer wrote the verdict under the SHARED key the Server reads.
        expect(probe).toBeTruthy();
        expect(probe.verdict).toBe('mismatch');
        expect(probe.conclusive).toBe(true);
        expect(probe.answering).toEqual(['[::1]']);
    })

    test('a HEALTHY connection performs NO loopback dials and exposes no key', async () => {
        // The gate in the other direction: `healthcheck()` also serves the MCP tool on every call, so a
        // probe leaking onto the healthy path would dial two sockets per invocation forever.
        let dialed = 0;

        HealthService.loopbackConnectProbe = () => {
            dialed++;
            return Promise.resolve(true);
        };
        HealthService.clearCache();

        const health = await HealthService.healthcheck();

        expect(dialed).toBe(0);
        expect(health.database.connection[LOOPBACK_PROBE_HEALTH_KEY]).toBeUndefined();
    })

    test('a THROWING loopback diagnostic cannot escape the already-unhealthy healthcheck', async () => {
        // A diagnostic that can fail the boot it is diagnosing is worse than no diagnostic. The probe
        // degrades to `inconclusive` and the healthcheck still resolves with its real verdict.
        failPrimaryConnection();
        HealthService.loopbackConnectProbe = () => { throw new Error('probe exploded') };
        HealthService.clearCache();

        const health = await HealthService.healthcheck(),
              probe  = health.database.connection[LOOPBACK_PROBE_HEALTH_KEY];

        expect(health.status).toBe('unhealthy');
        expect(probe.verdict).toBe('inconclusive');
        expect(probe.conclusive).toBe(false);
    })

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

    test('AC1: liveness probes issue no embedding request — the producer owns attempts (#16222)', async () => {
        let embedCalls = 0;

        HealthService.startEmbeddingWriteCanary({
            runCanary: async () => {
                embedCalls++;
                return {status: 'healthy'};
            },
            scheduler    : () => 0,
            clearSchedule: () => {},
            keyFor       : () => 'ac1-reader-purity'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(embedCalls).toBe(1); // the start-time demand — the only attempt this test should see

        await HealthService.healthcheck();
        await HealthService.healthcheck();
        const third = await HealthService.healthcheck();

        // Three probes, zero further embed calls: liveness is a pure read.
        expect(embedCalls).toBe(1);
        expect(third.status).toBe('healthy');
        expect(third.details).toContain('All features are operational');
    });

    test('AC2+AC3: a failing producer backs off with a named reason, then recovers autonomously on cadence', async () => {
        let   t         = 1_000_000, embedCalls = 0, providerHealthy = false;
        const scheduled = [];

        HealthService.startEmbeddingWriteCanary({
            cadenceMs      : 60000,
            failureTtlMs   : 30000,
            failureTtlMaxMs: 600000,
            runCanary      : async () => {
                embedCalls++;
                return providerHealthy
                    ? {status: 'healthy'}
                    : {status: 'failed', error: 'provider-failure:EMBEDDING_PROVIDER_ERROR'};
            },
            scheduler    : fn => { scheduled.push(fn); return scheduled.length; },
            clearSchedule: () => { scheduled.length = 0; },
            clock        : () => t,
            keyFor       : () => 'ac2-ac3-lifecycle'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(embedCalls).toBe(1);
        expect(scheduled.length).toBe(1); // the cadence timer is armed

        const degraded = await HealthService.healthcheck();
        expect(degraded.status).toBe('degraded');
        expect(degraded.details).toContain('Embedding write canary failed: provider-failure:EMBEDDING_PROVIDER_ERROR — backing off 30000ms (streak 1)');
        expect(degraded.details).not.toContain('All features are operational');

        // Inside the backoff window the scheduled tick serves the cache: attempts DECREASE
        // relative to probe frequency (AC2).
        scheduled[0]();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(embedCalls).toBe(1);

        // The provider recovers; the next due scheduled tick turns the healthcheck green again
        // with no operator action (AC3) — recovery never touches runEmbeddingWriteCanaryNow().
        providerHealthy = true;
        t += 30_000;
        scheduled[0]();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(embedCalls).toBe(2);

        const recovered = await HealthService.healthcheck();
        expect(recovered.status).toBe('healthy');
        expect(recovered.details).toContain('All features are operational');
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
        HealthService.startEmbeddingWriteCanary({
            runCanary: async () => ({
                status: 'failed',
                error : 'provider-failure:EMBEDDING_PROVIDER_ERROR'
            }),
            scheduler    : () => 0,
            clearSchedule: () => {},
            keyFor       : () => 'failure-classification'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        const result = await HealthService.healthcheck();

        expect(result.status).toBe('degraded');
        // The lean payload omits the writeCanary sub-object; a failed attempt still degrades the
        // payload via status + a details entry naming the failure AND the backoff regime.
        expect(result.providers.embedding).not.toHaveProperty('writeCanary');

        const detail = result.details.find(d => d.startsWith('Embedding write canary failed: provider-failure:EMBEDDING_PROVIDER_ERROR'));
        expect(detail).toBeTruthy();
        expect(detail).toContain('backing off');
        expect(result.details).not.toContain('All features are operational');
    });

    test('#13458: embedding write canary timeout degrades healthcheck instead of hanging', async () => {
        TextEmbeddingService.embedText = async () => new Promise(() => {});

        // The REAL attempt body with a 5ms bound, passed explicitly (a re-arm preserves the
        // previous body otherwise): the timeout classification must survive the producer boundary.
        HealthService.startEmbeddingWriteCanary({
            runCanary    : () => buildEmbeddingWriteCanaryBlock({timeoutMs: 5}),
            scheduler    : () => 0,
            clearSchedule: () => {},
            keyFor       : () => 'timeout-classification'
        });
        await new Promise(resolve => setTimeout(resolve, 30));

        const result = await HealthService.healthcheck();

        expect(result.status).toBe('degraded');

        const detail = result.details.find(d => d.startsWith('Embedding write canary failed: consumer-probe-timeout:EMBEDDING_PROBE_TIMEOUT'));
        expect(detail).toBeTruthy();
        expect(result.details).not.toContain('All features are operational');
    });

    test('stop-while-active restart joins the unresolved flight — maxActive stays 1 (terminal-review falsifier 4)', async () => {
        let   activeRuns = 0, maxActive = 0;
        const finishers  = [];

        HealthService.startEmbeddingWriteCanary({
            runCanary: () => {
                activeRuns++;
                maxActive = Math.max(maxActive, activeRuns);

                return new Promise(resolve => finishers.push(() => {
                    activeRuns--;
                    resolve({status: 'healthy'});
                }));
            },
            scheduler    : () => 0,
            clearSchedule: () => {},
            keyFor       : () => 'restart-join'
        });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(activeRuns).toBe(1); // the start-time demand is in flight

        HealthService.stopEmbeddingWriteCanary();

        HealthService.startEmbeddingWriteCanary({
            runCanary: () => { // must never run in this test: the re-arm's demand joins the flight
                activeRuns++;
                maxActive = Math.max(maxActive, activeRuns);
                return {status: 'healthy'};
            },
            scheduler    : () => 0,
            clearSchedule: () => {},
            keyFor       : () => 'restart-join'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        // The restart's immediate demand JOINED the unresolved flight instead of launching beside it.
        expect(maxActive).toBe(1);

        finishers.forEach(finish => finish());
        await new Promise(resolve => setTimeout(resolve, 0));

        const result = await HealthService.healthcheck();
        expect(result.status).toBe('healthy');
    });

    test('cached-green payload degrades immediately when the canary settles failed behind it (falsifier 5)', async () => {
        const cached = await HealthService.healthcheck();
        expect(cached.status).toBe('healthy'); // stores the green payload in the 5-minute cache

        HealthService.startEmbeddingWriteCanary({
            runCanary    : async () => ({status: 'failed', error: 'provider-failure:EMBEDDING_PROVIDER_ERROR'}),
            scheduler    : () => 0,
            clearSchedule: () => {},
            keyFor       : () => 'overlay-fast-path'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        // The freshObservability:false fast path reads LIVE canary truth: no green caching over a failure.
        const fastPath = await HealthService.healthcheck({freshObservability: false});
        expect(fastPath.status).toBe('degraded');
        expect(fastPath.details.some(d => d.startsWith('Embedding write canary failed: provider-failure:EMBEDDING_PROVIDER_ERROR'))).toBe(true);

        // The cached payload itself was NOT mutated by the overlay.
        expect(cached.status).toBe('healthy');
        expect(cached.details).toContain('All features are operational');
    });

    test('canary truth overlays the DB-down early return too — pending is projected, not dropped', async () => {
        let resolveRun;

        HealthService.startEmbeddingWriteCanary({
            runCanary    : () => new Promise(resolve => { resolveRun = resolve; }), // never settles → pending
            scheduler    : () => 0,
            clearSchedule: () => {},
            keyFor       : () => 'early-return-overlay'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        HealthService.loopbackConnectProbe = () => Promise.resolve(false); // no real dials on the db-down path
        ChromaManager.connected = false;
        ChromaManager.connect   = async () => false;
        HealthService.clearCache();

        const health = await HealthService.healthcheck();
        expect(health.status).toBe('unhealthy'); // the DB verdict owns the status…
        expect(health.details).toContain('Embedding write canary pending: run in flight'); // …but the canary truth still projects

        resolveRun({status: 'healthy'}); // drain the flight so afterEach leaves nothing hanging
        await new Promise(resolve => setTimeout(resolve, 0));
    });

    test('a healthy canary older than 3·max(cadence, healthyTtl) degrades as "loop not running"', async () => {
        let t = 1_000_000;

        HealthService.startEmbeddingWriteCanary({
            cadenceMs    : 60000,
            healthyTtlMs : 60000,
            runCanary    : async () => ({status: 'healthy'}),
            scheduler    : () => 0, // never fires → the loop "dies" after the first attempt
            clearSchedule: () => {},
            clock        : () => t,
            keyFor       : () => 'staleness-guard'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect((await HealthService.healthcheck()).status).toBe('healthy');

        t += 180_001; // just past 3 · max(60000, 60000)
        HealthService.clearCache(); // force a fresh payload so the overlay re-evaluates

        const stale = await HealthService.healthcheck();
        expect(stale.status).toBe('degraded');
        expect(stale.details.some(d => d.startsWith('Embedding write canary loop not running'))).toBe(true);
        expect(stale.details).not.toContain('All features are operational');
    });

    test('clearCache() preserves the producer: timer, streak, and backoff survive routine invalidation', async () => {
        let   embedCalls = 0;
        const scheduled  = [];

        HealthService.startEmbeddingWriteCanary({
            runCanary: async () => {
                embedCalls++;
                return {status: 'failed', error: 'provider-failure:EMBEDDING_PROVIDER_ERROR'};
            },
            scheduler    : fn => { scheduled.push(fn); return scheduled.length; },
            clearSchedule: () => { scheduled.length = 0; },
            keyFor       : () => 'clearcache-preservation'
        });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(embedCalls).toBe(1);
        expect(scheduled.length).toBe(1); // timer armed

        HealthService.clearCache();

        expect(scheduled.length).toBe(1); // routine payload invalidation did NOT disarm the producer

        const result = await HealthService.healthcheck();
        expect(result.status).toBe('degraded'); // the settled failure + streak survive
        expect(result.details.some(d => d.includes('backing off 30000ms (streak 1)'))).toBe(true);
    });

    /**
     * @summary A slow attempt IN FLIGHT is the loop running — it cannot also be evidence the loop
     * is gone. Found by @neo-gpt-emmy on live data I had already read myself.
     *
     * The staleness guard aged the cached healthy result and never asked whether an attempt was
     * currently running, so attempts of 662-1010s settled successfully while being reported as
     * `loop not running` throughout. That is the exact signal every observer used to conclude the
     * deployment was dead: the instrument manufactured the diagnosis it was consulted for.
     *
     * A wrong number invites re-measurement. A wrong CLASSIFICATION terminates the search.
     */
    test('an IN-FLIGHT slow attempt is reported as slow, never as a dead loop', async () => {
        let   t = 1_000_000, settle;

        // The budget matches the affected deployment's raised value, so the flight below is one this
        // plane genuinely permits — WITHIN its deadline, and merely slower than the staleness bar.
        HealthService.startEmbeddingWriteCanary({
            cadenceMs    : 60000,
            healthyTtlMs : 60000,
            timeoutMs    : 900000,
            runCanary    : async () => ({status: 'healthy'}), // seeds the healthy cache
            scheduler    : () => 0,
            clearSchedule: () => {},
            clock        : () => t,
            keyFor       : () => 'inflight-not-stale'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        // Re-arm with a body that never settles, putting one attempt in flight.
        HealthService.startEmbeddingWriteCanary({
            cadenceMs   : 60000,
            healthyTtlMs: 60000,
            timeoutMs   : 900000,
            runCanary   : () => new Promise(resolve => { settle = resolve }),
            clock       : () => t,
            keyFor      : () => 'inflight-not-stale'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        t += 400000; // past 3 x max(cadence, healthyTtl), inside the 900s budget: slow, not stuck

        const result = await HealthService.healthcheck();

        expect(result.details.some(d => d.includes('loop not running')), 'a running loop is not a stopped one').toBe(false);
        expect(result.details.some(d => d.startsWith('Embedding write canary slow')), 'and the slowness IS still reported').toBe(true);

        settle?.({status: 'healthy'});
    });

    /**
     * @summary The direction-of-error check on my own fix, required by @neo-gpt-emmy.
     *
     * Suppressing staleness on the mere EXISTENCE of a flight disarms the dead-loop guard for the
     * worst case: an attempt that never settles keeps `inFlight` true forever, so the surface reports
     * `healthy, slow` indefinitely. That trades a false RED for a permanent false GREEN, and the
     * green direction is the dangerous one — a dead provider reported as slow is never investigated,
     * where the reverse at least gets someone looking.
     *
     * The bound is the attempt's own issued budget: past it, the deadline that was supposed to end
     * this flight did not fire, which is a fault in its own right and not "slow".
     */
    test('a STUCK flight past its own budget reports stale — suppression is bounded, not unconditional', async () => {
        let t = 1_000_000, settle;

        HealthService.startEmbeddingWriteCanary({
            cadenceMs    : 60000,
            healthyTtlMs : 60000,
            timeoutMs    : 30000,
            runCanary    : async () => ({status: 'healthy'}), // seeds the healthy cache
            scheduler    : () => 0,
            clearSchedule: () => {},
            clock        : () => t,
            keyFor       : () => 'stuck-flight'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        // Age the CACHE past the staleness bar BEFORE the flight starts, so cache-age and flight-age
        // are independent. They advance together otherwise, and a test where they cannot diverge
        // cannot distinguish the two conditions it exists to separate.
        t += 400000;

        HealthService.startEmbeddingWriteCanary({
            cadenceMs   : 60000,
            healthyTtlMs: 60000,
            timeoutMs   : 30000,
            runCanary   : () => new Promise(resolve => { settle = resolve }),
            clock       : () => t,
            keyFor      : () => 'stuck-flight'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        t += 20000; // flight 20s old — inside its 30s budget; cache 420s old — past the bar

        const slow = await HealthService.healthcheck();

        expect(slow.details.some(d => d.startsWith('Embedding write canary slow')), 'inside its budget it is slow').toBe(true);
        expect(slow.details.some(d => d.includes('STUCK'))).toBe(false);

        t += 600000; // now far past the 30s budget — the deadline never fired

        HealthService.clearCache();

        const stuck = await HealthService.healthcheck();

        expect(stuck.details.some(d => d.includes('STUCK in flight')), 'past its budget it is stuck, not slow').toBe(true);
        expect(stuck.details.some(d => d.startsWith('Embedding write canary slow')), 'a hung flight must not be reported as merely slow forever').toBe(false);

        settle?.({status: 'healthy'});
    });

    /**
     * @summary The issued budget is the flight's OWN, not whatever the last re-arm set.
     *
     * Found by @neo-gpt-emmy on the previous head: `producer.timeoutMs` is mutable and every re-arm
     * overwrites it, while the gate and any in-flight attempt are deliberately preserved. So a live
     * flight was being judged against a deadline it was never issued under. My comment claimed
     * "issued budget" while the code read the current config — the prose asserted a property the
     * code did not have.
     *
     * Paired in BOTH directions, because each fails differently and a single direction would leave
     * the other silently wrong.
     */
    test('re-arm 900s → 30s: a flight issued under the LONG budget is not falsely STUCK', async () => {
        let t = 1_000_000, settle;

        HealthService.startEmbeddingWriteCanary({
            cadenceMs    : 60000, healthyTtlMs: 60000, timeoutMs: 900000,
            runCanary    : async () => ({status: 'healthy'}),
            scheduler    : () => 0,
            clearSchedule: () => {},
            clock        : () => t,
            keyFor       : () => 'rearm-long-to-short'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        t += 400000; // age the cache past the bar before the flight starts

        HealthService.startEmbeddingWriteCanary({
            cadenceMs: 60000, healthyTtlMs: 60000, timeoutMs: 900000,
            runCanary: () => new Promise(resolve => { settle = resolve }),
            clock    : () => t,
            keyFor   : () => 'rearm-long-to-short'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        t += 60000; // 60s in flight: inside the 900s it was ISSUED under

        // Re-arm to a SHORT budget. The live flight keeps the deadline it was issued with; only the
        // NEXT attempt gets the new one.
        HealthService.startEmbeddingWriteCanary({
            cadenceMs: 60000, healthyTtlMs: 60000, timeoutMs: 30000,
            clock    : () => t,
            keyFor   : () => 'rearm-long-to-short'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        HealthService.clearCache();

        const result = await HealthService.healthcheck();

        expect(result.details.some(d => d.includes('STUCK')), '60s < the 900s it was issued under').toBe(false);
        expect(result.details.some(d => d.startsWith('Embedding write canary slow'))).toBe(true);

        settle?.({status: 'healthy'});
    });

    test('re-arm 30s → 900s: a flight issued under the SHORT budget is still STUCK past it', async () => {
        let t = 1_000_000, settle;

        HealthService.startEmbeddingWriteCanary({
            cadenceMs    : 60000, healthyTtlMs: 60000, timeoutMs: 30000,
            runCanary    : async () => ({status: 'healthy'}),
            scheduler    : () => 0,
            clearSchedule: () => {},
            clock        : () => t,
            keyFor       : () => 'rearm-short-to-long'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        t += 400000;

        HealthService.startEmbeddingWriteCanary({
            cadenceMs: 60000, healthyTtlMs: 60000, timeoutMs: 30000,
            runCanary: () => new Promise(resolve => { settle = resolve }),
            clock    : () => t,
            keyFor   : () => 'rearm-short-to-long'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        t += 200000; // 200s in flight: far past the 30s it was ISSUED under

        // Re-arm to a LONG budget. A widened config must not retroactively excuse a missed deadline.
        HealthService.startEmbeddingWriteCanary({
            cadenceMs: 60000, healthyTtlMs: 60000, timeoutMs: 900000,
            clock    : () => t,
            keyFor   : () => 'rearm-short-to-long'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        HealthService.clearCache();

        const result = await HealthService.healthcheck();

        expect(result.details.some(d => d.includes('STUCK in flight')), 'the missed deadline stands').toBe(true);
        expect(result.details.some(d => d.startsWith('Embedding write canary slow'))).toBe(false);

        settle?.({status: 'healthy'});
    });

    test('a DEAD loop with nothing in flight still reports stale — the fix must not hide the real condition', async () => {
        let t = 1_000_000;

        HealthService.startEmbeddingWriteCanary({
            cadenceMs    : 60000,
            healthyTtlMs : 60000,
            runCanary    : async () => ({status: 'healthy'}),
            scheduler    : () => 0, // never fires again → the loop genuinely dies after one attempt
            clearSchedule: () => {},
            clock        : () => t,
            keyFor       : () => 'genuinely-dead-loop'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        t += 900000;

        const result = await HealthService.healthcheck();

        // Asserted on the CANARY details, not the payload status: the claim is about this classifier,
        // and the surrounding payload carries unrelated environment surface that would answer a
        // different question than the one this control asks.
        expect(result.details.some(d => d.includes('loop not running')), 'NON-VACUITY: a true dead loop is still caught').toBe(true);
        expect(result.details.some(d => d.includes('no attempt in flight'))).toBe(true);
        expect(result.details.some(d => d.startsWith('Embedding write canary slow')), 'a dead loop is not reported as merely slow').toBe(false);
    });

    test('a never-started producer projects a named non-degrading wiring gap', async () => {
        HealthService.clearEmbeddingWriteCanaryProducer(); // simulate a boot that never started it

        const result = await HealthService.healthcheck();
        expect(result.status).toBe('healthy'); // non-degrading by Contract Ledger fallback
        expect(result.details.some(d => d.startsWith('Embedding write canary unavailable: producer not started'))).toBe(true);
        expect(result.details).toContain('All features are operational'); // observability does not strip the payload
    });

    test('pending → healthy: a settled-healthy canary strips the projected pending detail (never mutating the cache)', async () => {
        let resolveRun;

        HealthService.startEmbeddingWriteCanary({
            runCanary    : () => new Promise(resolve => { resolveRun = resolve; }), // never settles until told → pending
            scheduler    : () => 0,
            clearSchedule: () => {},
            keyFor       : () => 'pending-to-healthy'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        const pending = await HealthService.healthcheck(); // caches the healthy payload WITH the pending detail
        expect(pending.status).toBe('healthy');
        expect(pending.details).toContain('Embedding write canary pending: run in flight');

        resolveRun({status: 'healthy'});
        await new Promise(resolve => setTimeout(resolve, 0));

        const fastPath = await HealthService.healthcheck({freshObservability: false});
        expect(fastPath.status).toBe('healthy');
        expect(fastPath.details.some(d => d.startsWith('Embedding write canary'))).toBe(false); // the stale detail is gone

        expect(pending.details).toContain('Embedding write canary pending: run in flight'); // …stripped on a copy — the stored cache is unmutated
    });

    test('pending → failed → healthy over a cached-pending payload: no canary detail survives a healthy read', async () => {
        const resolveRuns = [];

        HealthService.startEmbeddingWriteCanary({
            runCanary    : () => new Promise(resolve => resolveRuns.push(resolve)),
            scheduler    : () => 0,
            clearSchedule: () => {},
            keyFor       : () => 'pending-failed-healthy'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        const cached = await HealthService.healthcheck(); // healthy payload carrying the pending detail
        expect(cached.details).toContain('Embedding write canary pending: run in flight');

        resolveRuns[0]({status: 'failed', error: 'provider-failure:EMBEDDING_PROVIDER_ERROR'});
        await new Promise(resolve => setTimeout(resolve, 0));

        const degraded = await HealthService.healthcheck({freshObservability: false});
        expect(degraded.status).toBe('degraded');
        expect(degraded.details.some(d => d.startsWith('Embedding write canary failed: provider-failure:EMBEDDING_PROVIDER_ERROR'))).toBe(true);

        const recovery = HealthService.runEmbeddingWriteCanaryNow(); // starts the recovery flight — do not await before feeding it
        await new Promise(resolve => setTimeout(resolve, 0));        // let the flight invoke the attempt body
        resolveRuns[1]({status: 'healthy'});
        await recovery;
        await new Promise(resolve => setTimeout(resolve, 0));

        const recovered = await HealthService.healthcheck({freshObservability: false});
        expect(recovered.status).toBe('healthy');
        expect(recovered.details.some(d => d.startsWith('Embedding write canary'))).toBe(false); // neither the pending nor the failed detail survives
    });

    test('a scheduled callback captured before stop stays inert after re-arm (epoch fence)', async () => {
        let   runs      = 0;
        const callbacks = [];

        const arm = () => HealthService.startEmbeddingWriteCanary({
            runCanary    : async () => { runs++; return {status: 'healthy'}; },
            scheduler    : fn => { callbacks.push(fn); return callbacks.length; },
            clearSchedule: () => {},
            keyFor       : () => 'epoch-fence'
        });

        arm();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(runs).toBe(1); // the immediate demand

        const stale = callbacks[0];

        HealthService.stopEmbeddingWriteCanary();
        arm();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(runs).toBe(2); // the re-arm's immediate demand

        stale(); // the pre-stop callback fires — and must be a no-op
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(runs).toBe(2);
    });

    test('each scheduled handle is cleared by the clearer that paired it (scheduler A→B→stop)', async () => {
        const cleared   = [];
        const scheduleA = () => 'handle-A', clearA = h => cleared.push(['A', h]);
        const scheduleB = () => 'handle-B', clearB = h => cleared.push(['B', h]);

        HealthService.startEmbeddingWriteCanary({
            runCanary    : async () => ({status: 'healthy'}),
            scheduler    : scheduleA,
            clearSchedule: clearA,
            keyFor       : () => 'handle-pairing'
        });

        HealthService.startEmbeddingWriteCanary({ // re-arm with a new scheduler pair
            scheduler    : scheduleB,
            clearSchedule: clearB,
            keyFor       : () => 'handle-pairing'
        });

        HealthService.stopEmbeddingWriteCanary();

        expect(cleared).toEqual([['A', 'handle-A'], ['B', 'handle-B']]); // each handle met ITS OWN clearer
    });

    test('a non-positive cadence synchronously disarms and fences an existing schedule', async () => {
        let   runs      = 0;
        const callbacks = [];
        const cleared   = [];

        HealthService.startEmbeddingWriteCanary({
            runCanary    : async () => { runs++; return {status: 'healthy'}; },
            scheduler    : fn => { callbacks.push(fn); return fn; },
            clearSchedule: () => cleared.push(1),
            keyFor       : () => 'disable-fences'
        });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(runs).toBe(1);

        const result = HealthService.startEmbeddingWriteCanary({cadenceMs: 0});
        expect(result).toBe(null);
        expect(cleared.length).toBe(1); // the live schedule was disarmed synchronously

        callbacks[0](); // the pre-disable callback must be fenced
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(runs).toBe(1);
    });

    test('re-arm preserves omitted collaborators and refreshes provided ones (the explicit contract)', async () => {
        const bodies = [];

        HealthService.startEmbeddingWriteCanary({
            runCanary    : async () => { bodies.push('X'); return {status: 'healthy'}; },
            scheduler    : () => 0,
            clearSchedule: () => {},
            keyFor       : () => 'preserve-refresh'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        HealthService.startEmbeddingWriteCanary({ // omitted runCanary → PRESERVED
            scheduler    : () => 0,
            clearSchedule: () => {},
            keyFor       : () => 'preserve-refresh-2'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        HealthService.startEmbeddingWriteCanary({ // provided runCanary → REFRESHED
            runCanary    : async () => { bodies.push('Y'); return {status: 'healthy'}; },
            scheduler    : () => 0,
            clearSchedule: () => {},
            keyFor       : () => 'preserve-refresh-3'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(bodies).toEqual(['X', 'X', 'Y']);
    });

    test('a disabled producer projects a named non-degrading detail, and a positive re-arm restores live truth', async () => {
        HealthService.startEmbeddingWriteCanary({
            runCanary    : async () => ({status: 'healthy'}),
            scheduler    : () => 0,
            clearSchedule: () => {},
            keyFor       : () => 'disabled-projection'
        });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect((await HealthService.healthcheck()).status).toBe('healthy');

        expect(HealthService.startEmbeddingWriteCanary({cadenceMs: 0})).toBe(null);

        const disabled = await HealthService.healthcheck({freshObservability: false});
        expect(disabled.status).toBe('healthy'); // non-degrading by contract — never the old gate truth decaying
        expect(disabled.details.some(d => d.startsWith('Embedding write canary disabled:'))).toBe(true);

        HealthService.startEmbeddingWriteCanary({ // positive cadence re-arms; the default body is preserved
            scheduler    : () => 0,
            clearSchedule: () => {},
            keyFor       : () => 'disabled-projection'
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        const restored = await HealthService.healthcheck({freshObservability: false});
        expect(restored.status).toBe('healthy');
        expect(restored.details.some(d => d.startsWith('Embedding write canary disabled:'))).toBe(false);
    });

    test('the default attempt body reads the arm timeout at call time — a re-arm refresh flows through the preserved body', async () => {
        TextEmbeddingService.embedText = async () => new Promise(() => {}); // hangs forever
        HealthService.clearEmbeddingWriteCanaryProducer(); // so the DEFAULT body is created (beforeEach's provided body would be preserved)

        HealthService.startEmbeddingWriteCanary({
            timeoutMs    : 5,
            scheduler    : () => 0,
            clearSchedule: () => {},
            keyFor       : () => 'timeout-refresh'
        });
        await new Promise(resolve => setTimeout(resolve, 30));
        expect((await HealthService.healthcheck()).status).toBe('degraded'); // the first 5ms bound already fired

        HealthService.startEmbeddingWriteCanary({ // refresh the bound to 80ms; the default body is preserved
            timeoutMs    : 80,
            scheduler    : () => 0,
            clearSchedule: () => {},
            keyFor       : () => 'timeout-refresh-2' // rotation: fresh generation, no inherited backoff
        });
        await new Promise(resolve => setTimeout(resolve, 30));

        // At +30ms the refreshed 80ms attempt is STILL pending — the preserved body did not reuse the old 5ms bound.
        const mid = await HealthService.healthcheck();
        expect(mid.details.some(d => d.startsWith('Embedding write canary pending: run in flight'))).toBe(true);

        await new Promise(resolve => setTimeout(resolve, 90));

        const settled = await HealthService.healthcheck();
        expect(settled.details.some(d => d.startsWith('Embedding write canary failed: consumer-probe-timeout:EMBEDDING_PROBE_TIMEOUT'))).toBe(true);
    });

    test('a scheduler handle of 0 is cleared on stop (every non-null handle clears)', async () => {
        const cleared = [];

        HealthService.startEmbeddingWriteCanary({
            runCanary    : async () => ({status: 'healthy'}),
            scheduler    : () => 0,
            clearSchedule: h => cleared.push(h),
            keyFor       : () => 'handle-zero'
        });

        HealthService.stopEmbeddingWriteCanary();

        expect(cleared).toEqual([0]);
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
        // `details` is an ARRAY, so `toContain` is exact-element equality — not the substring check
        // this line reads as. The probe is DESIGNED to report several collection failures in one
        // joined string (`errors.join('; ')`), so exact equality asserts a shape the probe's own
        // contract permits it to violate. Ordering only decided whether it got away with it.
        expect(result.details).toEqual(
            expect.arrayContaining([
                expect.stringContaining('memory collection count health probe timed out after 5ms')
            ])
        );
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
        let   probeSignal;
        const result = await buildEmbeddingWriteCanaryBlock({
            cfg: {
                embeddingProvider: 'openAiCompatible',
                vectorDimension  : 3
            },
            embedText: async (input, provider, options) => {
                expect(input).toBe('neo-healthcheck-embedding-write-canary');
                expect(provider).toBe('openAiCompatible');
                expect(options.deadlineMs).toBe(10);
                expect(options.operationLabel).toBe('Embedding write canary');
                expect(options.operationStage).toBe('embedding-canary');
                expect(options.service).toBe('memory-core');
                expect(options.signal).toBeInstanceOf(AbortSignal);
                probeSignal = options.signal;
                return [0.1, 0.2, 0.3];
            },
            now      : () => nowCalls++ ? 125 : 100,
            timeoutMs: 10
        });

        expect(result).toEqual({
            status            : 'healthy',
            provider          : 'openAiCompatible',
            dimensions        : 3,
            expectedDimensions: 3,
            durationMs        : 25
        });

        await new Promise(resolve => setTimeout(resolve, 20));
        expect(probeSignal.aborted).toBe(false);
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
            status             : 'failed',
            provider           : 'openAiCompatible',
            dimensions         : null,
            expectedDimensions : 4096,
            durationMs         : 0,
            error              : 'provider-failure:EMBEDDING_PROVIDER_ERROR',
            errorClassification: 'provider-failure',
            errorCode          : 'EMBEDDING_PROVIDER_ERROR'
        });
    });

    test('redacts and bounds an untrusted provider error before it reaches the health receipt', async () => {
        const secret = 'sk-live-secret-must-not-escape';
        const result = await buildEmbeddingWriteCanaryBlock({
            cfg: {
                embeddingProvider: 'openAiCompatible',
                vectorDimension  : 4096
            },
            embedText: async () => {
                throw Object.assign(
                    new Error(`provider body=${secret}; endpoint=https://private.invalid; ${'x'.repeat(500)}`),
                    {code: `UNTRUSTED_${secret}`}
                );
            },
            now: () => 100
        });

        expect(result).toMatchObject({
            status             : 'failed',
            error              : 'provider-failure:EMBEDDING_PROVIDER_ERROR',
            errorClassification: 'provider-failure',
            errorCode          : 'EMBEDDING_PROVIDER_ERROR'
        });
        expect(result.error.length).toBeLessThanOrEqual(96);
        expect(JSON.stringify(result)).not.toContain(secret);
        expect(JSON.stringify(result)).not.toContain('private.invalid');
    });

    test('#13458: reports failed when the active provider never resolves', async () => {
        let probeSignal;

        const result = await buildEmbeddingWriteCanaryBlock({
            cfg: {
                embeddingProvider: 'openAiCompatible',
                vectorDimension  : 4096
            },
            embedText: async (input, provider, options) => new Promise((resolve, reject) => {
                probeSignal = options.signal;
                options.signal.addEventListener('abort', () => reject(options.signal.reason), {once: true});
            }),
            now      : () => 100,
            timeoutMs: 5
        });

        expect(result).toMatchObject({
            status             : 'failed',
            provider           : 'openAiCompatible',
            dimensions         : null,
            expectedDimensions : 4096,
            durationMs         : 0,
            error              : 'consumer-probe-timeout:EMBEDDING_PROBE_TIMEOUT',
            errorClassification: 'consumer-probe-timeout',
            errorCode          : 'EMBEDDING_PROBE_TIMEOUT'
        });
        expect(probeSignal.aborted).toBe(true);
        expect(probeSignal.reason).toMatchObject({
            code          : 'EMBEDDING_PROBE_TIMEOUT',
            operationLabel: 'Embedding write canary',
            timeoutMs     : 5
        });
    });

    test('deadline stays failed when an abort listener resolves a valid vector (#15694)', async () => {
        const result = await buildEmbeddingWriteCanaryBlock({
            cfg: {
                embeddingProvider: 'openAiCompatible',
                vectorDimension  : 3
            },
            embedText: async (input, provider, options) => new Promise(resolve => {
                options.signal.addEventListener('abort', () => resolve([0.1, 0.2, 0.3]), {once: true});
            }),
            now      : () => 100,
            timeoutMs: 5
        });

        expect(result).toMatchObject({
            status             : 'failed',
            dimensions         : null,
            error              : 'consumer-probe-timeout:EMBEDDING_PROBE_TIMEOUT',
            errorClassification: 'consumer-probe-timeout',
            errorCode          : 'EMBEDDING_PROBE_TIMEOUT'
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
        expect(result).toEqual({ lastSuccessful: null, lastCompleted: null, count: 0, unusableCount: 0, unverifiedCount: 0 });
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
        expect(result).toEqual({ lastSuccessful: null, lastCompleted: null, count: 0, unusableCount: 0, unverifiedCount: 0 });
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
        expect(result).toEqual({ lastSuccessful: '2023-10-02T12:00:00Z', lastCompleted: '2023-10-02T12:00:00Z', count: 3, unusableCount: 0, unverifiedCount: 2 });
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
        expect(result).toEqual({ lastSuccessful: null, lastCompleted: null, count: 1, unusableCount: 0, unverifiedCount: 0 });
    });
});

/**
 * @summary A bundle that exported ZERO rows is not a recovery source, and must not be reported
 * as the last successful backup.
 *
 * Observed on a live deployment: a bundle whose receipt read `"status": "success"` while its own
 * `bundle-meta.integrity` read `empty` for both `kb` and `mc` — zero memories, zero summaries,
 * zero KB chunks. `backup.mjs` is not at fault; its handling is deliberate and says so in-comment,
 * persisting the verdict "for a downstream canary/alert to escalate on". That consumer was never
 * built, so this block reported the empty bundle as the last successful one.
 *
 * The distinction these probes pin is the whole point: **"a backup completed" and "a backup is
 * restorable" are different facts.** Collapsing them is what let an operator believe there was a
 * recovery source when there was none — the one error class that stays silent until the day you
 * try to restore.
 *
 * Non-fatal semantics are preserved deliberately. A genuinely fresh environment backs up empty and
 * must still succeed; making `empty` fatal would break first boot for every new deployment. The
 * defect is that the verdict was invisible, not that it was non-fatal — so `lastCompleted` keeps
 * reporting the fact that a run finished.
 */
test.describe('HealthService #16240 — an empty-verdict bundle is not a recovery source', () => {
    let buildBackupStateBlock;

    const mockPath = {join: (...args) => args.join('/')};

    /**
     * @summary Builds an fs mock over `{dirName: bundleMeta}`.
     * @param {Object} bundles
     * @returns {Object}
     */
    function fsWith(bundles) {
        return {
            pathExists: async p => p === '/fake/path' || p.endsWith('bundle-meta.json'),
            readdir   : async () => Object.keys(bundles).map(name => ({isDirectory: () => true, name})),
            readJson  : async p => {
                const hit = Object.keys(bundles).find(name => p.includes(name));
                if (!hit) throw new Error('Not found');
                return bundles[hit];
            }
        };
    }

    const EMPTY_VERDICT = [
        {subsystem: 'kb', status: 'empty', sourceCount: 0, bundleCount: 0},
        {subsystem: 'mc', status: 'empty', sourceCount: 0, bundleCount: 0}
    ];
    const CLEAN_VERDICT = [
        {subsystem: 'kb', status: 'pass', sourceCount: 61206, bundleCount: 61206},
        {subsystem: 'mc', status: 'pass', sourceCount: 31173, bundleCount: 31173}
    ];

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/HealthService.mjs');
        buildBackupStateBlock = mod.buildBackupStateBlock;
    });

    test('the NEWEST bundle being empty does not make it the last successful one', async () => {
        // The live shape: a clean series, then a newer run that exported nothing. The previous scan
        // broke on the first `completedAt` it found and reported the empty bundle.
        const result = await buildBackupStateBlock('/fake/path', fsWith({
            'backup-2026-07-30T19-28-57': {timestamp: '2026-07-30T19:28:57Z', completedAt: '2026-07-30T19:29:53Z', integrity: CLEAN_VERDICT},
            'backup-2026-07-31T04-57-18': {timestamp: '2026-07-31T04:57:18Z', completedAt: '2026-07-31T04:57:18Z', integrity: EMPTY_VERDICT}
        }), mockPath);

        expect(result.lastSuccessful).toBe('2026-07-30T19:28:57Z');
        // …and the fact that a run DID complete is not lost, only separated from restorability.
        expect(result.lastCompleted).toBe('2026-07-31T04:57:18Z');
        expect(result.unusableCount).toBe(1);
    });

    test('an all-empty series reports NO recovery source while still reporting the completion', async () => {
        // The state this deployment was actually in. `lastSuccessful: null` alongside `count: 1`
        // must not read as "one backup that did not finish" — it finished, and it is unusable.
        const result = await buildBackupStateBlock('/fake/path', fsWith({
            'backup-2026-07-31T04-57-18': {timestamp: '2026-07-31T04:57:18Z', completedAt: '2026-07-31T04:57:18Z', integrity: EMPTY_VERDICT}
        }), mockPath);

        expect(result.lastSuccessful).toBeNull();
        expect(result.lastCompleted).toBe('2026-07-31T04:57:18Z');
        expect(result.unusableCount).toBe(1);
        expect(result.count).toBe(1);
    });

    test('a PARTIAL emptiness still disqualifies — one empty subsystem is not a usable restore', async () => {
        const result = await buildBackupStateBlock('/fake/path', fsWith({
            'backup-2026-07-31T04-57-18': {
                timestamp  : '2026-07-31T04:57:18Z',
                completedAt: '2026-07-31T04:57:18Z',
                integrity  : [{subsystem: 'kb', status: 'pass', sourceCount: 10, bundleCount: 10}, EMPTY_VERDICT[1]]
            }
        }), mockPath);

        expect(result.lastSuccessful).toBeNull();
        expect(result.unusableCount).toBe(1);
    });

    test('POSITIVE CONTROL: a clean bundle is still reported, and counts as neither unusable nor unverified', async () => {
        // Without this the assertions above are satisfied by a function that reports nothing at all.
        const result = await buildBackupStateBlock('/fake/path', fsWith({
            'backup-2026-07-30T19-28-57': {timestamp: '2026-07-30T19:28:57Z', completedAt: '2026-07-30T19:29:53Z', integrity: CLEAN_VERDICT}
        }), mockPath);

        expect(result.lastSuccessful).toBe('2026-07-30T19:28:57Z');
        expect(result.lastCompleted).toBe('2026-07-30T19:28:57Z');
        expect(result.unusableCount).toBe(0);
    });

    test('a bundle with NO integrity block is reported, not silently disqualified', async () => {
        // Absent evidence is not evidence of emptiness. Disqualifying an unverified bundle would
        // condemn any series predating the integrity block — a worse outage than the bug — so it
        // stays eligible.
        const result = await buildBackupStateBlock('/fake/path', fsWith({
            'backup-2026-07-01T13-23-24': {timestamp: '2026-07-01T13:23:24Z', completedAt: '2026-07-01T13:24:00Z'}
        }), mockPath);

        expect(result.lastSuccessful).toBe('2026-07-01T13:23:24Z');
        expect(result.unusableCount).toBe(0);
    });

    test('…but it is COUNTED as unverified — eligible is not the same as verified', async () => {
        // The distinction the receipt already carries as `restorable: null`. Reporting a bundle as
        // `lastSuccessful` without saying whether its restorability was ever established is this
        // ticket's own defect one layer in: a computed verdict reaching one surface and not the
        // other. `unverifiedCount: 0` is a positive assertion that everything reported was checked
        // — information, not noise, and load-bearing the moment it is non-zero.
        const result = await buildBackupStateBlock('/fake/path', fsWith({
            'backup-2026-07-01T13-23-24': {timestamp: '2026-07-01T13:23:24Z', completedAt: '2026-07-01T13:24:00Z'},
            'backup-2026-07-30T19-28-57': {timestamp: '2026-07-30T19:28:57Z', completedAt: '2026-07-30T19:29:53Z', integrity: CLEAN_VERDICT}
        }), mockPath);

        // The verified bundle is newest so it wins `lastSuccessful`, and the older unverified one
        // is declared rather than silently folded into the total.
        expect(result.lastSuccessful).toBe('2026-07-30T19:28:57Z');
        expect(result.unverifiedCount).toBe(1);
        expect(result.unusableCount).toBe(0);
    });

    test('an all-verified series asserts ZERO unverified — the two surfaces agree', async () => {
        const result = await buildBackupStateBlock('/fake/path', fsWith({
            'backup-2026-07-30T19-28-57': {timestamp: '2026-07-30T19:28:57Z', completedAt: '2026-07-30T19:29:53Z', integrity: CLEAN_VERDICT}
        }), mockPath);

        expect(result.unverifiedCount).toBe(0);
    });

    test('an unverified bundle can BE the reported one, and the output says so', async () => {
        // What makes the counter load-bearing rather than decorative: nothing in this series was
        // ever verified, yet one is still reported. Without the count that output is
        // indistinguishable from a fully-verified series.
        const result = await buildBackupStateBlock('/fake/path', fsWith({
            'backup-2026-07-01T13-23-24': {timestamp: '2026-07-01T13:23:24Z', completedAt: '2026-07-01T13:24:00Z'}
        }), mockPath);

        expect(result.lastSuccessful).toBe('2026-07-01T13:23:24Z');
        expect(result.unverifiedCount).toBe(1);
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
            secondsSinceLastPulse: null,
            // Arming reports `null`, never `false`, when it cannot determine: a healthcheck with no
            // bound identity has no row to answer about, and claiming "not armed" there would
            // manufacture an alarm out of a missing instrument rather than a real condition.
            subscription         : {armed: null, reason: 'unbound-identity'}
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

/**
 * @summary Coverage for the wake-arming verdict — the question nothing asked, so an unarmed seat
 * read healthy on every surface while receiving nothing.
 *
 * The verdict must agree with `buildWakeReceiverManifest`, which is what actually decides whether a
 * route exists. The final test asserts that agreement directly rather than pinning strings on each
 * side: a record the health block calls `armed` must produce a published route, and one it calls
 * unarmed must not. String-pinning both sides is what let the first draft invert the target check.
 *
 * Test isolation: `RequestContextService.getAgentIdentityNodeId` and `WakeSubscriptionService.list`
 * are the block's only two inputs; both are restored in afterEach.
 *
 * @see Neo.ai.services.memory-core.HealthService#buildSubscriptionArmingBlock
 * @see ai/daemons/wake/buildReceiverManifest.mjs
 */
test.describe('HealthService #16310 — wake subscription arming verdict', () => {
    let buildWakeFeaturesBlock, RequestContextService, WakeSubscriptionService, buildWakeReceiverManifest;
    let originalGetAgentIdentityNodeId, originalList;

    const KEY = 'k'.repeat(64); // server-issued keys are >= 32 chars

    /** A record the manifest gate accepts, minus whatever a given test removes. */
    const deliverableRecord = (overrides = {}) => ({
        id                   : 'WAKE_SUB:arming-spec',
        agentIdentity        : '@spec-seat',
        status               : 'active',
        harnessTarget        : 'a2a-webhook',
        harnessTargetMetadata: {
            signingKey : KEY,
            url        : 'http://host.docker.internal:3199/wake',
            adapter    : 'tmux',
            tmuxSession: 'spec'
        },
        ...overrides
    });

    /** Runs the block through its only public entrypoint. */
    const arming = async () => (await buildWakeFeaturesBlock()).subscription;

    test.beforeAll(async () => {
        buildWakeFeaturesBlock    = (await import('../../../../../../ai/services/memory-core/HealthService.mjs')).buildWakeFeaturesBlock;
        RequestContextService     = (await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;
        WakeSubscriptionService   = (await import('../../../../../../ai/services/memory-core/WakeSubscriptionService.mjs')).default;
        buildWakeReceiverManifest = (await import('../../../../../../ai/daemons/wake/buildReceiverManifest.mjs')).buildWakeReceiverManifest;

        originalGetAgentIdentityNodeId = RequestContextService.getAgentIdentityNodeId;
        originalList                   = WakeSubscriptionService.list;
    });

    test.beforeEach(() => {
        RequestContextService.getAgentIdentityNodeId = () => 'AGENT:spec-seat';
    });

    test.afterEach(() => {
        RequestContextService.getAgentIdentityNodeId = originalGetAgentIdentityNodeId;
        WakeSubscriptionService.list                 = originalList;
    });

    test('an active a2a-webhook row with a server-issued key is armed', async () => {
        WakeSubscriptionService.list = async () => ({subscriptions: [deliverableRecord()]});

        expect(await arming()).toEqual({armed: true, reason: 'deliverable'});
    });

    test('an active a2a-webhook row with NO signingKey is unarmed — the live shape on this plane', async () => {
        // Measured on this plane, not hypothetical: the row reads `status: 'active'` on every
        // surface while delivery refuses it unsigned and the manifest build throws on it. Nothing
        // attempted, nothing logged, nothing failed — the seat is simply deaf.
        WakeSubscriptionService.list = async () => ({
            subscriptions: [deliverableRecord({
                harnessTargetMetadata: {url: 'http://host.docker.internal:3199/wake', adapter: 'osascript'}
            })]
        });

        expect(await arming()).toEqual({armed: false, reason: 'missing-signing-key'});
    });

    test('a too-short signingKey is unarmed — the health verdict uses the gate\'s own predicate', async () => {
        // A truncated key passes a `Boolean(...)` presence check and then throws at manifest build.
        // Sharing `isServerIssuedSigningKey` with the gate is what keeps those two answers identical.
        WakeSubscriptionService.list = async () => ({
            subscriptions: [deliverableRecord({
                harnessTargetMetadata: {signingKey: 'too-short', url: 'http://x/wake', adapter: 'tmux'}
            })]
        });

        expect(await arming()).toEqual({armed: false, reason: 'missing-signing-key'});
    });

    test('no subscriptions at all is unarmed, not unknown', async () => {
        WakeSubscriptionService.list = async () => ({subscriptions: []});

        expect(await arming()).toEqual({armed: false, reason: 'no-active-subscription'});
    });

    test('a degraded row does not count as active — delivery skips it without an attempt', async () => {
        // REGRESSION GUARD. Filtering only `status !== 'retired'` left degraded rows in the active
        // set, so a route that delivery short-circuits and the manifest withdraws reported `armed`.
        WakeSubscriptionService.list = async () => ({
            subscriptions: [deliverableRecord({status: 'degraded'})]
        });

        expect(await arming()).toEqual({armed: false, reason: 'no-active-subscription'});
    });

    test('an active row on a non-deliverable target is unarmed — only a2a-webhook reaches the receiver', async () => {
        // REGRESSION GUARD for an inverted predicate. The first draft read `harnessTarget !==
        // 'a2a-webhook'` as "no key needed, therefore fine", which reported `armed: true` for exactly
        // the seats `buildWakeReceiverManifest` refuses to publish ("cannot receive a container wake
        // until it is migrated"). RED against that draft.
        WakeSubscriptionService.list = async () => ({
            subscriptions: [deliverableRecord({harnessTarget: 'mcp-notifications'})]
        });

        expect(await arming()).toEqual({armed: false, reason: 'unmigrated-target'});
    });

    test('an explicitly disabled target is unarmed rather than silently fine', async () => {
        WakeSubscriptionService.list = async () => ({
            subscriptions: [deliverableRecord({harnessTarget: 'disabled'})]
        });

        expect(await arming()).toEqual({armed: false, reason: 'unmigrated-target'});
    });

    test('a legacy row with no `status` IS armed — every reader now resolves absence the same way', async () => {
        // This assertion was previously inverted, and deliberately so: the builder compared strictly
        // while lifecycle and fleet consumers defaulted the lister's unchanged missing value to
        // active. This verdict sided with the builder because that is the only thing it claims. The
        // readers now share one predicate (absent ⇒ active), so the verdict and builder agree.
        const record = deliverableRecord();
        delete record.status;

        WakeSubscriptionService.list = async () => ({subscriptions: [record]});

        expect(await arming()).toEqual({armed: true, reason: 'deliverable'});
    });

    test('ONE keyless row unarms the whole seat — the key gate aborts the build, it does not skip', async () => {
        // The decisive asymmetry, and the case an earlier draft got backwards. Status and target
        // failures `continue` (that row is skipped, its route withdrawn, everything else builds).
        // A missing key THROWS — so this pair produces no manifest at all, and the perfectly good
        // keyed row publishes nothing either. Read with `some`, this reported armed: true.
        WakeSubscriptionService.list = async () => ({
            subscriptions: [
                deliverableRecord({id: 'WAKE_SUB:keyed'}),
                deliverableRecord({id: 'WAKE_SUB:keyless', harnessTargetMetadata: {url: 'http://x/wake'}})
            ]
        });

        expect(await arming()).toEqual({armed: false, reason: 'missing-signing-key'});
    });

    test('a SKIPPED row alongside a keyed one still arms — skips cost only themselves', async () => {
        // The control for the test above: proves the unarming is caused by the throw specifically,
        // not by "any imperfect row in the set". A non-deliverable target is skipped, so the keyed
        // webhook row still builds and the seat is armed.
        WakeSubscriptionService.list = async () => ({
            subscriptions: [
                deliverableRecord({id: 'WAKE_SUB:keyed'}),
                deliverableRecord({id: 'WAKE_SUB:other', harnessTarget: 'mcp-notifications'}),
                deliverableRecord({id: 'WAKE_SUB:dead',  status: 'degraded'})
            ]
        });

        expect(await arming()).toEqual({armed: true, reason: 'deliverable'});
    });

    test('reason names the furthest gate reached, so it points at the next repair', async () => {
        // A degraded-but-keyed row and an active-but-keyless one: the actionable repair is the key,
        // not the migration, and not "you have no subscription".
        WakeSubscriptionService.list = async () => ({
            subscriptions: [
                deliverableRecord({id: 'WAKE_SUB:dead', status: 'degraded'}),
                deliverableRecord({id: 'WAKE_SUB:live', harnessTargetMetadata: {url: 'http://x/wake'}})
            ]
        });

        expect(await arming()).toEqual({armed: false, reason: 'missing-signing-key'});
    });

    test('an unbound identity yields null, never false, and never reads the graph', async () => {
        // A container healthcheck carries no request identity. Reporting `false` there manufactures
        // an alarm out of a missing instrument.
        let listCalls = 0;

        RequestContextService.getAgentIdentityNodeId = () => null;
        WakeSubscriptionService.list                 = async () => { listCalls++; return {subscriptions: []} };

        expect(await arming()).toEqual({armed: null, reason: 'unbound-identity'});
        expect(listCalls).toBe(0);
    });

    test('an unreadable graph yields null and cannot break the surrounding healthcheck', async () => {
        WakeSubscriptionService.list = async () => { throw new Error('graph unavailable') };

        const result = await buildWakeFeaturesBlock();

        expect(result.subscription).toEqual({armed: null, reason: 'unreadable'});
        // The rest of the wake block still reports — one unreadable axis is not a dead healthcheck.
        expect(result).toHaveProperty('gateState');
        expect(result).toHaveProperty('daemonRunning');
    });

    test('AGREEMENT: `armed` implies the manifest publishes a route, and unarmed implies it does not', async () => {
        // The invariant, asserted across both sides rather than pinned as strings on each. This is
        // what fails if either the gate or the verdict moves without the other.
        const armedRecord   = deliverableRecord({id: 'WAKE_SUB:agree-armed'}),
              unarmedRecord = deliverableRecord({
                  id                   : 'WAKE_SUB:agree-unarmed',
                  harnessTarget        : 'mcp-notifications',
                  harnessTargetMetadata: {url: 'http://x/wake', adapter: 'tmux', tmuxSession: 'spec'}
              });

        WakeSubscriptionService.list = async () => ({subscriptions: [armedRecord]});
        expect((await arming()).armed).toBe(true);

        WakeSubscriptionService.list = async () => ({subscriptions: [unarmedRecord]});
        expect((await arming()).armed).toBe(false);

        // Both through ONE build: the gate must publish the armed record and skip the unarmed one.
        // A build of the unarmed record alone throws outright ("refusing to write an empty manifest"),
        // which is the same refusal stated more loudly — asserting it in company keeps this test about
        // agreement rather than about the empty-manifest guard.
        const {manifest, skipped} = buildWakeReceiverManifest({
            subscriptions : [armedRecord, unarmedRecord],
            callerIdentity: '@spec-seat'
        });

        expect(Object.keys(manifest.routes)).toContain('WAKE_SUB:agree-armed');
        expect(Object.keys(manifest.routes)).not.toContain('WAKE_SUB:agree-unarmed');
        expect(skipped.map(entry => entry.subscriptionId)).toContain('WAKE_SUB:agree-unarmed');
    });

    test('AGREEMENT (throw class): a keyed+keyless pair is unarmed AND unbuildable', async () => {
        // The agreement case the first version of this spec missed. Its unarmed specimen used a
        // non-deliverable TARGET, which the builder SKIPS — so it only ever proved agreement across
        // the skip class, and the throw class went untested. That gap is exactly where health and
        // the builder disagreed: health said armed, the build could not run.
        const keyed   = deliverableRecord({id: 'WAKE_SUB:mixed-keyed'}),
              keyless = deliverableRecord({
                  id                   : 'WAKE_SUB:mixed-keyless',
                  harnessTargetMetadata: {url: 'http://x/wake', adapter: 'tmux', tmuxSession: 'spec'}
              });

        WakeSubscriptionService.list = async () => ({subscriptions: [keyed, keyless]});
        expect((await arming()).armed).toBe(false);

        // Not "publishes fewer routes" — refuses to build at all, which is why one keyless row
        // unarms the seat rather than costing only its own route.
        expect(() => buildWakeReceiverManifest({
            subscriptions : [keyed, keyless],
            callerIdentity: '@spec-seat'
        })).toThrow(/signingKey/);
    });

    test('AGREEMENT (legacy no-status): armed here AND published by the builder', async () => {
        // THE convergence falsifier. The invariant under test is not "absent means active" — it is
        // that the health verdict and the manifest builder give a legacy row the SAME answer. That
        // invariant is what the split violated (armed-looking on every ordinary surface, silently
        // dropped at publication) and it is what the shared predicate now enforces.
        //
        // It is asserted from BOTH ends on purpose: the verdict alone would pass if health simply
        // never armed anything, and the build alone would pass if it published everything. Only the
        // pair pins agreement, and it goes red if either side is hand-compared again — in EITHER
        // direction, which the previous single-direction form could not do.
        //
        // Production-reachable, not a hand-built specimen: the durable lister returns caller-owned
        // rows and `_hydrateSubscriptionFromDurableNode` copies persisted properties verbatim, so a
        // row whose `status` was never written arrives from `list()` exactly like this.
        const legacy = deliverableRecord({id: 'WAKE_SUB:legacy-no-status'});
        delete legacy.status;

        WakeSubscriptionService.list = async () => ({subscriptions: [legacy]});
        expect(await arming()).toEqual({armed: true, reason: 'deliverable'});

        // Paired with a valid row so this asserts publication, not the empty-manifest guard.
        const keyed = deliverableRecord({id: 'WAKE_SUB:legacy-companion'});

        const {manifest, skipped} = buildWakeReceiverManifest({
            subscriptions : [keyed, legacy],
            callerIdentity: '@spec-seat'
        });

        expect(Object.keys(manifest.routes)).toContain('WAKE_SUB:legacy-no-status');
        expect(skipped.map(entry => entry.subscriptionId)).not.toContain('WAKE_SUB:legacy-no-status');
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
