import fs   from 'fs/promises';
import path from 'path';

/**
 * @module ai/services/github-workflow/shared/pruneEmptyDirs
 * @summary Root-preserving cleanup for empty content chunk directories after sync moves.
 *
 * Syncers can empty active or archive chunk directories when an item moves to a new
 * bucket or is dropped. Pipeline worktrees can also retain empty active chunks from
 * earlier runs because Git cannot represent them. This helper removes empty descendants
 * while deliberately preserving the configured root directory, so downstream sync/index
 * code can still treat the root as an existing collection boundary.
 *
 * @param {String} root Absolute or repository-relative directory whose empty descendants should be pruned.
 * @returns {Promise<void>}
 */
export default async function pruneEmptyDirs(root) {
    let entries;

    try {
        entries = await fs.readdir(root, {withFileTypes: true});
    } catch {
        return; // root absent means there is nothing to prune.
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const child = path.join(root, entry.name);
        await pruneEmptyDirs(child);

        try {
            if ((await fs.readdir(child)).length === 0) {
                await fs.rmdir(child);
            }
        } catch {
            // Directory changed or disappeared during cleanup; the next sync can retry.
        }
    }
}
