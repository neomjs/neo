import fs   from 'fs-extra';
import path from 'path';

/**
 * @module ai/scripts/maintenance/knowledgeBaseArtifact
 * @summary Single source of truth for the collection-scoped Knowledge Base release artifact —
 * its canonical name, JSONL/metadata filenames, and the defense-in-depth guard that proves the
 * artifact carries ONLY the public `neo-knowledge-base` collection (never Memory Core or a
 * `sqlite/` payload).
 *
 * Shared by `uploadKnowledgeBase.mjs` (build side), `downloadKnowledgeBase.mjs` (consumer side),
 * and `buildScripts/release/publish.mjs` (pipeline) so the asset name can never drift across the
 * three surfaces again.
 *
 * @see ai/scripts/maintenance/uploadKnowledgeBase.mjs
 * @see ai/scripts/maintenance/downloadKnowledgeBase.mjs
 */

/**
 * Canonical release-asset filename. Reconciled with the asset actually published on prior
 * releases. The artifact is a zip of a flat staging dir (JSONL export + metadata), NOT a zip of
 * any on-disk data directory.
 * @type {String}
 */
export const ARTIFACT_BASENAME = 'chroma-neo-knowledge-base.zip';

/**
 * Filename prefix the KB SDK export writes (`KB_DatabaseService#exportCollection` →
 * `knowledge-base-backup-<ISO-timestamp>.jsonl`). The artifact-scope guard treats any other
 * `.jsonl` basename as a leak.
 * @type {String}
 */
export const KB_BACKUP_FILE_PREFIX = 'knowledge-base-backup-';

/**
 * Metadata sidecar filename inside the artifact. Carries `embeddingProvider` + `dimension`
 * provenance. The KB import SDK only consumes `.jsonl` files, so this `.json` sidecar rides
 * along without being ingested as a record.
 * @type {String}
 */
export const ARTIFACT_META_FILENAME = 'kb-artifact-meta.json';

/**
 * Collection-name prefixes owned by Memory Core. Their presence inside the artifact staging dir
 * (as a `<prefix>*.jsonl` export or a directory) is a hard leak — the privacy failure this whole
 * artifact-shape change exists to prevent.
 * @type {String[]}
 */
export const MEMORY_CORE_COLLECTION_PREFIXES = ['neo-agent-memory', 'neo-agent-sessions', 'neo-native-graph'];

/**
 * Asserts a staged (or unzipped) artifact directory is collection-scoped to the public
 * Knowledge Base collection. Throws on the first sign of a Memory Core leak so the failure is
 * loud at build time and at ingest time.
 *
 * Rejection conditions:
 * - Any `sqlite/` (or `*.sqlite`) entry — the graph/vector store must never ship.
 * - Any entry whose name begins with a Memory Core collection prefix.
 * - Any `.jsonl` whose basename does not begin with the KB export prefix (an unexpected export).
 *
 * The metadata sidecar (`ARTIFACT_META_FILENAME`) is the only permitted non-`.jsonl` file.
 *
 * @param {Object} options
 * @param {String} options.artifactDir Absolute path to the staged/unzipped artifact directory.
 * @param {Object} [options.fsModule=fs] Filesystem seam (tests).
 * @returns {Promise<{entries: String[], jsonlFiles: String[]}>} Inventory of the validated dir.
 */
export async function assertCollectionScopedArtifact({artifactDir, fsModule = fs}) {
    if (!await fsModule.pathExists(artifactDir)) {
        throw new Error(`Artifact directory not found: ${artifactDir}`);
    }

    const entries = await fsModule.readdir(artifactDir);
    const jsonlFiles = [];

    for (const entry of entries) {
        const lower = entry.toLowerCase();

        if (lower === 'sqlite' || lower.endsWith('.sqlite') || lower.endsWith('.sqlite3')) {
            throw new Error(`Artifact scope violation: '${entry}' is a SQLite payload. The release artifact must carry ONLY the '${KB_BACKUP_FILE_PREFIX}*.jsonl' Knowledge Base collection.`);
        }

        const leakedPrefix = MEMORY_CORE_COLLECTION_PREFIXES.find(prefix => entry.startsWith(prefix));
        if (leakedPrefix) {
            throw new Error(`Artifact scope violation: '${entry}' belongs to Memory Core collection '${leakedPrefix}'. The release artifact must carry ONLY the Knowledge Base collection.`);
        }

        if (entry.endsWith('.jsonl')) {
            if (!entry.startsWith(KB_BACKUP_FILE_PREFIX)) {
                throw new Error(`Artifact scope violation: unexpected JSONL export '${entry}'. Only '${KB_BACKUP_FILE_PREFIX}*.jsonl' (the Knowledge Base collection) is permitted.`);
            }
            jsonlFiles.push(entry);
        } else if (entry !== ARTIFACT_META_FILENAME) {
            throw new Error(`Artifact scope violation: unexpected entry '${entry}'. Permitted: '${KB_BACKUP_FILE_PREFIX}*.jsonl' and '${ARTIFACT_META_FILENAME}'.`);
        }
    }

    if (jsonlFiles.length === 0) {
        throw new Error(`Artifact scope violation: no '${KB_BACKUP_FILE_PREFIX}*.jsonl' Knowledge Base export found in ${artifactDir}.`);
    }

    return {entries, jsonlFiles};
}
