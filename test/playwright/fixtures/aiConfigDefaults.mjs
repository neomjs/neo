import path            from 'path';
import {fileURLToPath} from 'url';
import os              from 'os';
import Neo             from '../../../src/Neo.mjs';

const HOUR_MS               = 60 * 60 * 1000;
const DAY_MS                = 24 * HOUR_MS;
const __filename            = fileURLToPath(import.meta.url);
const __dirname             = path.dirname(__filename);
const neoRootDir            = path.resolve(__dirname, '../../..');
const chromaUnitTestDataDir = path.join(os.tmpdir(), 'neo-chroma-unit-test');

/**
 * @module test/playwright/fixtures/aiConfigDefaults
 * @summary Deterministic Tier-1 config defaults for test assertions.
 *
 * Tests that need to ASSERT on canonical Tier-1 default values (e.g.,
 * `modelProvider`, `embeddingProvider`, `vectorDimension`) should compare
 * against {@link TIER1_DEFAULTS} rather than reading from the live
 * `ai/config.mjs` operator overlay. The overlay is gitignored and operator-
 * customized — assertions against it are CI-vs-local-parity hazards.
 *
 * **Determinism contract:**
 * - {@link TIER1_DEFAULTS} mirrors the tracked `ai/config.template.mjs` Tier-1
 *   groups used by server template assertions, never the gitignored
 *   `ai/config.mjs` overlay.
 * - Deep-cloned via `Neo.clone(obj, true, true)` (Neo's canonical deep-clone
 *   primitive — `ignoreNeoInstances=true` matches the snapshot semantic;
 *   functions + primitives flow through the `cloneMap` fallback unchanged,
 *   plain Objects/Arrays recurse). Nested groups (`auth`, `ollama`,
 *   `openAiCompatible`, `engines.chroma`, …) hold no shared references with
 *   any live config singleton; mutating a singleton in one spec cannot leak
 *   into another spec's assertion against the snapshot.
 * - Recursively frozen via the local `deepFreeze()` helper. Neo doesn't ship
 *   a recursive freeze counterpart to `Neo.clone`, so this helper stays
 *   in-fixture; the shallow `Object.freeze({...x})` failure mode is the
 *   regression anchor for why deep freeze is required.
 *
 * **Why not import the template directly here?**
 * Importing `ai/config.template.mjs` registers `Neo.ai.Config`. This fixture is
 * imported at module-evaluation time by server-template specs, which may share a
 * Playwright worker with specs that already imported the runtime overlay.
 * Keeping this file plain-data prevents hidden class-registration collisions.
 *
 * @see learn/agentos/DeploymentCookbook.md §7 — operator overlay model
 * @see ai/config.template.mjs — Tier-1 source of truth
 */

/**
 * Recursively freezes every plain-object / array node in the given value.
 * Returns the same value for chaining. No-op on primitives + functions.
 *
 * Local to this fixture because Neo doesn't ship a recursive-freeze
 * counterpart to `Neo.clone`. If a `Neo.freeze` primitive lands later, this
 * helper retires.
 *
 * @param {*} value
 * @returns {*}
 */
function deepFreeze(value) {
    if (value === null || typeof value !== 'object') return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
}

/**
 * Mirrors `Env.parseKeepAlive` without importing the Env singleton into this
 * plain-data fixture.
 * @param {String|undefined} value
 * @param {Number|String} fallback
 * @returns {Number|String}
 */
function parseKeepAlive(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;

    const trimmed = String(value).trim();
    if (!trimmed) return fallback;

    const num = Number(trimmed);
    return Number.isFinite(num) ? num : trimmed;
}

/**
 * Deep-frozen snapshot of the Tier-1 default values server templates inherit.
 * Use this for deterministic test assertions; nested groups (e.g.
 * `TIER1_DEFAULTS.auth`, `TIER1_DEFAULTS.ollama`) are independent references
 * and are themselves frozen.
 *
 * @type {Readonly<Object>}
 */
export const TIER1_DEFAULTS = deepFreeze(Neo.clone({
    backupPath: process.env.NEO_BACKUP_PATH || path.resolve(neoRootDir, '.neo-ai-data/backups'),
    auth      : {
        host              : process.env.NEO_AUTH_HOST || null,
        port              : Number(process.env.NEO_AUTH_PORT) || 8080,
        realm             : process.env.NEO_AUTH_REALM || 'master',
        issuerUrl         : process.env.NEO_AUTH_ISSUER_URL || null,
        clientId          : process.env.NEO_OAUTH_CLIENT_ID || null,
        clientSecret      : process.env.NEO_OAUTH_CLIENT_SECRET || '',
        trustProxyIdentity: process.env.NEO_AUTH_TRUST_PROXY_IDENTITY === 'true'
    },
    modelProvider    : process.env.NEO_MODEL_PROVIDER || 'openAiCompatible',
    graphProvider    : process.env.NEO_GRAPH_PROVIDER || 'openAiCompatible',
    embeddingProvider: process.env.NEO_EMBEDDING_PROVIDER || 'openAiCompatible',
    ollama           : {
        host                 : process.env.NEO_OLLAMA_HOST || 'http://127.0.0.1:11434',
        model                : process.env.NEO_OLLAMA_MODEL || 'gemma4:26b',
        embeddingModel       : process.env.NEO_OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding',
        keep_alive           : parseKeepAlive(process.env.NEO_OLLAMA_KEEP_ALIVE, -1),
        requireParallelModels: Number(process.env.NEO_OLLAMA_REQUIRE_PARALLEL_MODELS) || 2
    },
    openAiCompatible: {
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
        keep_alive             : parseKeepAlive(process.env.NEO_OPENAI_COMPATIBLE_KEEP_ALIVE, -1),
        requireParallelModels  : Number(process.env.NEO_OPENAI_COMPATIBLE_REQUIRE_PARALLEL_MODELS) || 2
    },
    localModels: {
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
    },
    vectorDimension: Number(process.env.NEO_VECTOR_DIMENSION) || 4096,
    modelName      : 'gemini-3.5-flash',
    embeddingModel : 'gemini-embedding-001',
    engines        : {
        chroma: {
            dataDirProd: path.resolve(neoRootDir, '.neo-ai-data/chroma/unified'),
            dataDirTest: process.env.NEO_CHROMA_DATA_DIR_TEST || chromaUnitTestDataDir,
            hostProd   : process.env.NEO_CHROMA_HOST || 'localhost',
            hostTest   : process.env.NEO_CHROMA_HOST_TEST || 'localhost',
            portProd   : Number(process.env.NEO_CHROMA_PORT) || 8000,
            portTest   : Number(process.env.NEO_CHROMA_PORT_TEST) || 18180
        }
    },
    orchestrator: {
        providerReadiness: {
            attempts         : Number(process.env.NEO_ORCHESTRATOR_PROVIDER_READY_ATTEMPTS)             || 30,
            delayMs          : Number(process.env.NEO_ORCHESTRATOR_PROVIDER_READY_DELAY_MS)             || 1000,
            timeoutMs        : Number(process.env.NEO_ORCHESTRATOR_PROVIDER_READY_TIMEOUT_MS)           || 3000,
            routineCacheTtlMs: Number(process.env.NEO_ORCHESTRATOR_PROVIDER_READY_ROUTINE_CACHE_TTL_MS) || 1000
        },
        intervals: {
            pollMs                           : 3000,
            summarySweepMs                   : 10 * 60 * 1000,
            kbSyncMs                         : 30 * 60 * 1000,
            backupMs                         : DAY_MS,
            primaryDevSyncMs                 : 10 * 60 * 1000,
            tenantRepoSyncMs                 : 30 * 60 * 1000,
            dreamMs                          : HOUR_MS,
            goldenPathMs                     : HOUR_MS,
            swarmHeartbeatMs                 : 20 * 60 * 1000,
            embedDrainLivenessWatchdogCheckMs: HOUR_MS
        },
        recoveryActuator: {
            enabled                    : true,
            blockedSupervisedTasks     : [],
            blockedComposeServices     : [],
            blockedDeployTargets       : [],
            healAttemptsPath           : path.resolve(neoRootDir, '.neo-ai-data/orchestrator-daemon/heal-attempts.json'),
            recoveryRunStateDir        : path.resolve(neoRootDir, '.neo-ai-data/orchestrator-daemon/recovery-runs'),
            recoveryRunRetentionLimit  : 100,
            maxAttemptsPerWindow       : 3,
            maxAttemptsWindowMs        : HOUR_MS,
            baseBackoffMs              : 5 * 60 * 1000,
            maxBackoffMs               : HOUR_MS,
            verifyCooldownMs           : 60 * 1000,
            healthyObservationThreshold: 1
        },
        deploymentStateBridge: {
            enabled                     : true,
            snapshotPath                : path.resolve(neoRootDir, '.neo-ai-data/deployment-state/snapshot.json'),
            writeIntervalMs             : 30000,
            staleAfterMs                : 2 * 60 * 1000,
            maxSnapshotBytes            : 256 * 1024,
            allowedServices             : [],
            includeLogs                 : true,
            logTail                     : 120,
            logMaxBytes                 : 32 * 1024,
            statsSampleWindow           : 2,
            providerResidencyServiceKeys: ['local-model', 'model']
        }
    }
}, true, true));
