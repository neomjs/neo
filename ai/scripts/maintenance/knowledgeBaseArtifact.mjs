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
 * Packed-vector sidecar filename for artifact schema v2. A flat row-major `Float16` buffer of
 * `recordCount × dimension` values; the JSONL rows carry everything EXCEPT `embedding`.
 *
 * Why binary: ~97% of a v1 artifact is embeddings serialized as decimal TEXT. The vectors
 * themselves are not the waste — the encoding is. `fp16` was chosen over `fp32` on measurement,
 * not arithmetic: on a corpus-wide 10% sample (5,492 vectors, dim 4096) fp16 round-trip scored
 * recall@10 100.000% and recall@50 99.983% against fp32, with top-1 identical at both depths.
 *
 * The raw-vectors / no-re-embed invariant is UNCHANGED: the vectors still ship in full, just not
 * as decimal text, so an adopter never re-embeds the corpus on boot.
 * @type {String}
 */
export const ARTIFACT_VECTORS_FILENAME = 'kb-vectors-fp16.bin';

/**
 * Artifact schema version this build/consume pair emits and understands. v1 = embeddings inline in
 * the JSONL as decimal text; v2 = JSONL without `embedding` + the packed `fp16` sidecar.
 * @type {Number}
 */
export const ARTIFACT_SCHEMA_VERSION = 2;

/**
 * Order-binding digest over the record-id sequence.
 *
 * v2 re-attaches vectors to rows **by index**, so a reordered JSONL would pair every row with the
 * wrong vector — a silent corruption that no byte-length check can see (the buffer stays exactly
 * the right size). This digest makes that failure LOUD: the build side stamps it into the metadata
 * and the consume side recomputes it from the JSONL it actually received. A mismatch means the
 * pairing is untrustworthy and the import must abort rather than ingest misaligned embeddings.
 *
 * FNV-1a over the newline-joined ids: order-sensitive by construction, no crypto dependency, and
 * the whole point is detecting permutation rather than resisting an adversary.
 * @param {String[]} ids Record ids in JSONL row order.
 * @returns {String} Hex digest.
 */
export function recordOrderDigest(ids) {
    let hash = 0x811c9dc5;

    for (const chunk of ids.join('\n')) {
        hash ^= chunk.codePointAt(0);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }

    return hash.toString(16).padStart(8, '0');
}

/**
 * Encodes vectors to the packed `fp16` sidecar buffer.
 * @param {Array<Array<Number>|Float32Array>} vectors Row-major vectors, all of length `dimension`.
 * @param {Number} dimension Expected vector length; a row of any other length is a hard error
 *        because a short row would silently shift every subsequent vector.
 * @returns {Buffer}
 */
export function packVectorsFp16(vectors, dimension) {
    const packed = new Float16Array(vectors.length * dimension);

    vectors.forEach((vector, row) => {
        if (vector.length !== dimension) {
            throw new Error(
                `Vector at row ${row} has length ${vector.length}, expected ${dimension}. ` +
                `Refusing to pack: a mis-sized row shifts every vector after it.`
            );
        }
        packed.set(vector, row * dimension);
    });

    return Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength);
}

/**
 * Decodes the packed sidecar back to per-row vectors, failing loud on any shape or order mismatch.
 * @param {Object} options
 * @param {Buffer} options.buffer Packed sidecar contents.
 * @param {Number} options.recordCount Expected row count (from the artifact metadata).
 * @param {Number} options.dimension Expected vector length (from the artifact metadata).
 * @returns {Float32Array[]} One vector per row, in row order.
 */
export function unpackVectorsFp16({buffer, recordCount, dimension}) {
    const expectedBytes = recordCount * dimension * 2;

    if (buffer.byteLength !== expectedBytes) {
        throw new Error(
            `Packed vector sidecar is ${buffer.byteLength} bytes, expected ${expectedBytes} ` +
            `(${recordCount} records × ${dimension} dims × 2). Artifact is truncated or its metadata is wrong.`
        );
    }

    // Copy rather than view: the source Buffer may be a slice of a pooled allocation, and a view
    // would keep the whole pool alive while also exposing neighbouring bytes on a length mistake.
    const view = new Float16Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

    return Array.from({length: recordCount}, (_, row) =>
        Float32Array.from(view.subarray(row * dimension, (row + 1) * dimension))
    );
}

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
        } else if (entry !== ARTIFACT_META_FILENAME && entry !== ARTIFACT_VECTORS_FILENAME) {
            // Schema v2 adds EXACTLY ONE permitted binary — an exact-match allowlist entry, never a
            // pattern. This guard is the privacy invariant that keeps Memory Core exports and sqlite
            // payloads out of a public release asset, so widening it to `*.bin` (or anything
            // pattern-shaped) would trade the whole guarantee for one file's convenience.
            throw new Error(`Artifact scope violation: unexpected entry '${entry}'. Permitted: '${KB_BACKUP_FILE_PREFIX}*.jsonl', '${ARTIFACT_META_FILENAME}' and '${ARTIFACT_VECTORS_FILENAME}'.`);
        }
    }

    if (jsonlFiles.length === 0) {
        throw new Error(`Artifact scope violation: no '${KB_BACKUP_FILE_PREFIX}*.jsonl' Knowledge Base export found in ${artifactDir}.`);
    }

    return {entries, jsonlFiles};
}
