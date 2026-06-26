import {existsSync}                                from 'fs';
import fs                                          from 'fs/promises';
import path                                        from 'path';
import contentPath                                 from './contentPath.mjs';
import pruneEmptyDirs                              from './pruneEmptyDirs.mjs';
import {createContentIndexEntry, updateContentIndex} from './contentIndex.mjs';

/**
 * @module ai/services/github-workflow/shared/reconcileActiveChunks
 * @summary Re-chunks an active content tier into the universal ordinal-100 layout.
 *
 * The active-tier sibling of the syncers' `reconcileClosed*Locations` (which only relocate
 * **terminal** items to the sealed archive). Ordinal-100 chunking is **position-dependent**: each
 * item's chunk is `Math.floor(rank / itemsPerChunk) + 1`, where `rank` is its position among ALL
 * active items sorted ascending by GitHub id (the universal ordinal-100 rule). So whenever items are added or
 * archived, the surviving items' ranks shift and their correct chunk changes. The delta-driven
 * syncers only re-place the items they touch in a given run, leaving the rest in stale folders —
 * the drift that lets `chunk-N/` folders fall off the exact-100 invariant (overlapping ranges,
 * 1-item folders, etc.).
 *
 * This pass re-ranks the FULL active corpus on disk and `fs.rename`s any mis-located file to its
 * ordinal target, then realigns the `_index.json` deep-link entries for the moved items. It is
 * **idempotent** — a no-op when the tier is already ordinal-correct — so it is safe to run on every
 * sync/rebuild. Archive tiers are sealed (immutable once a release is cut) and are never touched.
 *
 * @param {Object} issueSyncConfig The github-workflow `issueSync` config block. Only `contentRoot`
 *     (absolute `resources/content`) is required; passing the full block is fine.
 * @param {Object} options
 * @param {'issues'|'pulls'|'discussions'} options.type Content type segment.
 * @param {String} options.filePrefix File-leaf prefix (e.g. `'pr-'`, `'issue-'`, `'discussion-'`).
 * @param {Number} [options.itemsPerChunk=100] Items per chunk (ADR-mandated 100).
 * @returns {Promise<{type: String, total: Number, moved: Number, deduped: Number}>} Unique item
 *     count + relocations made + duplicate copies removed.
 * @see ai/services/github-workflow/shared/contentPath.mjs
 * @see learn/agentos/decisions/0004-github-content-architecture.md
 */
export default async function reconcileActiveChunks(issueSyncConfig = {}, {type, filePrefix, itemsPerChunk = 100} = {}) {
    const
        contentRoot = issueSyncConfig.contentRoot,
        activeDir   = path.join(contentRoot, type);

    if (!existsSync(activeDir)) {
        return {type, total: 0, moved: 0};
    }

    // Match `{prefix}<id>.md` leaves anywhere under the active tier (current chunk-* folders).
    const idPattern = new RegExp(`(?:^|[\\\\/])${filePrefix}(\\d+)\\.md$`);

    // Full active corpus, ranked ascending by id — the ordinal the chunk math is defined against.
    const items = (await fs.readdir(activeDir, {recursive: true}))
        .map(rel => {
            const match = rel.match(idPattern);
            return match ? {id: parseInt(match[1], 10), absPath: path.join(activeDir, rel)} : null
        })
        .filter(Boolean)
        .sort((a, b) => a.id - b.id || a.absPath.localeCompare(b.absPath));

    // Dedup by id: a drifted tier can hold the same id in more than one chunk (a stale copy a prior
    // sync left behind). Keep the first occurrence and unlink the rest — otherwise a duplicate
    // consumes an ordinal slot and shifts every later item's chunk by one.
    const unique  = [];
    let   deduped = 0;

    for (const item of items) {
        if (unique.length > 0 && unique[unique.length - 1].id === item.id) {
            await fs.unlink(item.absPath);
            deduped++;
            // `[WARN]` prefix so the orchestrator's ProcessSupervisor classifies this child-stderr
            // line as WARN, not its unprefixed-default ERROR (routine dedup ≠ error).
            console.warn(`[WARN] [reconcileActiveChunks] removed duplicate ${filePrefix}${item.id}.md at ${item.absPath}`)
        } else {
            unique.push(item)
        }
    }

    const upsert = [];
    let   moved  = 0;

    for (let itemIndex = 0; itemIndex < unique.length; itemIndex++) {
        const
            {id, absPath} = unique[itemIndex],
            filename      = `${filePrefix}${id}.md`,
            targetPath    = contentPath({contentRoot, type, filename, itemIndex, itemsPerChunk});

        if (absPath !== targetPath) {
            await fs.mkdir(path.dirname(targetPath), {recursive: true});
            await fs.rename(absPath, targetPath);
            moved++
        }

        // Realign the deep-link index entry to the (possibly new) chunk so `getIssueById` / KB
        // ingestion never resolve a stale path after a relocation.
        upsert.push(createContentIndexEntry({
            issueSyncConfig, type, id, filePath: targetPath, itemIndex, version: null, bucket: null, itemsPerChunk
        }))
    }

    if (upsert.length > 0) {
        await updateContentIndex(issueSyncConfig, {upsert})
    }

    // Drop folders emptied by relocation (e.g. the 1-item chunk-12/14/18 drift buckets).
    await pruneEmptyDirs(activeDir);

    return {type, total: unique.length, moved, deduped}
}
