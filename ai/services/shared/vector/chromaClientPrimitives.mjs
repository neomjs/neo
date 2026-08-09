import {knownEmbeddingFunctions, registerEmbeddingFunction} from 'chromadb';
import {getProviderActivityContext}                         from '../providerActivityLedger.mjs';

export const CHROMA_DYNAMIC_TEXT_EMBEDDING_FUNCTION_NAME = 'dynamic_text_embedding_service';
const CHROMA_COLLECTION_NOT_FOUND_RE = /does not exist|not found|not be found|could not be found|404/i;

/**
 * @summary Local Chroma embedding placeholder for collections that always provide raw vectors.
 *
 * Chroma 3.x serializes embedding functions as named "known" configs and later
 * resolves them through its process-local registry while hydrating collection
 * schemas. The Neo dummy function is intentionally not an npm package, so it must
 * be registered locally before defrag / list / get-collection paths touch schema
 * deserialization.
 */
class NeoDummyEmbeddingFunction {
    static embeddingFunction = null;

    /**
     * @param {Object} embeddingFunction
     * @returns {void}
     */
    static configure(embeddingFunction) {
        assertEmbeddingFunction(embeddingFunction, 'dummyEmbeddingFunction');
        this.embeddingFunction = embeddingFunction;
    }

    /**
     * @returns {Object}
     */
    static buildFromConfig() {
        return this.embeddingFunction
    }
}

/**
 * @summary Creates the canonical Memory Core dynamic text embedding function wrapper.
 *
 * Existing Memory Core collections serialize this name into their Chroma schema. The
 * returned object satisfies Chroma's `IEmbeddingFunction` duck-type for both live
 * collection creation and registry `buildFromConfig()` hydration.
 *
 * @param {Object} [options]
 * @param {Function} [options.providerResolver] Returns the active embedding provider.
 * @param {String} [options.operationStage='unknown'] Stable provider activity stage.
 * @param {String} [options.service='unknown'] Stable service owner.
 * @returns {Object}
 */
export function createDynamicTextEmbeddingFunction({
    providerResolver = null,
    operationStage   = 'unknown',
    service          = 'unknown'
} = {}) {
    const embeddingFunction = {
        generate: async (texts) => {
            const {default: TextEmbeddingService} = await import('../../memory-core/TextEmbeddingService.mjs');
            const {default: aiConfig}             = await import('../../../mcp/server/memory-core/config.mjs');
            const provider                        = providerResolver?.() ?? aiConfig.embeddingProvider;
            const activity                        = getProviderActivityContext();

            // Route the whole batch through embedTexts (the batch path: 1h request timeout,
            // sequential chunks of batchEmbeddingChunkSize) — NOT per-text embedText fan-out. The
            // interactive embedText path applies the 15s contentionTimeoutMs, and a Promise.all over
            // the batch storms the single local embedder into self-contention, cutting bulk adds
            // (WAL drain / graph ingestion) short with spurious timeouts.
            return TextEmbeddingService.embedTexts(texts, provider, {
                operationLabel: 'Chroma dynamic text embedding',
                operationStage: activity?.operationStage || operationStage,
                service       : activity?.service || service
            })
        },
        name       : CHROMA_DYNAMIC_TEXT_EMBEDDING_FUNCTION_NAME,
        getConfig  : () => ({}),
        constructor: {
            buildFromConfig: () => createDynamicTextEmbeddingFunction({
                providerResolver,
                operationStage,
                service
            })
        }
    };

    return embeddingFunction
}

/**
 * @summary Registry-backed wrapper for Memory Core's dynamic text embedding service.
 *
 * Registering it keeps SDK schema hydration on the local implementation path
 * instead of falling through to `@chroma-core/dynamic_text_embedding_service`.
 */
class NeoDynamicTextEmbeddingService {
    /**
     * @returns {Object}
     */
    static buildFromConfig() {
        return createDynamicTextEmbeddingFunction()
    }
}

/**
 * @summary Registers Neo-local Chroma embedding functions for SDK schema hydration.
 *
 * The dummy embedding function remains owned by the Tier-1 `AiConfig.dummyEmbeddingFunction`
 * leaf. Callers that already own a config object pass that leaf in, keeping this registry
 * free of local `ai/config.mjs` overlay coupling while still hydrating Chroma's process registry.
 *
 * @param {Object} [options]
 * @param {Object|null} [options.dummyEmbeddingFunction=null] Tier-1 dummy EF leaf.
 * @param {Boolean} [options.includeDynamicTextEmbedding=true] Register the Memory Core dynamic EF.
 * @returns {String[]} Names registered during this call.
 */
export function registerNeoChromaEmbeddingFunctions({
    dummyEmbeddingFunction      = null,
    includeDynamicTextEmbedding = true
} = {}) {
    const registered = [];
    const entries    = [];

    if (dummyEmbeddingFunction) {
        NeoDummyEmbeddingFunction.configure(dummyEmbeddingFunction);
        entries.push([dummyEmbeddingFunction.name, NeoDummyEmbeddingFunction]);
    }

    if (includeDynamicTextEmbedding) {
        entries.push([CHROMA_DYNAMIC_TEXT_EMBEDDING_FUNCTION_NAME, NeoDynamicTextEmbeddingService]);
    }

    for (const [name, EmbeddingFunction] of entries) {
        if (!knownEmbeddingFunctions.has(name)) {
            registerEmbeddingFunction(name, EmbeddingFunction);
            registered.push(name);
        }
    }

    return registered
}

/**
 * @summary Classifies Chroma collection-handle failures that should trigger re-resolution.
 *
 * Long-lived MCP processes can keep a collection object across a Chroma daemon recycle,
 * shadow-swap, or restore. The next operation on that object can fail with Chroma's
 * not-found signatures even though the canonical collection is available to a fresh
 * lookup. Callers use this predicate to invalidate their memoized handle and retry once.
 *
 * @param {Error} error
 * @returns {Boolean}
 */
export function isChromaCollectionNotFoundError(error) {
    return error?.name === 'ChromaNotFoundError' || CHROMA_COLLECTION_NOT_FOUND_RE.test(error?.message || '')
}

/**
 * @summary Classifies a Chroma transport failure — the store is unreachable, as opposed to
 * answering that a collection is absent.
 *
 * Lives beside {@link isChromaCollectionNotFoundError} because the two are the pair every caller
 * needs to tell apart: one means "ask again later", the other means "this collection does not
 * exist". Promoted here from a private copy in the Knowledge Base `ChromaManager` so a second
 * consumer cannot drift from it — the same one-value-two-definitions failure the collection-name
 * resolver was cleaned of.
 *
 * Name-based rather than message-based on purpose: `ChromaConnectionError` is a stable type, while
 * transport messages vary by runtime and are exactly the strings a credential can appear in.
 *
 * @param {Error} error
 * @returns {Boolean}
 */
export function isChromaConnectionError(error) {
    return error?.name === 'ChromaConnectionError' || error?.constructor?.name === 'ChromaConnectionError'
}

/**
 * @param {Object} embeddingFunction
 * @param {String} label
 * @returns {void}
 * @throws {TypeError} When the value is not a Chroma embedding-function duck-type.
 */
function assertEmbeddingFunction(embeddingFunction, label) {
    if (
        !embeddingFunction ||
        typeof embeddingFunction.name !== 'string' ||
        typeof embeddingFunction.getConfig !== 'function' ||
        typeof embeddingFunction.generate !== 'function'
    ) {
        throw new TypeError(`[ChromaClientPrimitives] ${label} must provide name, getConfig(), and generate().`)
    }
}

/**
 * @summary Stateless helpers for the Chroma-client connection lifecycle, shared between the
 * Knowledge Base ChromaManager and Memory Core ChromaManager.
 *
 * Each per-subsystem ChromaManager remains the owner of its `this.client` (the chromadb
 * library's `ChromaClient` instance) so tests that mock-replace `ChromaManager.client =
 * fakeClient` continue to work without modification. This module exports plain functions
 * that read the client at call-time from the caller's argument list.
 *
 * **What this module owns (the dedup-eligible shared layer):**
 *
 * 1. **`chromaConnect({client, logger})`** — heartbeat-based readiness check. Returns a
 *    boolean (true on success, false on failure). Non-throwing — the caller decides how to
 *    react. Replaces ~10 lines of duplicated try/catch/heartbeat code in each ChromaManager.
 *
 * 2. **`createSilentExecutor()`** — returns a per-instance silent-execution function with
 *    its own Promise-based sequential lock. Each ChromaManager instantiates one of these
 *    once (typically as a private field) so its `executeSilently` calls don't race each
 *    other's `console.warn` restore. Two filter shapes accepted:
 *      - `{filter: null}` (default) — blanket suppression of all `console.warn` for the
 *        duration of `fn`. Matches the previous KB behavior.
 *      - `{filter: (msg) => boolean}` — predicate suppression; only messages whose joined-args
 *        string returns true are suppressed. Matches the previous MC behavior which filters
 *        for four specific Chroma library warnings.
 *
 * 3. **`chromaDeleteCollection({client, name, subsystem, confirmation})`** — guarded delete
 *    wrapper. Routes through `assertCanonicalCollectionDeleteAllowed` with subsystem-scoped
 *    canonical-name refusal. The substrate-level invariant fires regardless of
 *    harness or config state.
 *
 * 4. **`chromaListCollectionNames({client})`** — paginated, NON-MUTATING enumeration, consumed by
 *    KB shadow-swap discovery. It belongs beside the other client-lifecycle helpers precisely
 *    because it is not resolution — it creates nothing, so it carries none of the per-subsystem
 *    semantics listed below.
 *
 * **What this module does NOT own (per V-B-A on the ticket's prescription):**
 *
 * - `getOrCreateCollection` / `getCollection` / `createCollection` — collection-resolution
 *   semantics differ substantially between KB (shadow-swap-aware resolver, see
 *   `Neo.ai.services.knowledge-base.ChromaManager#resolveKnowledgeBaseCollection`) and MC
 *   (plain `getOrCreateCollection` for three named collections). Sharing would either flatten
 *   KB's swap safety or balloon the primitive with KB-specific phase awareness MC doesn't need.
 * - `ensureDummyEmbedding` — the dummy EF remains the Tier-1 `AiConfig.dummyEmbeddingFunction`
 *   leaf. This module only registers that leaf with Chroma when a config owner passes it in.
 * - `disconnect()` — neither consumer currently has a disconnect path; the chromadb client is
 *   GC-managed. Speculative substrate per `feedback_truth_in_code`.
 *
 * Per-server collection-abstraction semantics (`getMemoryCollection`, `getSummaryCollection`,
 * `getGraphCollection` for MC; `getKnowledgeBaseCollection` + shadow-swap resolution for KB)
 * stay in the per-subsystem ChromaManager files. `AbstractVectorManager` (MC's multi-vector-engine
 * abstraction) is MC-specific by design and is NOT lifted into this shared module.
 *
 * **Why functional helpers instead of a Neo class:**
 *
 * The ticket prescribed a `class ChromaClient extends Base` shape, but V-B-A on the actual
 * call sites surfaced two constraints:
 *   1. Tests heavily mock-replace `ChromaManager.client = fakeClient` (>14 occurrences in
 *      `ChromaManager.spec.mjs` alone). A Neo-class composition with `this.chromaPrimitive.client`
 *      would either break those tests or require complex pass-through getters with setter
 *      pairs to preserve the test pattern.
 *   2. The shared logic is stateless (apart from the silent-execution lock, which is naturally
 *      per-instance via the factory). A Neo class for stateless logic is idiom-noise.
 *
 * Functional helpers preserve the test mocking pattern, match Neo's "Neo class for state /
 * plain module for stateless utility" idiom, and produce a smaller, easier-to-review diff.
 *
 * @module ai/services/shared/vector/chromaClientPrimitives
 * @see chromaConnect
 */

/**
 * Heartbeat-based readiness check. Sets nothing — caller is responsible for storing the
 * boolean result on its instance state if needed.
 *
 * @param {Object} options
 * @param {Object} options.client      The chromadb library client (with `.heartbeat()`).
 * @param {Object} [options.logger]    Optional logger with `.debug()`; falls back to `console.debug`.
 * @returns {Promise<Boolean>} True if heartbeat succeeded, false otherwise. Non-throwing.
 */
export async function chromaConnect({client, logger} = {}) {
    try {
        await client.heartbeat();
        return true
    } catch (e) {
        (logger || console).debug?.('[ChromaClient] ChromaDB not accessible:', e.message);
        return false
    }
}

/**
 * Returns a per-instance silent-execution function with its own sequential lock.
 *
 * The lock is closed over the returned function so each ChromaManager instance gets its
 * own isolated suppression chain. Concurrent calls to the returned function serialize
 * (each waits for the previous to fully restore `console.warn` before starting its own
 * suppression window), preventing races where one call's `restore` overwrites another's
 * `suppress`.
 *
 * @returns {Function} `executeSilently(fn, {filter}={})` — see inline doc.
 */
export function createSilentExecutor() {
    let chromaLock = Promise.resolve();

    /**
     * Executes `fn` with `console.warn` suppressed.
     *
     * @param {Function} fn                            Async function to execute under suppression.
     * @param {Object}  [options]
     * @param {Function|null} [options.filter=null]    Predicate. If null, blanket-suppresses ALL warns.
     *   If a function, suppresses only warns whose joined-args string returns true from `filter(msg)`;
     *   everything else passes through to the original `console.warn`.
     * @returns {Promise<*>} Whatever `fn` returns.
     */
    return async function executeSilently(fn, {filter = null} = {}) {
        const nextLock = (async () => {
            await chromaLock;

            const originalWarn = console.warn;

            if (filter) {
                console.warn = (...args) => {
                    const msg = args.join(' ');
                    if (filter(msg)) return;
                    originalWarn.apply(console, args)
                }
            } else {
                console.warn = () => {}
            }

            try {
                return await fn()
            } finally {
                console.warn = originalWarn
            }
        })();

        chromaLock = nextLock.catch(() => {});
        return nextLock
    }
}

/**
 * Guarded delete-collection wrapper. Refuses canonical production collection names unless
 * `UNIT_TEST_MODE=true` or a valid production `confirmation` token is supplied.
 *
 * Empirical anchor: 2026-05-17 wipe where `npx playwright` bypassed
 * `playwright.config.unit.mjs` (`UNIT_TEST_MODE` absent) → `aiConfig.collections.*` returned
 * canonical names → a destructive cleanup helper dropped the live collections. The
 * substrate-level guard fires regardless of harness or config state.
 *
 * @param {Object}  options
 * @param {Object}  options.client          The chromadb library client (with `.deleteCollection`).
 * @param {String}  options.name            Collection name to delete.
 * @param {String}  options.subsystem       'knowledge-base' or 'memory-core' — scopes the canonical-name set.
 * @param {String} [options.confirmation]   Production-recovery token; equals `CONFIRM_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE` for bypass.
 * @returns {Promise<*>} Forwarded chromadb-client response.
 * @throws {CanonicalCollectionGuardError} When `name` is canonical and neither bypass applies.
 * @see https://github.com/neomjs/neo/issues/11652
 */
export async function chromaDeleteCollection({client, name, subsystem, confirmation} = {}) {
    const {assertCanonicalCollectionDeleteAllowed} = await import('../../../mcp/server/shared/services/DestructiveOperationGuard.mjs');

    assertCanonicalCollectionDeleteAllowed({name, subsystem, confirmation});
    return await client.deleteCollection({name})
}

/**
 * @summary Enumerates every collection name the client can see, creating nothing.
 *
 * The one non-mutating way to enumerate against a store whose resolvers answer "does this collection
 * exist?" by making it true. `getCollection` throws not-found without creating, but both subsystems
 * wrap it in retry/swap-aware resolution that ends in a create; `listCollections` has no such tail,
 * which is why shadow-swap discovery reads through here rather than through a resolver.
 *
 * Pages rather than taking the first batch: the previous KB-local copy of this loop existed because a
 * single unpaged call silently truncates at the server's page size, and a truncated enumeration would
 * report a live collection as absent — for swap discovery, that orphans an in-flight swap collection.
 *
 * Throws on client failure rather than returning an empty list. An empty result and an unreachable
 * server are different facts, and collapsing them here would hand callers the exact conflation this
 * probe exists to break.
 *
 * @param {Object}  options
 * @param {Object}  options.client    The chromadb library client (with `.listCollections`).
 * @param {Number} [options.pageSize] Rows per request; the loop stops on the first short page.
 * @returns {Promise<String[]>} Collection names, in server order.
 * @see https://github.com/neomjs/neo/issues/16348
 */
export async function chromaListCollectionNames({client, pageSize = 1000} = {}) {
    const names  = [];
    let   offset = 0;

    while (true) {
        const page = await client.listCollections({limit: pageSize, offset});

        names.push(...page.map(collection => collection.name));

        if (page.length < pageSize) {
            break
        }

        offset += pageSize
    }

    return names
}
