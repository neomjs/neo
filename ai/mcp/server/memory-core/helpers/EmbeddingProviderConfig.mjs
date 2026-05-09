/**
 * @summary Compatibility shim — re-exports from the canonical SDK location.
 *
 * Background: M6 sub-issue #10996 migrated `EmbeddingProviderConfig.mjs` from
 * `ai/mcp/server/memory-core/helpers/` to the canonical SDK boundary at
 * `ai/services/memory-core/helpers/`. The repo's `ai/mcp/server/memory-core/config.mjs`
 * is a gitignored runtime file (per `.gitignore:104`); existing local copies that
 * pre-date the migration import this helper via `./helpers/EmbeddingProviderConfig.mjs`,
 * which would otherwise resolve to ERR_MODULE_NOT_FOUND.
 *
 * This shim re-exports the canonical surface from the new SDK location so stale
 * gitignored configs continue to work without the operator manually re-cp'ing from
 * `config.template.mjs`. The shim is removable once a tracked refresh mechanism
 * for gitignored configs lands (see `ai/scripts/bootstrapWorktree.mjs:219-223`,
 * which currently skips existing config files by design).
 *
 * @see ai/services/memory-core/helpers/EmbeddingProviderConfig.mjs — canonical implementation
 * @see #10996 — M6 sub-issue migrating helpers to flat SDK boundary
 * @see #11005 — follow-up: align Neo classNames with flat SDK locations
 */
export {resolveEmbeddingProvider, normalizeEmbeddingProviderConfig} from '../../../../services/memory-core/helpers/EmbeddingProviderConfig.mjs';
