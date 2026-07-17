import {existsSync}                              from 'fs';
import fs                                        from 'fs/promises';
import path                                      from 'path';
import {parseContentPath, pathSegmentOptionsFor} from './contentPath.mjs';
import {readContentIndex, contentRootFor}        from './contentIndex.mjs';

/**
 * @module ai/services/github-workflow/shared/contentInventory
 * @summary The complete on-disk corpus for a content type, and the integrity verdict over it.
 *
 * **Why this exists.** The syncers plan placement from `metadata.{type}` plus the current delta
 * fetch. Both are partial by design — the delta sync rebuilds its cache from each run's fetch — so a
 * planner reading only those sees a fraction of a bucket and computes an ordinal against it. An
 * ordinal derived from a partial collection is not a smaller truth, it is a different number: the
 * item lands in a chunk that the complete ordering would never have chosen, beside the copy that is
 * already there. The corpus on disk is the only complete membership that exists, because the files
 * outlive every cache that describes them.
 *
 * **What "complete" costs.** A full scan of both tiers, per type, per sync. That is the price of
 * planning against reality; the alternative is a cache that must never drift, which is the thing
 * that already failed.
 *
 * @see ai/services/github-workflow/shared/contentPath.mjs (the path math, both directions)
 * @see learn/agentos/decisions/0004-github-content-architecture.md (sealed archive + index contract)
 */

/**
 * @summary Scans the complete corpus for one content type — active tier plus every archive bucket.
 *
 * Keyed by GitHub id. The value is an **array**, not a single entry, because "one artifact per id"
 * is the invariant under test rather than an assumption this helper may make: a Map<id, entry> would
 * silently drop the second copy and report a clean corpus, which is precisely the blindness that let
 * divergent duplicates accumulate unnoticed.
 *
 * @param {Object} issueSyncConfig GitHub workflow `issueSync` config block
 * @param {Object} options
 * @param {'issues'|'pulls'|'discussions'} options.type Content type segment
 * @param {String} options.filePrefix File-leaf prefix (e.g. `'pr-'`, `'issue-'`)
 * @returns {Promise<Map<Number, Array<{absPath: String, version: String|null, bucket: String|null, chunkNumber: Number}>>>}
 */
export async function buildContentInventory(issueSyncConfig = {}, {type, filePrefix} = {}) {
    const contentRoot = contentRootFor(issueSyncConfig),
          // The segment vocabularies are configured, not universal — a hardcoded parse agrees with
          // the default and diverges silently under any override.
          segments    = pathSegmentOptionsFor(issueSyncConfig),
          idPattern   = new RegExp(`(?:^|[\\\\/])${filePrefix}(\\d+)\\.md$`),
          inventory   = new Map();

    const scan = async root => {
        if (!existsSync(root)) return;

        for (const rel of await fs.readdir(root, {recursive: true})) {
            const match = rel.match(idPattern);

            if (!match) continue;

            const absPath = path.join(root, rel),
                  parsed  = parseContentPath({contentRoot, filePath: absPath, ...segments});

            // A file whose path does not parse is off-contract (wrong depth, no chunk dir). Record
            // it with null coordinates rather than skipping: an unparseable artifact is exactly the
            // kind of thing an integrity pass must surface, and dropping it here would hide it.
            const id = parseInt(match[1], 10);

            if (!inventory.has(id)) inventory.set(id, []);

            inventory.get(id).push({
                absPath,
                version    : parsed?.version     ?? null,
                bucket     : parsed?.bucket      ?? null,
                chunkNumber: parsed?.chunkNumber ?? null
            });
        }
    };

    await scan(path.join(contentRoot, type));
    await scan(path.join(contentRoot, 'archive', type));

    // Stable ordering so a duplicate's "first" copy is deterministic across platforms — callers
    // reporting a divergent pair must name the same two files on every machine.
    for (const copies of inventory.values()) {
        copies.sort((a, b) => a.absPath.localeCompare(b.absPath));
    }

    return inventory;
}

/**
 * @summary Resolves the single archived artifact for an id, or reports why there isn't one.
 *
 * The placement rule this serves: a terminal item that already owns exactly one archived artifact
 * keeps it. That is the sealed-archive semantic expressed as a lookup — and it is also what stops a
 * second copy appearing, since a refresh writes to the location the item already occupies instead of
 * to a freshly recomputed one.
 *
 * Ambiguity is returned, never resolved. Two artifacts for one id means the corpus is already
 * corrupt; picking one here would launder that corruption into a confident answer.
 *
 * @param {Map<Number, Array<Object>>} inventory Output of {@link buildContentInventory}
 * @param {Number} id GitHub identifier
 * @returns {{status: 'none'|'unique'|'ambiguous', entry: Object|null, copies: Array<Object>}}
 */
export function resolveArchivedLocation(inventory, id) {
    const copies   = (inventory.get(id) || []).filter(copy => copy.version || copy.bucket),
          statuses = {0: 'none', 1: 'unique'};

    return {
        status: statuses[copies.length] || 'ambiguous',
        entry : copies.length === 1 ? copies[0] : null,
        copies
    };
}

/**
 * @summary Proves — or refutes — that the corpus and `_index.json` agree, and that each id owns one artifact.
 *
 * Reports counts alongside every finding. A verdict of "zero stale entries" is only meaningful next
 * to the number of entries actually examined: a probe aimed at the wrong shape returns zero for
 * every question, and a clean-looking zero from a blind instrument is indistinguishable from health.
 * `indexedTotal` and `corpusTotal` are the positive controls that make the zeros legible.
 *
 * Duplicates split by content because the two classes have different repairs. Byte-identical copies
 * are one artifact written twice and may be collapsed deterministically. Byte-divergent copies are
 * two different renderings of one PR, and nothing on disk says which is current — `reconcileActiveChunks`'
 * keep-first dedup is safe in the active tier only because the next sync rewrites the survivor from
 * GitHub; applied to a sealed archive it would silently canonicalise an arbitrary copy. So divergence
 * is reported for repair from source, never resolved by position.
 *
 * @param {Object} issueSyncConfig GitHub workflow `issueSync` config block
 * @param {Object} options
 * @param {'issues'|'pulls'|'discussions'} options.type Content type segment
 * @param {String} options.filePrefix File-leaf prefix (e.g. `'pr-'`)
 * @param {Map<Number, Array<Object>>} [options.inventory] Pre-built inventory; scanned when omitted
 * @returns {Promise<{type: String, ok: Boolean, indexedTotal: Number, corpusTotal: Number, uniqueIds: Number, staleIndexEntries: Array<Object>, inconsistentIndexEntries: Array<Object>, duplicateIndexEntryIds: Array<Number>, unindexedIds: Array<Number>, identicalDuplicateIds: Array<Number>, divergentDuplicateIds: Array<Number>}>}
 */
export async function validateContentIntegrity(issueSyncConfig = {}, {type, filePrefix, inventory} = {}) {
    const contentRoot = contentRootFor(issueSyncConfig),
          segments    = pathSegmentOptionsFor(issueSyncConfig),
          corpus      = inventory || await buildContentInventory(issueSyncConfig, {type, filePrefix}),
          indexed     = (await readContentIndex(issueSyncConfig)).filter(entry => entry.type === type);

    const staleIndexEntries        = [],
          inconsistentIndexEntries = [];

    for (const entry of indexed) {
        if (!existsSync(path.resolve(contentRoot, entry.path))) {
            staleIndexEntries.push(entry);
            continue;
        }

        // An entry's coordinates must agree with its own path. They can drift apart whenever the
        // chunk is derived from a planned ordinal while the file is written somewhere else — the
        // entry then names a real file and still lies about where it sits, which every check that
        // only tests path existence will pass. Compared against the path the entry itself carries,
        // so this needs no filesystem opinion beyond the file being there.
        const parsed = parseContentPath({contentRoot, filePath: entry.path, ...segments});

        if (!parsed || parsed.chunkNumber !== entry.chunkNumber || (parsed.version ?? null) !== (entry.version ?? null)) {
            inconsistentIndexEntries.push({
                entry,
                actual: parsed && {version: parsed.version, chunkNumber: parsed.chunkNumber}
            });
        }
    }

    // Duplicate rows for one id. `updateContentIndex` keys by `{type, id}` and so cannot create them,
    // which is exactly why they must be checked on READ: a hand-edit, a bad merge, or any writer that
    // appends rather than upserts produces two assertions about where one id lives, and every
    // path-existence check passes on both. The first one wins at lookup, silently and arbitrarily.
    const seenIds                = new Set(),
          duplicateIndexEntryIds = [];

    for (const entry of indexed) {
        const id = Number(entry.id);

        seenIds.has(id) ? duplicateIndexEntryIds.push(id) : seenIds.add(id);
    }

    const indexedIds   = seenIds,
          unindexedIds = [...corpus.keys()].filter(id => !indexedIds.has(id));

    const identicalDuplicateIds = [],
          divergentDuplicateIds = [];

    let corpusTotal = 0;

    for (const [id, copies] of corpus) {
        corpusTotal += copies.length;

        if (copies.length < 2) continue;

        const contents = await Promise.all(copies.map(copy => fs.readFile(copy.absPath)));

        contents.every(buffer => buffer.equals(contents[0]))
            ? identicalDuplicateIds.push(id)
            : divergentDuplicateIds.push(id);
    }

    return {
        type,
        ok          : staleIndexEntries.length === 0 && inconsistentIndexEntries.length === 0 &&
                      duplicateIndexEntryIds.length === 0 && unindexedIds.length === 0 &&
                      identicalDuplicateIds.length === 0 && divergentDuplicateIds.length === 0,
        indexedTotal: indexed.length,
        corpusTotal,
        uniqueIds   : corpus.size,
        staleIndexEntries,
        inconsistentIndexEntries,
        duplicateIndexEntryIds,
        unindexedIds,
        identicalDuplicateIds,
        divergentDuplicateIds
    };
}

/**
 * @summary Renders an integrity result as a human-readable report.
 * @param {Object} result Output of {@link validateContentIntegrity}
 * @returns {String}
 */
export function formatIntegrityReport(result = {}) {
    const lines = [
        `content integrity — ${result.type}`,
        `  indexed entries      : ${result.indexedTotal}`,
        `  corpus artifacts     : ${result.corpusTotal}`,
        `  unique ids           : ${result.uniqueIds}`,
        `  stale indexed paths  : ${result.staleIndexEntries?.length ?? 0}`,
        `  inconsistent entries : ${result.inconsistentIndexEntries?.length ?? 0}`,
        `  duplicate index rows : ${result.duplicateIndexEntryIds?.length ?? 0}`,
        `  unindexed artifacts  : ${result.unindexedIds?.length ?? 0}`,
        `  identical duplicates : ${result.identicalDuplicateIds?.length ?? 0}`,
        `  divergent duplicates : ${result.divergentDuplicateIds?.length ?? 0}`,
        `  verdict              : ${result.ok ? 'PASS' : 'FAIL'}`
    ];

    return lines.join('\n');
}
