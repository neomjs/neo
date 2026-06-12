/**
 * @summary Compatibility shim that keeps gitignored Memory Core configs on the canonical embedding helper.
 *
 * Some local `ai/mcp/server/memory-core/config.mjs` copies predate the helper's move to
 * `ai/services/memory-core/helpers/`. Because that runtime config is intentionally gitignored,
 * stale copies can still import this legacy path. Re-exporting the canonical service helper
 * keeps those worktrees bootable until a tracked config-refresh mechanism can safely update
 * ignored files.
 *
 * @see ai/services/memory-core/helpers/embeddingProviderConfig.mjs
 * @see ai/scripts/migrations/bootstrapWorktree.mjs
 */
export {resolveEmbeddingProvider, normalizeEmbeddingProviderConfig} from '../../../../services/memory-core/helpers/embeddingProviderConfig.mjs';
