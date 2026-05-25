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
 * - Frozen via `Object.freeze` so accidental test-side mutation cannot leak
 *   into sibling specs through the shared module cache.
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
 * Frozen snapshot of `ai/config.template.mjs` default values. Use this for
 * deterministic test assertions.
 *
 * @type {Readonly<Object>}
 */
export const TIER1_DEFAULTS = Object.freeze({...AiConfig.data});

/**
 * Live `Neo.ai.Config` singleton — same instance any runtime code receives.
 * Use for mutation-style test setup (e.g. wiring `aiConfig.storagePaths.X`
 * to a tmpdir before a spec runs).
 *
 * @type {Object}
 */
export {AiConfig};
