import Neo      from '../../../src/Neo.mjs';
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
 * - Deep-cloned via `Neo.clone(obj, true, true)` (Neo's canonical deep-clone
 *   primitive — `ignoreNeoInstances=true` matches the snapshot semantic;
 *   functions + primitives flow through the `cloneMap` fallback unchanged,
 *   plain Objects/Arrays recurse). Nested groups (`auth`, `ollama`,
 *   `openAiCompatible`, `engines.chroma`, …) hold no shared references with
 *   the live `AiConfig.data`; mutating the live singleton in one spec cannot
 *   leak into another spec's assertion against the snapshot.
 * - Recursively frozen via the local `deepFreeze()` helper. Neo doesn't ship
 *   a recursive freeze counterpart to `Neo.clone`, so this helper stays
 *   in-fixture; the shallow `Object.freeze({...x})` failure mode caught in
 *   #11978 cycle-1 is the regression-anchor for why deep freeze is required.
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
 * Deep-frozen snapshot of `ai/config.template.mjs` default values. Use this
 * for deterministic test assertions; nested groups (e.g. `TIER1_DEFAULTS.auth`,
 * `TIER1_DEFAULTS.ollama`) are independent references from the live
 * `AiConfig.data` and are themselves frozen.
 *
 * @type {Readonly<Object>}
 */
export const TIER1_DEFAULTS = deepFreeze(Neo.clone(AiConfig.data, true, true));

/**
 * Live `Neo.ai.Config` singleton — same instance any runtime code receives.
 * Use for mutation-style test setup (e.g. wiring `aiConfig.storagePaths.X`
 * to a tmpdir before a spec runs).
 *
 * @type {Object}
 */
export {AiConfig};
