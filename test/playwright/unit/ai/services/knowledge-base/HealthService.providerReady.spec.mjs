import {setup} from '../../../../setup.mjs';

const appName = 'KBHealthServiceProviderReadyTest';

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

import {test, expect}  from '@playwright/test';
import {createHash}    from 'crypto';
import {readFileSync}  from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';

const
    testDir            = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot           = path.resolve(testDir, '../../../../../../'),
    sharedConfigPath   = path.resolve(repoRoot, 'ai/config.mjs'),
    kbServerConfigPath = path.resolve(repoRoot, 'ai/mcp/server/knowledge-base/config.mjs');

function createFileDigest(filePath) {
    const contents = readFileSync(filePath);

    return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
}

async function startHealthyEmbeddingProbe(HealthService, overrides = {}) {
    return HealthService.startEmbeddingProbe({
        cadenceMs    : 1000,
        scheduler    : () => 0,
        clearSchedule: () => {},
        keyFor       : () => 'test-provider:3',
        runProbe     : async () => ({
            status            : 'healthy',
            provider          : 'test-provider',
            dimensions        : 3,
            expectedDimensions: 3,
            durationMs        : 1
        }),
        ...overrides
    });
}

test.describe('Neo.ai.services.knowledge-base.HealthService observed embedding readiness (#16691)', () => {
    let HealthService, ChromaManager, DatabaseLifecycleService, buildKnowledgeBaseEmbeddingProbeBlock;
    let originalClient, originalGetCollection, originalGetDbStatus;

    test.beforeAll(async () => {
        const healthModule = await import('../../../../../../ai/services/knowledge-base/HealthService.mjs');

        HealthService                            = healthModule.default;
        buildKnowledgeBaseEmbeddingProbeBlock    = healthModule.buildKnowledgeBaseEmbeddingProbeBlock;
        ChromaManager                            = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;
        DatabaseLifecycleService                 = (await import('../../../../../../ai/services/knowledge-base/DatabaseLifecycleService.mjs')).default;
    });

    test.beforeEach(() => {
        originalClient        = ChromaManager.client;
        originalGetCollection = ChromaManager.getKnowledgeBaseCollection;
        originalGetDbStatus   = DatabaseLifecycleService.getDatabaseStatus;

        ChromaManager.client                       = {heartbeat: async () => ({})};
        ChromaManager.getKnowledgeBaseCollection   = async () => ({count: async () => 1});
        DatabaseLifecycleService.getDatabaseStatus = () => ({status: 'mocked'});

        HealthService.clearEmbeddingProbeProducer();
        HealthService.clearCache();
    });

    test.afterEach(() => {
        ChromaManager.client                       = originalClient;
        ChromaManager.getKnowledgeBaseCollection   = originalGetCollection;
        DatabaseLifecycleService.getDatabaseStatus = originalGetDbStatus;

        HealthService.clearEmbeddingProbeProducer();
        HealthService.clearCache();
    });

    test('fails closed with a named null observation before the lifecycle producer starts', async () => {
        const health = await HealthService.healthcheck();

        expect(health.status).toBe('degraded');
        expect(health.features.embedding).toBeNull();
        expect(health.details.join(' ')).toContain('Knowledge Base embedding probe unavailable');
        expect(health.details.join(' ')).toContain('no embedding observation exists');
        expect(health.details).not.toContain('All features are operational');
        await expect(HealthService.ensureHealthy()).rejects.toThrow('Knowledge Base is not fully operational');
    });

    test('publishes healthy only after a real vector observation and health reads stay pure', async () => {
        let probeRuns = 0;

        await startHealthyEmbeddingProbe(HealthService, {
            runProbe: async () => {
                probeRuns++;
                return {
                    status            : 'healthy',
                    provider          : 'test-provider',
                    dimensions        : 3,
                    expectedDimensions: 3,
                    durationMs        : 1
                };
            }
        });

        const health = await HealthService.healthcheck();

        expect(health.status).toBe('healthy');
        expect(health.features.embedding).toBe(true);
        expect(health.details).toContain('All features are operational');
        await expect(HealthService.ensureHealthy()).resolves.toBeUndefined();
        await HealthService.healthcheck();
        expect(probeRuns).toBe(1);
    });

    /**
     * @summary A slow attempt IN FLIGHT is the loop running — and the report of it has to REACH a
     * surface. Caught by @neo-gpt-emmy: my first cut stopped the false `stale` here but dropped the
     * `slow` signal in the healthy branch, trading a false RED for silence.
     *
     * Silence is the other half of the same defect. The reason a slow loop was mistaken for a dead
     * one is that nothing said "slow" — so a fix that only removes the wrong word, without supplying
     * the right one, leaves the reader exactly as misinformed.
     */
    test('an IN-FLIGHT slow probe is reported as slow, and that report REACHES the health payload', async () => {
        let t = 1_000_000, settle;

        await startHealthyEmbeddingProbe(HealthService, {clock: () => t, timeoutMs: 900000});

        t += 400000; // age the cache past the bar BEFORE the flight starts, so the two can diverge

        // Re-arm with a body that never settles, putting one attempt in flight.
        HealthService.startEmbeddingProbe({
            cadenceMs    : 1000,
            healthyTtlMs : 1000,
            timeoutMs    : 900000,
            scheduler    : () => 0,
            clearSchedule: () => {},
            keyFor       : () => 'test-provider:3',
            clock        : () => t,
            runProbe     : () => new Promise(resolve => { settle = resolve })
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        t += 20000; // flight 20s old, well inside its 900s budget: slow, not stuck

        const health = await HealthService.healthcheck();

        expect(health.details.some(d => d.includes('is stale')), 'a running loop is not a stopped one').toBe(false);
        expect(health.details.some(d => d.startsWith('Knowledge Base embedding probe slow')), 'and the slowness reaches the payload').toBe(true);
        expect(health.features.embedding, 'slow is not broken — the feature still works').toBe(true);

        settle?.({status: 'healthy', provider: 'test-provider', dimensions: 3, expectedDimensions: 3, durationMs: 1});
    });

    test('a STUCK probe past its own budget reports stale — suppression is bounded by flight AGE', async () => {
        let t = 1_000_000, settle;

        await startHealthyEmbeddingProbe(HealthService, {clock: () => t, timeoutMs: 30000});

        // Age the CACHE past the staleness bar BEFORE the flight starts, so cache-age and flight-age
        // can diverge. They advance together otherwise, and a test where they cannot diverge cannot
        // distinguish the two conditions it exists to separate.
        t += 400000;

        HealthService.startEmbeddingProbe({
            cadenceMs    : 1000,
            healthyTtlMs : 1000,
            timeoutMs    : 30000,
            scheduler    : () => 0,
            clearSchedule: () => {},
            keyFor       : () => 'test-provider:3',
            clock        : () => t,
            runProbe     : () => new Promise(resolve => { settle = resolve })
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        t += 20000; // flight 20s old — inside its 30s budget

        const slow = await HealthService.healthcheck();

        expect(slow.details.some(d => d.startsWith('Knowledge Base embedding probe slow'))).toBe(true);

        t += 600000; // now far past the budget — the deadline never fired

        HealthService.clearCache();

        const stuck = await HealthService.healthcheck();

        expect(stuck.details.some(d => d.includes('STUCK in flight')), 'past its budget it is stuck, not slow').toBe(true);
        expect(stuck.details.some(d => d.startsWith('Knowledge Base embedding probe slow')), 'a hung probe must not read as merely slow forever').toBe(false);

        settle?.({status: 'healthy', provider: 'test-provider', dimensions: 3, expectedDimensions: 3, durationMs: 1});
    });

    test('a DEAD probe loop with nothing in flight still reports stale — the fix must not hide it', async () => {
        let t = 1_000_000;

        await startHealthyEmbeddingProbe(HealthService, {clock: () => t}); // scheduler never fires again

        t += 900000;

        const health = await HealthService.healthcheck();

        expect(health.details.some(d => d.includes('is stale')), 'NON-VACUITY: a true dead loop is still caught').toBe(true);
        expect(health.details.some(d => d.includes('no attempt in flight'))).toBe(true);
        expect(health.details.some(d => d.startsWith('Knowledge Base embedding probe slow')), 'a dead loop is not reported as merely slow').toBe(false);
    });

    test('the first settled timeout degrades immediately and closes ensureHealthy()', async () => {
        await HealthService.startEmbeddingProbe({
            cadenceMs      : 1000,
            failureTtlMs   : 1000,
            failureTtlMaxMs: 1000,
            scheduler      : () => 0,
            clearSchedule  : () => {},
            keyFor         : () => 'test-provider:3',
            runProbe       : async () => ({
                status             : 'failed',
                error              : 'consumer-probe-timeout:EMBEDDING_PROBE_TIMEOUT',
                errorClassification: 'consumer-probe-timeout',
                errorCode          : 'EMBEDDING_PROBE_TIMEOUT'
            })
        });

        const health = await HealthService.healthcheck();

        expect(health.status).toBe('degraded');
        expect(health.features.embedding).toBe(false);
        expect(health.details.join(' ')).toContain('consumer-probe-timeout:EMBEDDING_PROBE_TIMEOUT');
        expect(health.details.join(' ')).toContain('streak 1');
        expect(health.details.join(' ')).toContain('deadline 30000ms');
        await expect(HealthService.ensureHealthy()).rejects.toThrow('Knowledge Base embedding probe failed');
    });

    test('a cached-green database payload degrades immediately when the producer later fails', async () => {
        let fail = false;
        let scheduledTick;

        await HealthService.startEmbeddingProbe({
            cadenceMs   : 1000,
            failureTtlMs: 1000,
            scheduler   : callback => {
                scheduledTick = callback;
                return 0;
            },
            clearSchedule: () => {},
            keyFor       : () => 'test-provider:3',
            runProbe     : async () => fail ? {
                status: 'failed',
                error : 'provider-failure:EMBEDDING_PROVIDER_ERROR'
            } : {
                status            : 'healthy',
                provider          : 'test-provider',
                dimensions        : 3,
                expectedDimensions: 3,
                durationMs        : 1
            }
        });

        const cachedGreen = await HealthService.healthcheck();
        expect(cachedGreen.status).toBe('healthy');

        fail = true;
        await scheduledTick();

        const degraded = await HealthService.healthcheck();
        expect(degraded.status).toBe('degraded');
        expect(degraded.features.embedding).toBe(false);
        expect(degraded.details).not.toContain('All features are operational');
        expect(degraded.details.join(' ')).toContain('provider-failure:EMBEDDING_PROVIDER_ERROR');
    });

    test('a reachable provider that never answers is bounded by the named consumer deadline', async () => {
        let observedOptions;
        const result = await buildKnowledgeBaseEmbeddingProbeBlock({
            cfg: {
                embeddingProvider: 'test-provider',
                vectorDimension  : 3
            },
            embedText: (input, provider, options) => {
                observedOptions = options;
                return new Promise(() => {});
            },
            timeoutMs: 5
        });

        expect(result).toMatchObject({
            status             : 'failed',
            provider           : 'test-provider',
            error              : 'consumer-probe-timeout:EMBEDDING_PROBE_TIMEOUT',
            errorClassification: 'consumer-probe-timeout',
            errorCode          : 'EMBEDDING_PROBE_TIMEOUT'
        });
        expect(observedOptions).toMatchObject({
            operationStage: 'embedding-canary',
            service       : 'knowledge-base'
        });
    });

    test('public receipts distinguish transport refusal and a non-resident embedding model', async () => {
        const probeFailure = async code => buildKnowledgeBaseEmbeddingProbeBlock({
            cfg: {
                embeddingProvider: 'test-provider',
                vectorDimension  : 3
            },
            embedText: async () => {
                const error = new Error('provider-controlled detail must not cross the health boundary');

                error.code = code;
                throw error;
            },
            timeoutMs: 5
        });

        const [connectionRefused, modelNotResident] = await Promise.all([
            probeFailure('ECONNREFUSED'),
            probeFailure('EMBEDDING_MODEL_NOT_RESIDENT')
        ]);

        expect(connectionRefused).toMatchObject({
            error              : 'provider-unreachable:ECONNREFUSED',
            errorClassification: 'provider-unreachable',
            errorCode          : 'ECONNREFUSED'
        });
        expect(modelNotResident).toMatchObject({
            error              : 'model-not-resident:EMBEDDING_MODEL_NOT_RESIDENT',
            errorClassification: 'model-not-resident',
            errorCode          : 'EMBEDDING_MODEL_NOT_RESIDENT'
        });
        expect(JSON.stringify({connectionRefused, modelNotResident})).not.toContain('provider-controlled detail');
    });

    test('public health separates a probe that could not run from a provider that did not answer', async () => {
        const common = {
            cadenceMs      : 1000,
            timeoutMs      : 5,
            failureTtlMs   : 1000,
            failureTtlMaxMs: 1000,
            scheduler      : () => 0,
            clearSchedule  : () => {},
            keyFor         : () => 'test-provider:3'
        };

        await HealthService.startEmbeddingProbe({
            ...common,
            runProbe: () => buildKnowledgeBaseEmbeddingProbeBlock({
                cfg: {
                    embeddingProvider: 'test-provider',
                    vectorDimension  : 3
                },
                embedText: () => new Promise(() => {}),
                timeoutMs: 5
            })
        });

        const didNotAnswer        = await HealthService.healthcheck(),
              didNotAnswerDetails = didNotAnswer.details.join(' ');

        expect(didNotAnswer.status).toBe('degraded');
        expect(didNotAnswer.features.embedding).toBe(false);
        expect(didNotAnswerDetails).toContain('consumer-probe-timeout:EMBEDDING_PROBE_TIMEOUT');

        HealthService.clearEmbeddingProbeProducer();
        HealthService.clearCache();

        await HealthService.startEmbeddingProbe({
            ...common,
            runProbe: async () => {
                throw new Error('fixture probe body cannot execute');
            }
        });

        const couldNotRun        = await HealthService.healthcheck(),
              couldNotRunDetails = couldNotRun.details.join(' ');

        expect(couldNotRun.status).toBe('degraded');
        expect(couldNotRun.features.embedding).toBe(false);
        expect(couldNotRunDetails).toContain('probe-could-not-run:EMBEDDING_PROBE_EXECUTION_ERROR');
        expect(couldNotRunDetails).not.toBe(didNotAnswerDetails);
    });

    test('scheduled demand inside failure backoff reuses truth instead of probing again', async () => {
        let now       = 1000;
        let probeRuns = 0;
        let scheduledTick;

        await HealthService.startEmbeddingProbe({
            cadenceMs      : 100,
            failureTtlMs   : 1000,
            failureTtlMaxMs: 1000,
            clock          : () => now,
            scheduler      : callback => {
                scheduledTick = callback;
                return 0;
            },
            clearSchedule: () => {},
            keyFor       : () => 'test-provider:3',
            runProbe     : async () => {
                probeRuns++;
                return {
                    status: 'failed',
                    error : 'provider-failure:EMBEDDING_PROVIDER_ERROR'
                };
            }
        });

        expect(probeRuns).toBe(1);

        HealthService.clearCache();
        now += 999;
        await scheduledTick();
        expect(probeRuns).toBe(1);

        now += 2;
        await scheduledTick();
        expect(probeRuns).toBe(2);
    });
});

test.describe('Neo.ai.services.knowledge-base.HealthService stale collection handle recovery (#13464)', () => {
    let HealthService, ChromaManager, DatabaseLifecycleService;
    let originalClient, originalGetCollection, originalGetDbStatus, originalInvalidateCache;

    const createNotFoundError = () => {
        const error = new Error('The requested resource could not be found');
        error.name  = 'ChromaNotFoundError';
        return error;
    };

    test.beforeAll(async () => {
        HealthService            = (await import('../../../../../../ai/services/knowledge-base/HealthService.mjs')).default;
        ChromaManager            = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;
        DatabaseLifecycleService = (await import('../../../../../../ai/services/knowledge-base/DatabaseLifecycleService.mjs')).default;
    });

    test.beforeEach(async () => {
        originalClient          = ChromaManager.client;
        originalGetCollection   = ChromaManager.getKnowledgeBaseCollection;
        originalGetDbStatus     = DatabaseLifecycleService.getDatabaseStatus;
        originalInvalidateCache = ChromaManager.invalidateKnowledgeBaseCollectionCache;

        ChromaManager.client = {heartbeat: async () => ({})};
        DatabaseLifecycleService.getDatabaseStatus = () => ({running: false});

        HealthService.clearEmbeddingProbeProducer();
        HealthService.clearCache();
        await startHealthyEmbeddingProbe(HealthService);
    });

    test.afterEach(() => {
        ChromaManager.client                         = originalClient;
        ChromaManager.getKnowledgeBaseCollection     = originalGetCollection;
        ChromaManager.invalidateKnowledgeBaseCollectionCache = originalInvalidateCache;
        DatabaseLifecycleService.getDatabaseStatus   = originalGetDbStatus;

        HealthService.clearEmbeddingProbeProducer();
        HealthService.clearCache();
    });

    test('retries once after a resolved collection handle fails with not-found', async () => {
        let collectionReads = 0;
        let invalidateCalls = 0;

        ChromaManager.invalidateKnowledgeBaseCollectionCache = () => {
            invalidateCalls++;
        };
        ChromaManager.getKnowledgeBaseCollection = async () => {
            collectionReads++;

            return {
                count: async () => {
                    if (collectionReads === 1) {
                        throw createNotFoundError();
                    }

                    return 42;
                }
            };
        };

        const health = await HealthService.healthcheck();

        expect(collectionReads).toBe(2);
        expect(invalidateCalls).toBe(1);
        expect(health.status).toBe('healthy');
        expect(health.database.connection.collections.knowledgeBase).toMatchObject({
            exists: true,
            count : 42
        });
        expect(health.features.embedding).toBe(true);
        expect(health.details).toContain('Connected to the orchestrator-managed ChromaDB instance');
    });

    test('reports degraded corpus readiness after retry fails without masking provider readiness', async () => {
        let collectionReads = 0;
        let invalidateCalls = 0;

        ChromaManager.invalidateKnowledgeBaseCollectionCache = () => {
            invalidateCalls++;
        };
        ChromaManager.getKnowledgeBaseCollection = async () => {
            collectionReads++;

            return {
                count: async () => {
                    throw createNotFoundError();
                }
            };
        };

        const health = await HealthService.healthcheck();

        expect(collectionReads).toBe(2);
        expect(invalidateCalls).toBe(1);
        expect(health.status).toBe('degraded');
        expect(health.features.embedding).toBe(true);
        expect(health.database.connection.connected).toBe(true);
        expect(health.database.connection.collections.knowledgeBase).toMatchObject({
            exists: false,
            count : 0,
            error : 'The requested resource could not be found'
        });
        expect(health.details).toContain('Failed to access collections: The requested resource could not be found');
        expect(health.details).not.toContain('All features are operational');

        await expect(HealthService.ensureHealthy()).rejects.toThrow('Knowledge Base is not fully operational');
    });
});

test.describe.serial('Neo.ai.services.knowledge-base.HealthService runtimeFreshness (#12774)', () => {
    let HealthService, ChromaManager, DatabaseLifecycleService,
        bootRuntimeIdentity, bootRuntimeFreshnessErrors;

    test.beforeAll(async () => {
        HealthService            = (await import('../../../../../../ai/services/knowledge-base/HealthService.mjs')).default;
        ChromaManager            = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;
        DatabaseLifecycleService = (await import('../../../../../../ai/services/knowledge-base/DatabaseLifecycleService.mjs')).default;
        bootRuntimeIdentity        = HealthService.bootRuntimeIdentity;
        bootRuntimeFreshnessErrors = HealthService.bootRuntimeFreshnessErrors;
    });

    test.afterEach(() => {
        HealthService.runtimeFreshnessReader = null;
        HealthService.runtimeFreshnessCacheDuration = 30 * 1000;
        HealthService.bootRuntimeIdentity        = bootRuntimeIdentity;
        HealthService.bootRuntimeFreshnessErrors = bootRuntimeFreshnessErrors;
        HealthService.clearEmbeddingProbeProducer();
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

    test('classifies stale config and OpenAPI identity with KB restart guidance', async () => {
        HealthService.runtimeFreshnessReader = async () => ({
            boot: {
                gitHead      : 'same-head',
                configDigest : 'sha256:old-config',
                openApiDigest: 'sha256:old-openapi'
            },
            current: {
                gitHead      : 'same-head',
                configDigest : 'sha256:new-config',
                openApiDigest: 'sha256:new-openapi'
            }
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result).toMatchObject({
            status: 'stale',
            stale : {
                configDigest : true,
                openApiDigest: true
            },
            hint: 'Restart or reconnect the Knowledge Base MCP server to refresh cached source, config, and tool definitions.'
        });
        expect(result.details[0]).toContain('Knowledge Base MCP server');
        expect(result.details[0]).toContain('configDigest');
    });

    test('does not track gitHead — injected gitHead drift is ignored entirely', async () => {
        // Knowledge Base supplies no rootDir to the shared tracker, so gitHead is never read or
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

    test('default reader digests shared Tier-1 config, not the KB per-server config', async () => {
        const kbServerConfigDigest = createFileDigest(kbServerConfigPath);

        expect(kbServerConfigDigest).not.toBe(createFileDigest(sharedConfigPath));

        HealthService.runtimeFreshnessCacheDuration = 0;
        HealthService.runtimeFreshnessReader = null;
        HealthService.bootRuntimeFreshnessErrors = [];
        HealthService.bootRuntimeIdentity = {
            configDigest: kbServerConfigDigest
        };
        HealthService.clearCache();

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result).toMatchObject({
            status: 'stale',
            stale : {
                configDigest: true
            }
        });
        expect(result.details[0]).toContain('configDigest');
    });

    test('cached healthy healthcheck reuses runtime freshness inside the short TTL', async () => {
        const originalClient        = ChromaManager.client,
              originalGetCollection = ChromaManager.getKnowledgeBaseCollection,
              originalGetDbStatus   = DatabaseLifecycleService.getDatabaseStatus;

        let currentConfigDigest = 'sha256:boot-config';
        let readCount           = 0;

        try {
            ChromaManager.client                       = {heartbeat: async () => ({})};
            ChromaManager.getKnowledgeBaseCollection   = async () => ({count: async () => 1});
            DatabaseLifecycleService.getDatabaseStatus = () => ({status: 'mocked'});
            await startHealthyEmbeddingProbe(HealthService);

            HealthService.runtimeFreshnessReader = async () => {
                readCount++;

                return {
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
                };
            };

            const cached = await HealthService.healthcheck();

            expect(cached.status).toBe('healthy');
            expect(cached.runtimeFreshness.status).toBe('current');
            expect(readCount).toBe(1);

            currentConfigDigest = 'sha256:changed-config';

            const reused = await HealthService.healthcheck();

            expect(reused.status).toBe('healthy');
            expect(reused.runtimeFreshness.status).toBe('current');
            expect(readCount).toBe(1);

            HealthService.runtimeFreshnessCacheDuration = 0;

            const refreshed = await HealthService.healthcheck();

            expect(refreshed.status).toBe('healthy');
            expect(refreshed.runtimeFreshness).toMatchObject({
                status: 'stale',
                stale : {
                    configDigest : true,
                    openApiDigest: false
                }
            });
            expect(readCount).toBe(2);
        } finally {
            ChromaManager.client                       = originalClient;
            ChromaManager.getKnowledgeBaseCollection   = originalGetCollection;
            DatabaseLifecycleService.getDatabaseStatus = originalGetDbStatus;
        }
    });
});
