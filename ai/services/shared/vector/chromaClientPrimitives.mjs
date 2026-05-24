import {assertCanonicalCollectionDeleteAllowed} from '../../../mcp/server/shared/services/DestructiveOperationGuard.mjs';

/**
 * @summary Stateless helpers for the Chroma-client connection lifecycle, shared between the
 * Knowledge Base ChromaManager and Memory Core ChromaManager (#11111).
 *
 * Each per-subsystem ChromaManager remains the owner of its `this.client` (the chromadb
 * library's `ChromaClient` instance) so tests that mock-replace `ChromaManager.client =
 * fakeClient` continue to work without modification. This module exports plain functions
 * that read the client at call-time from the caller's argument list.
 *
 * **What this module owns (the dedup-eligible shared layer per #11111):**
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
 *        duration of `fn`. Matches pre-#11111 KB behavior.
 *      - `{filter: (msg) => boolean}` — predicate suppression; only messages whose joined-args
 *        string returns true are suppressed. Matches pre-#11111 MC behavior which filters
 *        for four specific Chroma library warnings.
 *
 * 3. **`chromaDeleteCollection({client, name, subsystem, confirmation})`** — guarded delete
 *    wrapper. Routes through `assertCanonicalCollectionDeleteAllowed` with subsystem-scoped
 *    canonical-name refusal. The substrate-level invariant (#11652) fires regardless of
 *    harness or config state.
 *
 * **What this module does NOT own (per V-B-A on the ticket's prescription):**
 *
 * - `getOrCreateCollection` / `getCollection` / `createCollection` — collection-resolution
 *   semantics differ substantially between KB (shadow-swap-aware resolver, see
 *   `Neo.ai.services.knowledge-base.ChromaManager#resolveKnowledgeBaseCollection`) and MC
 *   (plain `getOrCreateCollection` for three named collections). Sharing would either flatten
 *   KB's swap safety or balloon the primitive with KB-specific phase awareness MC doesn't need.
 * - `ensureDummyEmbedding` — KB uses `aiConfig.dummyEmbeddingFunction` (static); MC instantiates
 *   a `TextEmbeddingService`-backed dynamic function per-call. Neither is shareable at the
 *   client-wrapper layer.
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
 * @see #11111
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
    assertCanonicalCollectionDeleteAllowed({name, subsystem, confirmation});
    return await client.deleteCollection({name})
}
