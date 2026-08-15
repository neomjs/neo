import {test, expect}                      from '@playwright/test';
import Neo                                 from '../../../../../../../src/Neo.mjs';
import ConfigProvider, {createConfigProxy} from '../../../../../../../ai/ConfigProvider.mjs';
import RootConfigBase                      from '../../../../../../../ai/configBase.mjs';

test.describe('Knowledge Base Config Tier-1 defaults (#11963)', () => {
    let originalEnv;
    let config;
    let originalTier1Config;
    let originalTier1ClassHierarchy;
    let originalConfig;
    let originalClassHierarchy;
    let tier1Template;
    let tier1Root;
    let tier1Config;

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

        // Deterministic realm root: KB now inherits backupPath / auth.* /
        // dummyEmbeddingFunction from Tier-1 via the getParent() chain. A reused Playwright worker
        // may have the Tier-1 module cached after the registry entry was cleared, so install the
        // fresh root BEFORE the child base evaluates and snapshots its Tier-1-derived defaults.
        tier1Template = (await import('../../../../../../../ai/config.template.mjs')).default;
        Neo.ai        = Neo.ai || {};
        delete Neo.ai.Config;
        tier1Root     = Neo.create(RootConfigBase);
        Neo.ai.Config = tier1Root;
        tier1Config   = createConfigProxy(tier1Root);
        config        = (await import('../../../../../../../ai/mcp/server/knowledge-base/config.template.mjs')).default;
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

        tier1Config.destroy();

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
        expect(config.auth.host).toBe(tier1Config.auth.host);
        expect(config.auth.port).toBe(tier1Config.auth.port);
        expect(config.auth.realm).toBe(tier1Config.auth.realm);
        expect(config.auth.issuerUrl).toBe(tier1Config.auth.issuerUrl);
        expect(config.auth.clientId).toBe(tier1Config.auth.clientId);
        expect(config.auth.clientSecret).toBe(tier1Config.auth.clientSecret);
        expect(config.auth.trustProxyIdentity).toBe(tier1Config.auth.trustProxyIdentity);
        expect(config.backupPath).toBe(tier1Config.backupPath);

        // KB-local leaves snapshot the active Tier-1 Chroma endpoint as top-level aliases
        // (pending the S3/S4 consumer codemod to engines.chroma.*). Under UNIT_TEST_MODE that
        // active endpoint is the isolated unit-test daemon; collection + path are genuinely KB-owned.
        expect(tier1Template.engines.chroma.host).toBe(tier1Template.engines.chroma.hostTest);
        expect(tier1Template.engines.chroma.port).toBe(tier1Template.engines.chroma.portTest);
        expect(config.host).toBe(tier1Template.engines.chroma.host);
        expect(config.port).toBe(tier1Template.engines.chroma.port);
        expect(config.collectionName).toBe('neo-knowledge-base');
        expect(config.path).toBe(tier1Template.engines.chroma.dataDir);
        expect(tier1Template.engines.chroma.dataDir).toBe(tier1Template.engines.chroma.dataDirTest);
        expect(config.collectionResolveRetry.maxAttempts).toBe(10);
        expect(config.collectionResolveRetry.initialDelayMs).toBe(500);
        expect(config.collectionResolveRetry.maxDelayMs).toBe(2000);
        expect(config.collectionResolveRetry.maxTotalDelayMs).toBe(15000);
        expect(config.memoryCoreDbUseTestDatabase).toBe(true);
        expect(config.memoryCoreDbUseTestHarness).toBe(true);
        expect(config.memoryCoreDbPath).toBe(config.memoryCoreDbPathTest);
        expect(config.memoryCoreDbPath).not.toBe(config.memoryCoreDbPathProd);
    });

    test('env overrides win — KB-local leaves at the child, Tier-1-owned leaves at the owner (inherited)', () => {
        process.env.NEO_DEBUG       = 'true';
        process.env.NEO_CHROMA_HOST = 'chroma';
        process.env.NEO_CHROMA_PORT = '8010';
        process.env.NEO_AUTH_REALM  = 'tenant-realm';
        process.env.NEO_BACKUP_PATH = '/tmp/neo-kb-backups';
        process.env.NEO_KB_EMBEDDING_RESUME_STATE_DIR = '/tmp/neo-kb-resume';

        // KB-LOCAL leaves (Chroma host/port) — env applies at the CHILD instance directly.
        // Fresh isolated instance (not the module-cached singleton, whose reactive state is
        // contaminated by sibling specs). config._data carries the raw KB meta-leaf tree.
        const freshKB = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

        // TIER-1-OWNED leaves (auth.*, backupPath) — post-split the child no longer declares them,
        // so env precedence lives at the OWNER. Build a fresh realm root WITH the env set and
        // register it so the child inherits the override up the getParent() chain.
        const prevRoot = Neo.ai?.Config;
        delete Neo.ai.Config;
        const freshRoot = Neo.create(RootConfigBase);
        Neo.ai.Config   = freshRoot;

        try {
            expect(freshKB.debug).toBe(true);                       // KB-local, env at child
            expect(freshKB.host).toBe('chroma');                    // KB-local, env at child
            expect(freshKB.port).toBe(8010);                        // KB-local, env at child
            expect(freshKB.embeddingResumeStateDir).toBe('/tmp/neo-kb-resume');
            expect(freshKB.auth.realm).toBe('tenant-realm');        // Tier-1-owned, env at owner → inherited
            expect(freshKB.backupPath).toBe('/tmp/neo-kb-backups'); // Tier-1-owned → inherited
        } finally {
            if (prevRoot === undefined) {delete Neo.ai.Config} else {Neo.ai.Config = prevRoot}
            freshKB.destroy();
            freshRoot.destroy();
        }
    });

    test('embedding-batch recovery levers keep their defaults when no env is set', () => {
        // The defaults are correct for a healthy plane and this change adds reachability, not new
        // behavior. A deployment that sets none of the three must be byte-identical to before.
        delete process.env.NEO_KB_EMBEDDING_BATCH_SIZE;
        delete process.env.NEO_KB_EMBEDDING_BATCH_DELAY_MS;
        delete process.env.NEO_KB_EMBEDDING_MAX_RETRIES;

        const defaultKB = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

        try {
            expect(defaultKB.batchSize) .toBe(50);
            expect(defaultKB.batchDelay).toBe(10000);
            expect(defaultKB.maxRetries).toBe(5);
        } finally {
            defaultKB.destroy();
        }
    });

    test('embedding-batch recovery levers are env-overridable so an operator can shrink the durable unit', () => {
        // `batchSize` is the durable unit ON THE FAILURE ARM: `VectorService.embedChunks` embeds a
        // whole slice in one provider call and upserts only after it returns, so a provider failure
        // loses the whole slice. (A cooperative yield is the exception — it persists the prefix it
        // already paid for.) Every dial shaping an individual provider request was already reachable
        // (`NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_CHUNK_SIZE`, the timeouts) while every dial shaping
        // the unit that must succeed together was not — so an operator whose corpus will not start
        // could make each request smaller and still not shrink the bet. These three close that.
        process.env.NEO_KB_EMBEDDING_BATCH_SIZE       = '1';
        process.env.NEO_KB_EMBEDDING_BATCH_DELAY_MS   = '0';
        process.env.NEO_KB_EMBEDDING_MAX_RETRIES      = '2';
        process.env.NEO_KB_EMBEDDING_BACKOFF_BASE_MS  = '1';

        const freshKB = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

        try {
            // Typed as numbers by the leaf's own env decoding — a string here would mean the `'number'`
            // type argument was dropped, which reads correct and silently breaks the `i += batchSize`
            // loop arithmetic.
            expect(freshKB.batchSize)    .toBe(1);
            expect(freshKB.batchDelay)   .toBe(0);
            expect(freshKB.maxRetries)   .toBe(2);
            // The override the unit harness itself relies on: pinning the base to 1ms is what lets a
            // spec keep production's retry DEPTH while paying none of its wall clock.
            expect(freshKB.backoffBaseMs).toBe(1);
        } finally {
            delete process.env.NEO_KB_EMBEDDING_BATCH_SIZE;
            delete process.env.NEO_KB_EMBEDDING_BATCH_DELAY_MS;
            delete process.env.NEO_KB_EMBEDDING_MAX_RETRIES;
            delete process.env.NEO_KB_EMBEDDING_BACKOFF_BASE_MS;
            freshKB.destroy();
        }
    });

    test('embedding-batch levers REFUSE operationally invalid values rather than accepting them as smaller', () => {
        // Making a knob reachable makes its whole domain reachable. `number` would accept every value
        // below, and each one breaks the consumer in a way that does not look like a config error:
        // `batchSize: 0` is the loop stride, so `i += 0` never advances and the sweep hangs forever;
        // `maxRetries: 0` skips the retry loop entirely and returns a clean zero-embedded result with
        // no provider call at all. Neither is a "smaller" setting — they are broken ones, which is why
        // the domain lives on the leaf type (as `port`'s does) rather than in a consumer-side guard.
        process.env.NEO_KB_EMBEDDING_BATCH_SIZE      = '0';
        process.env.NEO_KB_EMBEDDING_MAX_RETRIES     = '0';
        process.env.NEO_KB_EMBEDDING_BATCH_DELAY_MS  = '-1';
        process.env.NEO_KB_EMBEDDING_BACKOFF_BASE_MS = '-1';

        const invalidKB = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

        try {
            expect(invalidKB.batchSize) .toBe(50);
            expect(invalidKB.maxRetries).toBe(5);
            expect(invalidKB.batchDelay).toBe(10000);
            // A negative base does not make the ladder gentler — `base * 2 ** n` schedules every retry
            // in the past, so the backoff silently stops being a backoff. Under the loose `'number'`
            // domain this branch shipped accepting it.
            expect(invalidKB.backoffBaseMs).toBe(1000);
        } finally {
            delete process.env.NEO_KB_EMBEDDING_BATCH_SIZE;
            delete process.env.NEO_KB_EMBEDDING_MAX_RETRIES;
            delete process.env.NEO_KB_EMBEDDING_BATCH_DELAY_MS;
            delete process.env.NEO_KB_EMBEDDING_BACKOFF_BASE_MS;
            invalidKB.destroy();
        }

        process.env.NEO_KB_EMBEDDING_BACKOFF_BASE_MS = '1.5';

        const fractionalKB = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

        try {
            // The second half of the delay domain, and the reason `'number'` was the wrong choice
            // rather than merely a loose one: a fractional base yields sub-millisecond timers the
            // runtime rounds on its own terms, so the configured ladder and the observed one diverge
            // with nothing reporting it.
            expect(fractionalKB.backoffBaseMs).toBe(1000);
        } finally {
            delete process.env.NEO_KB_EMBEDDING_BACKOFF_BASE_MS;
            fractionalKB.destroy();
        }
    });

    test('MUTATION-BINDING — a FRACTIONAL value is refused, which is what makes the integer check load-bearing', () => {
        // This test exists because the suite above did NOT bind the implementation. @neo-gpt-emmy
        // replaced `Number.isInteger` with `Number.isFinite` in an exact-head tree and the focused
        // suite stayed 11/11 green: every value it exercised (0, 0, -1) is rejected by BOTH predicates
        // on the `< min` branch alone, so the integer check was never the reason anything failed.
        //
        // A fraction is the single input that separates them. `2.5` is finite and >= min, so only
        // `Number.isInteger` refuses it — swap the predicate and this test reddens, which is the
        // property the previous negative matrix claimed and did not have.
        //
        // It is not a pedantic case either: `batchSize` is a loop stride (`i += 2.5` desynchronises
        // every slice boundary) and `maxRetries` is a countdown bound.
        process.env.NEO_KB_EMBEDDING_BATCH_SIZE     = '2.5';
        process.env.NEO_KB_EMBEDDING_MAX_RETRIES    = '1.5';
        process.env.NEO_KB_EMBEDDING_BATCH_DELAY_MS = '10.25';

        const fractionalKB = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

        try {
            expect(fractionalKB.batchSize) .toBe(50);
            expect(fractionalKB.maxRetries).toBe(5);
            expect(fractionalKB.batchDelay).toBe(10000);
        } finally {
            delete process.env.NEO_KB_EMBEDDING_BATCH_SIZE;
            delete process.env.NEO_KB_EMBEDDING_MAX_RETRIES;
            delete process.env.NEO_KB_EMBEDDING_BATCH_DELAY_MS;
            fractionalKB.destroy();
        }
    });

    test('MUTATION-BINDING — non-finite and non-numeric values fall back rather than poisoning the config', () => {
        // The other untested half. `Number('Infinity')` is finite-checked away, but `Number('abc')` is
        // NaN and NaN fails every comparison silently — `NaN < min` is false, so a predicate that
        // only compared bounds would ADMIT it and hand the consumer a NaN stride. The loop would then
        // neither advance nor throw.
        for (const [raw, label] of [['Infinity', 'Infinity'], ['-Infinity', '-Infinity'], ['NaN', 'NaN'], ['abc', 'non-numeric'], ['', 'empty']]) {
            process.env.NEO_KB_EMBEDDING_BATCH_SIZE = raw;

            const poisonKB = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

            try {
                expect(poisonKB.batchSize, `${label} must fall back to the leaf default`).toBe(50);
                expect(Number.isInteger(poisonKB.batchSize), `${label} must not yield a non-integer`).toBe(true);
            } finally {
                delete process.env.NEO_KB_EMBEDDING_BATCH_SIZE;
                poisonKB.destroy();
            }
        }
    });

    test('batchDelay accepts 0 — it is a legitimate setting, not an invalid one', () => {
        // The distinction the two types encode. Step 3.6 of the operator runbook explicitly tells an
        // operator to set this to 0 when shrinking the batch, so rejecting it would break the
        // documented recovery procedure. `positiveInt` for a stride, `nonNegativeInt` for a delay.
        process.env.NEO_KB_EMBEDDING_BATCH_DELAY_MS = '0';

        const zeroDelayKB = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

        try {
            expect(zeroDelayKB.batchDelay).toBe(0);
        } finally {
            delete process.env.NEO_KB_EMBEDDING_BATCH_DELAY_MS;
            zeroDelayKB.destroy();
        }
    });

    test('keeps debug off by default and accepts NEO_DEBUG as a KB-local override', () => {
        const defaultKB = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

        try {
            expect(defaultKB.debug).toBe(false);
        } finally {
            defaultKB.destroy();
        }

        process.env.NEO_DEBUG = 'true';

        const freshKB = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

        try {
            expect(freshKB.debug).toBe(true);
        } finally {
            freshKB.destroy();
        }
    });

    test('constructs the canonical server transport values from default and env input', () => {
        const defaultKB = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

        try {
            expect(defaultKB.transport).toBe('stdio');
        } finally {
            defaultKB.destroy();
        }

        process.env.NEO_TRANSPORT = 'streamable-http';

        const remoteKB = createConfigProxy(Neo.create(ConfigProvider, {data: config._data}));

        try {
            expect(remoteKB.transport).toBe('streamable-http');
        } finally {
            remoteKB.destroy();
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
            freshKB?.destroy();
        }
    });
});
