import AiConfig from '../../../ai/config.template.mjs';

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
 * - {@link TIER1_DEFAULTS} reads from the tracked `ai/config.template.mjs`,
 *   never from the gitignored `ai/config.mjs` overlay.
 * - Deep-cloned via `structuredClone` so nested groups (`auth`, `ollama`,
 *   `openAiCompatible`, `engines.chroma`, …) hold no shared references with
 *   the live `AiConfig.data`. Mutating the live singleton in one spec cannot
 *   leak into another spec's assertion against the snapshot.
 * - Recursively frozen so accidental in-test writes to nested groups throw
 *   (in strict mode) instead of silently mutating a "frozen" snapshot — the
 *   shallow `Object.freeze` failure mode caught in #11978 cycle-1 review.
 *
 * **Why not import the template directly in tests?**
 * The per-server templates under `ai/mcp/server/` currently import `AiConfig`
 * from the top-level `ai/config.mjs` (operator overlay) at runtime — that's
 * the correct runtime shape, but it means importing a per-server template
 * still transitively reads operator-overlay values. The fixture-snapshot
 * indirection in this file cuts that chain for test-side assertion use cases
 * without changing runtime behavior.
 *
 * **Mutation-style callers** (`aiConfig.storagePaths.graph = tmpPath`) should
 * use the re-exported {@link AiConfig} live singleton — `Neo.setupClass(Config)`
 * is idempotent (post-#11969), so the same singleton is returned regardless
 * of which file triggered registration.
 *
 * @see learn/agentos/DeploymentCookbook.md §7 — operator overlay model
 * @see ai/config.template.mjs — Tier-1 source of truth
 */

/**
 * Recursively deep-clones plain objects / arrays, leaving primitives AND
 * functions as-is. Functions are referenced rather than cloned because
 * `structuredClone` rejects them, and the snapshot's contract is about
 * isolating mutable DATA — function references are inherently stateless
 * for our assertion purposes (e.g. the nested arrow functions in
 * `aiConfig.dummyEmbeddingFunction`).
 *
 * @param {*} value
 * @returns {*}
 */
function deepClone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(deepClone);
    const out = {};
    for (const key of Object.keys(value)) out[key] = deepClone(value[key]);
    return out;
}

/**
 * Recursively freezes every plain-object / array node in the given value.
 * Returns the same value for chaining. No-op on primitives + functions.
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
 * Deep-frozen snapshot of `ai/config.template.mjs` default values. Use this
 * for deterministic test assertions; nested groups (e.g. `TIER1_DEFAULTS.auth`,
 * `TIER1_DEFAULTS.ollama`) are independent references from the live
 * `AiConfig.data` and are themselves frozen.
 *
 * @type {Readonly<Object>}
 */
export const TIER1_DEFAULTS = deepFreeze(deepClone(AiConfig.data));

/**
 * Live `Neo.ai.Config` singleton — same instance any runtime code receives.
 * Use for mutation-style test setup (e.g. wiring `aiConfig.storagePaths.X`
 * to a tmpdir before a spec runs).
 *
 * @type {Object}
 */
export {AiConfig};
