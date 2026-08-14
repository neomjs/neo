import { test, expect } from '@playwright/test';
import {execFileSync}   from 'node:child_process';
import fs               from 'fs/promises';
import os               from 'os';
import path             from 'path';
import Neo              from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import ConfigProvider, {createConfigProxy, leaf} from '../../../../ai/ConfigProvider.mjs';
import RootConfigBase                            from '../../../../ai/configBase.mjs';
import {CHROMA_TEST_DATABASE}                    from '../../../../ai/services/shared/vector/chromaTestIsolation.mjs';
import Env                                       from '../../../../src/util/Env.mjs';

test.describe('Tier 1 Config Immutability', () => {
    let Config;
    let originalConfig;
    let originalClassHierarchy;

    const createIsolatedConfig = () => createConfigProxy(Neo.create(RootConfigBase));

    test.beforeAll(async () => {
        originalConfig         = Neo.ai?.Config;
        originalClassHierarchy = Neo.classHierarchyMap?.['Neo.ai.Config'];

        if (Neo.ai?.Config) {
            delete Neo.ai.Config;
        }
        if (Neo.classHierarchyMap?.['Neo.ai.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.Config'];
        }

        Config = (await import('../../../../ai/config.template.mjs')).default;
    });

    test.afterAll(() => {
        if (originalConfig !== undefined) {
            Neo.ai.Config = originalConfig;
        } else if (Neo.ai?.Config) {
            delete Neo.ai.Config;
        }

        if (originalClassHierarchy !== undefined) {
            Neo.classHierarchyMap['Neo.ai.Config'] = originalClassHierarchy;
        } else if (Neo.classHierarchyMap?.['Neo.ai.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.Config'];
        }
    });

    test('leaf defaults are not mutated by isolated instance writes (fresh instances get clean defaults)', async () => {
        const
            first       = createIsolatedConfig(),
            second      = createIsolatedConfig(),
            initialPort = second.mcpHttpPort;

        try {
            first.mcpHttpPort = 9999;

            expect(first.mcpHttpPort).toBe(9999);
            expect(second.mcpHttpPort).not.toBe(9999);
            expect(second.mcpHttpPort).toBe(initialPort);
            expect(Config.mcpHttpPort).toBe(initialPort);
        } finally {
            first.destroy();
            second.destroy();
        }
    });

    test('mcpHttpHost transport-host leaf owns the HOST env binding', () => {
        // Consumers (TransportService) read the resolved leaf; the env-override-with-default
        // behavior lives here on the leaf, so prove the binding resolves through it.
        expect(Config.mcpHttpHost).toBe(process.env.HOST || 'localhost');

        const fresh = createIsolatedConfig();

        try {
            fresh.setEnvOverride('HOST', 'internal-host');
            expect(fresh.mcpHttpHost).toBe('internal-host');
        } finally {
            fresh.destroy();
        }
    });

    test('mcpListenHost is opt-in and owns the listener-bind env contract', () => {
        expect(Config.mcpListenHost).toBe(process.env.NEO_MCP_LISTEN_HOST || null);

        const fresh = createIsolatedConfig();

        try {
            fresh.setEnvOverride('NEO_MCP_LISTEN_HOST', '127.0.0.1');
            expect(fresh.mcpListenHost).toBe('127.0.0.1');
        } finally {
            fresh.destroy();
        }
    });

    test('local-bearer readiness requires the declarative process-lifetime token leaf', () => {
        const fresh = createIsolatedConfig();

        try {
            fresh.setEnvOverride('NEO_AUTH_LOCAL_BEARER_TOKEN', '');

            const missing = fresh.validateRequiredEnv({
                consumerClaim: 'readiness',
                entrypoint   : 'neural-link-mcp',
                mode         : 'local-bearer'
            });

            expect(missing.ok).toBe(false);
            expect(missing.findings).toEqual([{
                consumerClaim: 'readiness',
                entrypoint   : 'neural-link-mcp',
                env          : 'NEO_AUTH_LOCAL_BEARER_TOKEN',
                leafPath     : 'auth.localBearerToken',
                mode         : 'local-bearer',
                reason       : 'Local-bearer readiness requires a process-lifetime possession credential.',
                valueState   : 'absent',
                disposition  : 'fail-closed'
            }]);

            fresh.setEnvOverride('NEO_AUTH_LOCAL_BEARER_TOKEN', 'configured-for-use-site-validation');
            expect(fresh.validateRequiredEnv({
                consumerClaim: 'readiness',
                entrypoint   : 'neural-link-mcp',
                mode         : 'local-bearer'
            })).toEqual({findings: [], ok: true});
        } finally {
            fresh.destroy();
        }
    });

    test('ships a machine-neutral orchestrator dev-sync root default', async () => {
        expect(Config.orchestrator.devSyncRoots).toEqual([]);
    });

    test('leaf-owned requiredness classifies entrypoint/mode readiness state (#13432)', () => {
        const envName          = 'NEO_UNIT_REQUIRED_ENV_VALIDATION_URL';
        const originalEnvValue = process.env[envName];
        delete process.env[envName];

        const requiredConfig = Neo.create(ConfigProvider, {
            data: {
                auth: {
                    gitlabApiBaseUrl: leaf('', envName, 'string', {
                        requiredFor: [{
                            entrypoints   : ['memory-core-mcp'],
                            modes         : ['gitlab-pat'],
                            consumerClaims: ['readiness'],
                            reason        : 'unit readiness requirement'
                        }]
                    })
                }
            }
        });

        try {
            const missing = requiredConfig.validateRequiredEnv({
                consumerClaim: 'readiness',
                entrypoint   : 'memory-core-mcp',
                mode         : 'gitlab-pat'
            });

            expect(missing.ok).toBe(false);
            expect(missing.findings).toEqual([{
                consumerClaim: 'readiness',
                entrypoint   : 'memory-core-mcp',
                env          : envName,
                leafPath     : 'auth.gitlabApiBaseUrl',
                mode         : 'gitlab-pat',
                reason       : 'unit readiness requirement',
                valueState   : 'absent',
                disposition  : 'fail-closed'
            }]);

            expect(requiredConfig.validateRequiredEnv({
                consumerClaim: 'readiness',
                entrypoint   : 'github-workflow-mcp',
                mode         : 'gitlab-pat'
            })).toEqual({findings: [], ok: true});
        } finally {
            if (originalEnvValue === undefined) {
                delete process.env[envName];
            } else {
                process.env[envName] = originalEnvValue;
            }
            requiredConfig.destroy();
        }
    });

    test('child configs validate inherited Tier-1 requiredness metadata (#13432)', () => {
        const
            envName          = 'NEO_UNIT_REQUIRED_ENV_VALIDATION_PARENT_URL',
            originalEnvValue = process.env[envName],
            previousRoot     = Neo.ai?.Config;

        delete process.env[envName];

        const rootConfig = Neo.create(ConfigProvider, {
            data: {
                auth: {
                    mode            : leaf('gitlab-pat', null, 'string'),
                    gitlabApiBaseUrl: leaf('', envName, 'string', {
                        requiredFor: [{
                            entrypoints   : ['wake-daemon'],
                            modes         : ['gitlab-pat'],
                            consumerClaims: ['readiness']
                        }]
                    })
                }
            }
        });
        const childConfig = Neo.create(ConfigProvider, {
            data: {
                wakeDaemon: {
                    enabled: leaf(true, null, 'boolean')
                }
            }
        });

        Neo.ai.Config = rootConfig;

        try {
            const result = childConfig.validateRequiredEnv({
                consumerClaim: 'readiness',
                entrypoint   : 'wake-daemon',
                mode         : 'gitlab-pat'
            });

            expect(result.ok).toBe(false);
            expect(result.findings).toHaveLength(1);
            expect(result.findings[0]).toMatchObject({
                env       : envName,
                leafPath  : 'auth.gitlabApiBaseUrl',
                valueState: 'absent'
            });
        } finally {
            Neo.ai.Config = previousRoot;
            if (originalEnvValue === undefined) {
                delete process.env[envName];
            } else {
                process.env[envName] = originalEnvValue;
            }
            rootConfig.destroy();
            childConfig.destroy();
        }
    });

    test('child configs validate requiredness against resolved child overrides (#13432)', () => {
        const
            envName      = 'NEO_UNIT_REQUIRED_ENV_VALIDATION_OVERRIDE_URL',
            previousRoot = Neo.ai?.Config;

        const rootConfig = Neo.create(ConfigProvider, {
            data: {
                auth: {
                    mode            : leaf('gitlab-pat', null, 'string'),
                    gitlabApiBaseUrl: leaf('', envName, 'string', {
                        requiredFor: [{
                            entrypoints   : ['memory-core-mcp'],
                            modes         : ['gitlab-pat'],
                            consumerClaims: ['readiness']
                        }]
                    })
                }
            }
        });
        const childConfig = Neo.create(ConfigProvider, {
            data: {
                auth: {
                    gitlabApiBaseUrl: leaf('https://override.example.test', null, 'string')
                }
            }
        });

        Neo.ai.Config = rootConfig;

        try {
            expect(childConfig.validateRequiredEnv({
                consumerClaim: 'readiness',
                entrypoint   : 'memory-core-mcp',
                mode         : 'gitlab-pat'
            })).toEqual({findings: [], ok: true});
        } finally {
            Neo.ai.Config = previousRoot;
            rootConfig.destroy();
            childConfig.destroy();
        }
    });

    test('ships Tier-1 provider and unified Chroma defaults', async () => {
        expect(Config.chatProvider).toBe(process.env.NEO_MODEL_PROVIDER || 'openAiCompatible');
        expect(Config.modelProvider).toBe(Config.chatProvider);
        expect(Config.graphProvider).toBe(process.env.NEO_GRAPH_PROVIDER || 'openAiCompatible');
        expect(Config.embeddingProvider).toBe(process.env.NEO_EMBEDDING_PROVIDER || 'openAiCompatible');
        expect(Config.vectorDimension).toBe(Number(process.env.NEO_VECTOR_DIMENSION) || 4096);
        // Relocated out of the plane: a backup that resolves beneath the checkout is deletable
        // by `git clean -x`, since `.neo-ai-data` is gitignored and `clean -x` is defined as
        // reaching ignored files.
        expect(Config.backupPath).toBe(process.env.NEO_BACKUP_PATH || path.resolve(os.homedir(), '.neo-ai', 'backups'));

        // The guarantee, independent of where the default is tuned to next.
        if (!process.env.NEO_BACKUP_PATH) {
            expect(Config.backupPath.startsWith(Config.neoRootDir + path.sep)).toBe(false)
        }
        expect(Config.modelName).toBe('gemini-3.5-flash');
        expect(Config.embeddingModel).toBe('gemini-embedding-001');

        expect(Config.ollama).toMatchObject({
            host                 : process.env.NEO_OLLAMA_HOST || 'http://127.0.0.1:11434',
            model                : process.env.NEO_OLLAMA_MODEL || 'gemma4:26b',
            embeddingModel       : process.env.NEO_OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding',
            keep_alive           : Env.parseKeepAlive('NEO_OLLAMA_KEEP_ALIVE') ?? -1,
            requireParallelModels: Env.parseNumber('NEO_OLLAMA_REQUIRE_PARALLEL_MODELS') ?? 2
        });
        expect(Config.openAiCompatible).toMatchObject({
            host                   : process.env.NEO_OPENAI_COMPATIBLE_HOST || 'http://127.0.0.1:11434',
            model                  : process.env.NEO_OPENAI_COMPATIBLE_MODEL || 'google/gemma-4-26b-a4b',
            embeddingModel         : process.env.NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL || 'text-embedding-qwen3-embedding-8b',
            apiKey                 : process.env.NEO_OPENAI_COMPATIBLE_API_KEY || '',
            unloadRetryCount       : Number(process.env.NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_COUNT) || 3,
            unloadRetryDelayMs     : Number(process.env.NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_DELAY_MS) || 500,
            contentionRetryCount   : Number(process.env.NEO_OPENAI_COMPATIBLE_CONTENTION_RETRY_COUNT) || 2,
            contentionRetryDelayMs : Number(process.env.NEO_OPENAI_COMPATIBLE_CONTENTION_RETRY_DELAY_MS) || 1000,
            contentionTimeoutMs    : Number(process.env.NEO_OPENAI_COMPATIBLE_CONTENTION_TIMEOUT_MS) || 15000,
            batchEmbeddingChunkSize: Number(process.env.NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_CHUNK_SIZE) || 5,
            batchEmbeddingYieldMs  : Number(process.env.NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_YIELD_MS) || 0,
            keep_alive             : Env.parseKeepAlive('NEO_OPENAI_COMPATIBLE_KEEP_ALIVE') ?? -1,
            requireParallelModels  : Env.parseNumber('NEO_OPENAI_COMPATIBLE_REQUIRE_PARALLEL_MODELS') ?? 2
        });
        expect(Config.localModels).toMatchObject({
            chat: {
                contextLimitTokens       : Number(process.env.NEO_LOCAL_MODELS_CHAT_CONTEXT_LIMIT_TOKENS) || 131072,
                safeProcessingLimitTokens: Number(process.env.NEO_LOCAL_MODELS_CHAT_SAFE_PROCESSING_LIMIT_TOKENS) || 100000,
                parallel                 : Number(process.env.NEO_LOCAL_MODELS_CHAT_PARALLEL) || 1
            },
            embedding: {
                contextLimitTokens       : Number(process.env.NEO_LOCAL_MODELS_EMBEDDING_CONTEXT_LIMIT_TOKENS) || 32768,
                safeProcessingLimitTokens: Number(process.env.NEO_LOCAL_MODELS_EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS) || 28672,
                parallel                 : Number(process.env.NEO_LOCAL_MODELS_EMBEDDING_PARALLEL) || 1
            }
        });
        expect(Config.engines.chroma).toEqual({
            dataDir            : process.env.NEO_CHROMA_DATA_DIR_TEST || expect.stringMatching(/neo-chroma-unit-test/),
            dataDirProd        : expect.stringMatching(/\.neo-ai-data[/\\]chroma[/\\]unified$/),
            dataDirTest        : process.env.NEO_CHROMA_DATA_DIR_TEST || path.join(os.tmpdir(), 'neo-chroma-unit-test'),
            host               : process.env.NEO_CHROMA_HOST_TEST || 'localhost',
            hostProd           : process.env.NEO_CHROMA_HOST || 'localhost',
            hostTest           : process.env.NEO_CHROMA_HOST_TEST || 'localhost',
            port               : Number(process.env.NEO_CHROMA_PORT_TEST) || 18180,
            portProd           : Number(process.env.NEO_CHROMA_PORT) || 8000,
            portTest           : Number(process.env.NEO_CHROMA_PORT_TEST) || 18180,
            database           : process.env.NEO_CHROMA_DATABASE || 'default_database',
            databaseTest       : process.env.NEO_CHROMA_DATABASE_TEST || CHROMA_TEST_DATABASE,
            useTestDatabase    : true,
            useTestHarness     : true,
            useUnitTestDatabase: true
        });
    });

    test('keeps local embedding context env overrides role-scoped (#12286)', () => {
        const isolatedConfig = createIsolatedConfig();

        try {
            isolatedConfig.setEnvOverride('NEO_LOCAL_MODELS_EMBEDDING_CONTEXT_LIMIT_TOKENS', 12345);
            isolatedConfig.setEnvOverride('NEO_LOCAL_MODELS_EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS', 11111);
            isolatedConfig.setEnvOverride('NEO_LOCAL_MODELS_EMBEDDING_PARALLEL', 2);

            expect(isolatedConfig.localModels.embedding).toMatchObject({
                contextLimitTokens       : 12345,
                safeProcessingLimitTokens: 11111,
                parallel                 : 2
            });
            expect(isolatedConfig.localModels.chat.contextLimitTokens).toBe(Number(process.env.NEO_LOCAL_MODELS_CHAT_CONTEXT_LIMIT_TOKENS) || 131072);
        } finally {
            isolatedConfig.destroy();
        }
    });

    test('invalid embedding safe-band env values fall back before reaching consumers', () => {
        const script = `
            import './src/Neo.mjs';
            const {default: AiConfig} = await import('./ai/config.mjs');
            console.log('SAFE_BAND=' + AiConfig.localModels.embedding.safeProcessingLimitTokens);
        `;

        for (const invalidValue of ['-1', '1.5']) {
            const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
                cwd     : process.cwd(),
                encoding: 'utf8',
                env     : {
                    ...process.env,
                    NEO_LOCAL_MODELS_EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS: invalidValue,
                    UNIT_TEST_MODE                                         : 'true'
                }
            });

            expect(output).toContain('SAFE_BAND=28672')
        }
    });

    test('ships top-level deployment and maintenance policy defaults', async () => {
        expect(Config.orchestrator.deploymentMode).toBe(process.env.NEO_AI_DEPLOYMENT_MODE || 'cloud');

        // `authorityProfile` carries NO default — a role is declared, never inherited — and the
        // emptiness is what ARMS its `requiredFor` guard, since requiredness is evaluated on the
        // RESOLVED value.
        //
        // Asserted on the DECLARED descriptor, not only the resolved value, because the resolved
        // half is maskable: `test/playwright/configTemplateResolver.mjs` sets
        // `NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE ??= 'legacy-mixed'`, so under Playwright the
        // fallback branch of `process.env.X || …` never evaluates and this line would keep passing
        // against any default at all. That is precisely how the predecessor PR shipped a green
        // suite over a broken production launch. The descriptor read has no such escape.
        expect(RootConfigBase.config.data.orchestrator.authorityProfile.default).toBe('');
        expect(Config.orchestrator.authorityProfile).toBe(process.env.NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE || '');
        expect(Config.orchestrator.intervals).toMatchObject({
            pollMs                           : 3000,
            summarySweepMs                   : 10 * 60 * 1000,
            kbSyncMs                         : 30 * 60 * 1000,
            githubWorkflowSyncMs             : 2 * 60 * 60 * 1000,
            backupMs                         : 24 * 60 * 60 * 1000,
            graphLogCompactionMs             : 24 * 60 * 60 * 1000,
            primaryDevSyncMs                 : 10 * 60 * 1000,
            dreamMs                          : 60 * 60 * 1000,
            messageConceptHarvestMs          : 6 * 60 * 60 * 1000,
            goldenPathMs                     : 60 * 60 * 1000,
            swarmHeartbeatMs                 : 20 * 60 * 1000,
            embedDrainLivenessWatchdogCheckMs: 60 * 60 * 1000
        });
        // `kbSyncEnabled` + `temporalSummaryEnabled` are asserted under `cloudOnly` below: both are
        // container-plane lanes, and this exhaustive `toEqual` is what caught the move, which is the
        // reason to keep it exhaustive rather than relax it to `toMatchObject`.
        expect(Config.orchestrator.localOnly).toEqual({
            primaryDevSyncEnabled          : null,
            githubWorkflowSyncEnabled      : false,
            chromaDaemonEnabled            : null,
            bridgeDaemonEnabled            : false,
            neuralLinkBridgeEnabled        : null,
            embedDaemonEnabled             : null,
            messageDaemonEnabled           : null,
            goldenPathRepoEnrichmentEnabled: null,
            swarmHeartbeatEnabled          : false,
            wakeDispatchEnabled            : null
        });
        // Their new home. `null` here resolves the OPPOSITE way from `localOnly` — cloud enables,
        // local opts in — which is what puts them on the role that owns them.
        expect(Config.orchestrator.cloudOnly.kbSyncEnabled).toBe(null);
        expect(Config.orchestrator.cloudOnly.temporalSummaryEnabled).toBe(null);
        expect(Config.orchestrator.devServer).toEqual({
            enabled               : null,
            port                  : 8080,
            livenessProbeTimeoutMs: 1000
        });

        // The swarm-heartbeat candidate-discovery default is the activity-derived source
        // ("activity-derived signals" framing).
        // Per-MC-instance derived; no team-registry coupling; tenant-safe for external
        // workspaces (each deployment's MC has its own A2A activity). `targets` is the
        // optional explicit-handle-list override (highest resolver precedence) — null by
        // default so the resolver falls through to `targetSource` semantics.
        expect(Config.orchestrator.swarmHeartbeat).toEqual({
            targetSource: 'active-a2a-participants',
            targets     : null,
            // Wake-policy leaves: NEO_-prefixed env names bound (NEO_IDLE_THRESHOLD_MS /
            // NEO_SWARM_WAKE_COOLDOWN_SECONDS / NEO_SWARM_IDENTITIES), deployment-portable defaults.
            idleThresholdMs         : 10 * 60 * 1000,
            swarmWakeCooldownSeconds: 600,
            allIdleIdentities       : null
        });
        const graphLogCompactionEnabledEnv = process.env.NEO_ORCHESTRATOR_GRAPHLOG_COMPACTION_ENABLED?.trim().toLowerCase();
        const graphLogCompactionVacuumEnv  = process.env.NEO_ORCHESTRATOR_GRAPHLOG_COMPACTION_VACUUM?.trim().toLowerCase();
        const graphLogCompactionDisabled   = ['false', 'no', 'off', '0'].includes(graphLogCompactionEnabledEnv);
        const graphLogCompactionVacuum     = ['true', 'yes', 'on', '1'].includes(graphLogCompactionVacuumEnv);

        expect(Config.orchestrator.graphLogCompaction).toEqual({
            enabled: graphLogCompactionEnabledEnv === undefined ? true : !graphLogCompactionDisabled,
            vacuum : graphLogCompactionVacuum
        });

        expect(Config._data.orchestrator.deploymentStateBridge.snapshotPath.default)
            .toContain('.neo-ai-data/deployment-state/snapshot.json');
        expect(Config.orchestrator.deploymentStateBridge).toMatchObject({
            enabled     : true,
            snapshotPath: path.join(
                process.env.NEO_TEST_STORAGE_ROOT,
                process.env.NEO_TEST_CONFIG_TEMPLATE_SCOPE,
                'deployment-state',
                'snapshot.json'
            ),
            writeIntervalMs         : 30000,
            staleAfterMs            : 2 * 60 * 1000,
            maxSnapshotBytes        : 256 * 1024,
            allowedServices         : [],
            includeLogs             : true,
            logTail                 : 120,
            logMaxBytes             : 32 * 1024,
            statsSampleWindow       : 2,
            recoveryRunLimit        : 10,
            selfHealRecentEventLimit: 10
        });

        const isolatedConfig = createIsolatedConfig();

        try {
            isolatedConfig.setEnvOverride('NEO_DEPLOYMENT_STATE_BRIDGE_ENABLED', false);
            expect(isolatedConfig.orchestrator.deploymentStateBridge.enabled).toBe(false);
            isolatedConfig.setEnvOverride('NEO_DEPLOYMENT_STATE_BRIDGE_ENABLED', true);
            expect(isolatedConfig.orchestrator.deploymentStateBridge.enabled).toBe(true);

            // The self-heal snapshot's recent-event cap (a distinct surface from recoveryRunLimit) is env-bound.
            isolatedConfig.setEnvOverride('NEO_DEPLOYMENT_STATE_BRIDGE_SELF_HEAL_RECENT_EVENT_LIMIT', 25);
            expect(isolatedConfig.orchestrator.deploymentStateBridge.selfHealRecentEventLimit).toBe(25);

            // Heal-event ledger retention — operator-configurable runtime policy, not a helper magic number.
            expect(isolatedConfig.orchestrator.recoveryActuator.healLedger).toMatchObject({
                maxEvents        : 5000,
                pruneTriggerBytes: 1024 * 1024
            });
            isolatedConfig.setEnvOverride('NEO_RECOVERY_ACTUATOR_HEAL_LEDGER_MAX_EVENTS', 1234);
            expect(isolatedConfig.orchestrator.recoveryActuator.healLedger.maxEvents).toBe(1234);

            expect(isolatedConfig.orchestrator.recoveryActuator.freezeReprobeTimeoutMs).toBe(
                Number(process.env.NEO_RECOVERY_ACTUATOR_FREEZE_REPROBE_TIMEOUT_MS) || 30000
            );
            isolatedConfig.setEnvOverride('NEO_RECOVERY_ACTUATOR_FREEZE_REPROBE_TIMEOUT_MS', 4321);
            expect(isolatedConfig.orchestrator.recoveryActuator.freezeReprobeTimeoutMs).toBe(4321);
        } finally {
            isolatedConfig.destroy();
        }

        // Provider-readiness probe parameters consumed by the orchestrator dream task
        // + standalone Sandman CLI runner. Values are concrete defaults — no module-level
        // constants substitute when callers omit them.
        const stuckRunnerEnabledEnv = process.env.NEO_ORCHESTRATOR_STUCK_RUNNER_ENABLED?.trim().toLowerCase();
        const stuckRunnerDisabled   = ['false', 'no', 'off', '0'].includes(stuckRunnerEnabledEnv);

        expect(Config.orchestrator.providerReadiness).toEqual({
            attempts         : Number(process.env.NEO_ORCHESTRATOR_PROVIDER_READY_ATTEMPTS)             || 30,
            delayMs          : Number(process.env.NEO_ORCHESTRATOR_PROVIDER_READY_DELAY_MS)             || 1000,
            timeoutMs        : Number(process.env.NEO_ORCHESTRATOR_PROVIDER_READY_TIMEOUT_MS)           || 3000,
            routineCacheTtlMs: Number(process.env.NEO_ORCHESTRATOR_PROVIDER_READY_ROUTINE_CACHE_TTL_MS) || 1000,
            stuckRunner      : {
                enabled            : stuckRunnerEnabledEnv === undefined ? true : !stuckRunnerDisabled,
                consecutiveFailures: Number(process.env.NEO_ORCHESTRATOR_STUCK_RUNNER_CONSECUTIVE_FAILURES) || 3,
                canaryTimeoutMs    : Number(process.env.NEO_ORCHESTRATOR_STUCK_RUNNER_CANARY_TIMEOUT_MS)    || 10000
            }
        });
        const ollamaEnabledEnv = process.env.NEO_ORCHESTRATOR_OLLAMA_ENABLED?.trim().toLowerCase();
        const ollamaEnabled    = ['true', 'yes', 'on', '1'].includes(ollamaEnabledEnv);

        expect(Config.orchestrator.ollama).toEqual({
            enabled: ollamaEnabled
        });

        const lmsEnabledEnv = process.env.NEO_ORCHESTRATOR_LMS_ENABLED?.trim().toLowerCase();
        const lmsEnabled    = ['true', 'yes', 'on', '1'].includes(lmsEnabledEnv);

        expect(Config.orchestrator.lms).toMatchObject({
            enabled: lmsEnabled,
            model  : process.env.NEO_ORCHESTRATOR_LMS_MODEL || 'qwen3-embedding-8b',
            port   : process.env.NEO_ORCHESTRATOR_LMS_PORT || '1234'
        });

        expect(Config.maintenance.backup).toEqual({
            intervalMs: 24 * 60 * 60 * 1000,
            retention : {
                keepMinimum: 3,
                maxDays    : 30,
                // How many `.backup-partial-*` staging directories left by ABRUPT death survive the
                // residue sweep. A forensic-retention count rather than an age bound: the residue is
                // the only surviving evidence of a termination that recorded no terminal outcome, and
                // any age short enough to cap capacity also deletes the artifact an operator may be
                // mid-investigation on.
                keepPartials: 2
            },
            // Bounds how many bundles `verifyLatestBackupRestorable` validates while walking back past
            // an unusable newest one. A policy value rather than a module constant: a primitive-local
            // default is the forbidden config shape, and an operator on a host with a long run of
            // broken bundles needs to raise it without a code change.
            restorabilityScanLimit: 5,
            offHostSync           : {
                argv        : [],
                command     : '',
                envAllowlist: [],
                killGraceMs : 5000,
                timeoutMs   : 600000
            }
        });
        expect(Config.maintenance.defrag).toEqual({
            intervalMs       : 7 * 24 * 60 * 60 * 1000,
            snapshotRetention: {
                keepMinimum: 3,
                maxDays    : 7
            }
        });
    });

    test('an invalid env-resolved heal-ledger retention leaf fails at the use-site guard, not silently (#14163)', async () => {
        // The config layer type-checks the leaf as a number but does NOT range-check it; the bounded-retention
        // contract is enforced at the AiConfig-consuming boundary (validateHealLedgerRetention). A negative operator
        // value must throw THERE, driven through the canonical template leaf — never via a hand-rolled config overlay —
        // rather than silently disarming appendHealEvent's prune gate and letting the shared ledger grow unbounded.
        const {validateHealLedgerRetention} = await import('../../../../ai/services/memory-core/helpers/healEventLedgerStore.mjs');

        const isolatedConfig = createIsolatedConfig();

        try {
            isolatedConfig.setEnvOverride('NEO_RECOVERY_ACTUATOR_HEAL_LEDGER_MAX_EVENTS', -1);
            expect(() => validateHealLedgerRetention(
                isolatedConfig.orchestrator.recoveryActuator.healLedger.maxEvents,
                isolatedConfig.orchestrator.recoveryActuator.healLedger.pruneTriggerBytes
            )).toThrow(/maxEvents must be a finite, non-negative number/);
        } finally {
            isolatedConfig.destroy();
        }
    });

    test('ships explicit PAT admission leaves with safe defaults', () => {
        expect(Config.auth.allowedClientIds).toEqual([]);
        expect(Config.auth.allowedUsers).toEqual([]);
        expect(Config.auth.trustProxyIdentity).toBe(false);
        expect(Config.auth.pinFirstProviderSubject).toBe(false);
        expect(Config.auth.autoProvisionIdentitySources).toEqual([]);
        expect(Config.auth.providerBootstrapPat).toBe('');
        expect(Config.auth.providerBootstrapPatFile).toBe('');

        const isolatedConfig = createIsolatedConfig();

        try {
            isolatedConfig.setEnvOverride('NEO_AUTH_MODE', 'github-pat');

            expect(isolatedConfig.auth.pinFirstProviderSubject).toBe(true);
            expect(isolatedConfig.auth.autoProvisionIdentitySources).toEqual(['github-pat']);

            isolatedConfig.setEnvOverride('NEO_AUTH_ALLOWED_CLIENT_IDS', ['mcp-oauth-app']);
            isolatedConfig.setEnvOverride('NEO_AUTH_ALLOWED_USERS', ['neo-gpt']);
            isolatedConfig.setEnvOverride('NEO_AUTH_PIN_FIRST_PROVIDER_SUBJECT', false);
            isolatedConfig.setEnvOverride('NEO_AUTH_AUTO_PROVISION_IDENTITY_SOURCES', []);
            isolatedConfig.setEnvOverride('NEO_AUTH_PROVIDER_BOOTSTRAP_PAT', 'fixture-bootstrap-pat');

            expect(isolatedConfig.auth.allowedClientIds).toEqual(['mcp-oauth-app']);
            expect(isolatedConfig.auth.allowedUsers).toEqual(['neo-gpt']);
            expect(isolatedConfig.auth.pinFirstProviderSubject).toBe(false);
            expect(isolatedConfig.auth.autoProvisionIdentitySources).toEqual([]);
            expect(isolatedConfig.auth.providerBootstrapPat).toBe('fixture-bootstrap-pat');

            isolatedConfig.setEnvOverride('NEO_AUTH_PROVIDER_BOOTSTRAP_PAT', '');
            isolatedConfig.setEnvOverride('NEO_AUTH_PROVIDER_BOOTSTRAP_PAT_FILE', '/run/secrets/mcp-auth-token');

            expect(isolatedConfig.auth.providerBootstrapPat).toBe('');
            expect(isolatedConfig.auth.providerBootstrapPatFile).toBe('/run/secrets/mcp-auth-token');
        } finally {
            isolatedConfig.destroy();
        }
    });

    test('keeps config ledgers inside config classes', async () => {
        const configSourceUrls = [
            // The Tier-1 ledger lives in the extendable BASE since the template/base split;
            // the thin template subclass is shape-asserted separately below.
            '../../../../ai/configBase.mjs',
            '../../../../ai/mcp/server/github-workflow/configBase.mjs',
            '../../../../ai/mcp/server/gitlab-workflow/configBase.mjs',
            '../../../../ai/mcp/server/knowledge-base/configBase.mjs',
            '../../../../ai/mcp/server/memory-core/configBase.mjs',
            '../../../../ai/mcp/server/neural-link/configBase.mjs'
        ];

        for (const configSourceUrl of configSourceUrls) {
            const source = await fs.readFile(new URL(configSourceUrl, import.meta.url), 'utf8');

            // The ledger lives inside the config class as a single `static config` block
            // whose `data` config holds the `{env?, default, parse?}` leaves — never as a
            // module-level `const` (the old parallel defaultConfig/envBindings shape, and
            // its meta-leaf successor, would both leak the ledger out of the class).
            expect(source).not.toMatch(/^const\s+(defaultConfig|envBindings|metaTree)\s*=/m);
            expect(source).toMatch(/static\s+config\s*=/);
            expect(source).toMatch(/data\s*:/);
        }

        // The thin Tier-1 template carries NO ledger of its own: it is the eager singleton
        // subclass of the base (the overlay-drift root fix — defaults live once, in the base).
        const thinSource = await fs.readFile(new URL('../../../../ai/config.template.mjs', import.meta.url), 'utf8');

        expect(thinSource).toMatch(/class\s+Config\s+extends\s+ConfigBase/);
        expect(thinSource).toMatch(/singleton\s*:\s*true/);
        expect(thinSource).not.toMatch(/^const\s+(defaultConfig|envBindings|metaTree)\s*=/m);
    });

    test('exposes MCP file-log retention leaves in file-sink server templates', async () => {
        const configSources = [{
            envPrefix: 'NEO_KB_LOG_RETENTION',
            sourceUrl: '../../../../ai/mcp/server/knowledge-base/configBase.mjs'
        }, {
            envPrefix: 'NEO_MEMORY_LOG_RETENTION',
            sourceUrl: '../../../../ai/mcp/server/memory-core/configBase.mjs'
        }, {
            envPrefix: 'NEO_NL_LOG_RETENTION',
            sourceUrl: '../../../../ai/mcp/server/neural-link/configBase.mjs'
        }];

        for (const {envPrefix, sourceUrl} of configSources) {
            const source = await fs.readFile(new URL(sourceUrl, import.meta.url), 'utf8');

            expect(source).toContain('loggerRetention');
            expect(source).toContain(`${envPrefix}_ENABLED`);
            expect(source).toContain(`${envPrefix}_MAX_AGE_DAYS`);
            expect(source).toContain(`${envPrefix}_MAX_FILES`);
            expect(source).toContain(`${envPrefix}_MAX_TOTAL_BYTES`);
        }
    });
});
