/**
 * @plane in-plane
 */
import fs       from 'fs-extra';
import path     from 'path';
import readline from 'readline';
// `fs-extra`'s `open` resolves to a numeric descriptor; the positional per-row read needs a real
// `FileHandle`, so the promises API is imported explicitly rather than assumed to be the same thing.
import {open as openFileHandle} from 'node:fs/promises';

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
 * Canonical wire byte order for the packed sidecar. `Float16Array` writes in the **agent's** native
 * order, which ECMAScript leaves at the implementation's `[[LittleEndian]]` setting — and Node ships
 * a big-endian s390x build, so producer and consumer are not guaranteed to agree. The wire is
 * therefore pinned little-endian and the metadata states it, so a big-endian host byte-swaps on both
 * sides instead of silently reading every vector as noise.
 * @type {String}
 */
export const ARTIFACT_VECTOR_BYTE_ORDER = 'little-endian';

/**
 * Whether this host is little-endian. Derived once from a real two-byte probe rather than assumed,
 * because the whole point of pinning the wire order is not trusting the platform to be the common one.
 * @type {Boolean}
 */
export const HOST_IS_LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/**
 * Byte-swaps a packed fp16 buffer in place when the host order differs from the wire order.
 *
 * A no-op on the overwhelmingly common little-endian host, which is exactly why it must exist: the
 * one platform where it matters is the one nobody tests on.
 * @param {Buffer} buffer Packed fp16 bytes, mutated in place.
 * @returns {Buffer} The same buffer, in wire order.
 */
export function toWireByteOrder(buffer) {
    if (HOST_IS_LITTLE_ENDIAN) {
        return buffer
    }

    return buffer.swap16()
}

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
 * Scratch cell for the round-trip probe. Module-scoped so the hot rehydrate loop allocates nothing
 * per value — it runs `recordCount × dimension` times (~225M for the shipped corpus).
 * @type {Float16Array}
 */
const FP16_ROUND_TRIP_PROBE = new Float16Array(1);

/**
 * @summary The shortest decimal that re-quantizes to the SAME fp16 — not the shortest decimal that
 * round-trips to the same double.
 *
 * Rehydrating widens each fp16 to a double, and `JSON.stringify` then emits the shortest decimal
 * that round-trips *that double*: the fp16 value spelled out in full. An embedding stored as `0.1`
 * comes back as `0.0999755859375` — the same number, 13 characters longer. Multiplied across the
 * corpus that is the entire reason a v2 rehydrate materialises a working file LARGER than v1's,
 * even though v2's download is 5× smaller.
 *
 * This is a spelling change, never a precision change: the returned value re-quantizes to the same
 * fp16 as its input, for every finite value except one (below). It is NOT a claim that an adopter's
 * stored vectors are bit-identical — `DatabaseService.importDatabase` upserts the parsed doubles and
 * never re-quantizes, so the two emits store doubles that differ by sub-ULP-of-fp16. The vectors are
 * fp16-EQUIVALENT, not identical, which is why recall is measured rather than argued: corpus-wide
 * systematic sample, dim 4096 — recall@10 100.000%, recall@50 99.990%, top-1 identical 400/400.
 *
 * The one exception, and it is a property of JSON rather than of this function: **negative zero.**
 * The loop below correctly preserves it (`Object.is` rejects `+0` as a spelling of `-0`), but
 * `JSON.stringify(-0)` is `"0"`, so the emit flips fp16 `0x8000` to `0x0000` no matter what this
 * returns. Harmless for retrieval — ±0 contributes identically to a dot product — but the invariant
 * is "every finite fp16 EXCEPT -0", and any "bit-exact JSON round-trip" claim carries the same
 * single exception.
 *
 * Five significant digits is a proven ceiling, not a guess: fp16 carries 11 bits of significand
 * (~3.3 decimal digits), so no finite fp16 needs more to be named uniquely. The loop returns the
 * original on the (unreachable) miss rather than emitting a value that would re-quantize
 * differently — fail-safe toward correctness, never toward size.
 *
 * `Object.is` rather than `===` because fp16 has a signed zero: `-0 === 0` is true, so `===` would
 * accept `0` as a spelling of `-0` — the function must not be the thing that loses it, even though
 * serialization does.
 * @param {Number} value A value already quantized to fp16.
 * @returns {Number} The shortest-spelling number with the identical fp16 encoding.
 */
export function shortestFp16Decimal(value) {
    if (!Number.isFinite(value)) return value;

    for (let precision = 1; precision <= 5; precision++) {
        const candidate = Number(value.toPrecision(precision));

        FP16_ROUND_TRIP_PROBE[0] = candidate;

        if (Object.is(FP16_ROUND_TRIP_PROBE[0], value)) return candidate
    }

    return value
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
 * Resolves the single KB JSONL inside an artifact directory, refusing anything but exactly one.
 *
 * v2 re-attaches vectors to rows positionally against ONE row-set, so "pick the first match" is not a
 * tie-break — it is a silent choice of which file the sidecar is presumed to describe. The upload side
 * already refuses an ambiguous staging dir; the consumer must refuse it too, or a second KB-prefixed
 * JSONL slipped into a public asset decides the pairing.
 * @param {Object} options
 * @param {String} options.artifactDir Artifact directory.
 * @param {Object} [options.fsModule=fs] Filesystem seam (tests).
 * @returns {Promise<String>} Absolute path to the one KB JSONL.
 */
export async function resolveSingleArtifactJsonl({artifactDir, fsModule = fs}) {
    const matches = (await fsModule.readdir(artifactDir))
        .filter(entry => entry.startsWith(KB_BACKUP_FILE_PREFIX) && entry.endsWith('.jsonl'));

    if (matches.length !== 1) {
        throw new Error(
            `Expected exactly one '${KB_BACKUP_FILE_PREFIX}*.jsonl' in ${artifactDir}, found ${matches.length}. ` +
            `Refusing to guess which row-set the packed vectors describe.`
        );
    }

    return path.join(artifactDir, matches[0]);
}

/**
 * Streams a JSONL file line by line, invoking `onRecord` per parsed record.
 *
 * Whole-file `readFile(path, 'utf8')` is not an option at this scale and never was: the current v1
 * export is ~2.81 GiB, and Node's `buffer.constants.MAX_STRING_LENGTH` is 536,870,888 — 5.62× smaller —
 * so the naive read throws `ERR_STRING_TOO_LONG` on the real corpus while passing every small fixture.
 * @param {Object} options
 * @param {String} options.jsonlPath Absolute path to the JSONL.
 * @param {Function} options.onRecord `async (record, index) => void`.
 * @returns {Promise<Number>} Records seen.
 */
async function streamJsonlRecords({jsonlPath, onRecord}) {
    const reader = readline.createInterface({
        input    : fs.createReadStream(jsonlPath),
        crlfDelay: Infinity
    });

    let index = 0;

    for await (const line of reader) {
        if (!line.trim()) {
            continue
        }

        await onRecord(JSON.parse(line), index++);
    }

    return index
}

/**
 * Writes `chunk` to a stream, honouring backpressure.
 *
 * Ignoring the `write()` return value is what turns a streaming rewrite back into an unbounded one —
 * the queue grows in memory instead of the string doing it.
 * @param {Object} stream Writable stream.
 * @param {String|Buffer} chunk Data to write.
 * @returns {Promise<void>}
 */
function writeWithBackpressure(stream, chunk) {
    if (stream.write(chunk)) {
        return Promise.resolve()
    }

    return new Promise(resolve => stream.once('drain', resolve))
}

/**
 * Converts a staged v1 artifact directory in place to schema v2: embeddings move out of the JSONL
 * into the packed sidecar, and the JSONL keeps everything else.
 *
 * Runs on the staging dir AFTER the SDK export, so the export path itself is untouched — the SDK
 * keeps emitting its canonical v1 JSONL and this is a pure post-processing step.
 *
 * **Bounded memory by construction.** Rows stream in, each row's vector is encoded and appended to the
 * sidecar immediately, and the stripped row is appended to a sibling temp file that atomically replaces
 * the original. Peak retention is one row plus the id list for the order digest — O(dimension + rows),
 * never O(corpus bytes). The previous whole-file implementation could not run on the current corpus at
 * all (`ERR_STRING_TOO_LONG`), and no small fixture could reveal that.
 * @param {Object} options
 * @param {String} options.artifactDir Staged artifact directory.
 * @param {String} options.jsonlPath Absolute path to the staged KB JSONL.
 * @param {Number} options.dimension Expected vector length.
 * @param {Object} [options.fsModule=fs] Filesystem seam (tests).
 * @returns {Promise<{recordCount: Number, dimension: Number, vectorDigest: String, vectorBytes: Number, byteOrder: String}>}
 */
export async function packArtifactToV2({artifactDir, jsonlPath, dimension, fsModule = fs}) {
    const vectorsPath = path.join(artifactDir, ARTIFACT_VECTORS_FILENAME),
          strippedTmp = `${jsonlPath}.v2.tmp`,
          ids         = [],
          vectorSink  = fs.createWriteStream(vectorsPath),
          jsonlSink   = fs.createWriteStream(strippedTmp);

    let vectorBytes = 0;

    try {
        await streamJsonlRecords({
            jsonlPath,
            onRecord: async (record, index) => {
                if (!Array.isArray(record.embedding)) {
                    throw new Error(`Record '${record.id}' has no embedding array — refusing to pack a partially-vectorised artifact.`);
                }
                if (record.embedding.length !== dimension) {
                    throw new Error(
                        `Vector at row ${index} has length ${record.embedding.length}, expected ${dimension}. ` +
                        `Refusing to pack: a mis-sized row shifts every vector after it.`
                    );
                }

                ids.push(record.id);

                const row = toWireByteOrder(packVectorsFp16([record.embedding], dimension));

                vectorBytes += row.byteLength;
                await writeWithBackpressure(vectorSink, row);

                const {embedding, ...rest} = record;

                await writeWithBackpressure(jsonlSink, JSON.stringify(rest) + '\n');
            }
        });
    } finally {
        await Promise.all([
            new Promise(resolve => vectorSink.end(resolve)),
            new Promise(resolve => jsonlSink.end(resolve))
        ]);
    }

    // Replace only after both streams closed cleanly, so a mid-pack failure leaves the v1 JSONL intact.
    await fsModule.move(strippedTmp, jsonlPath, {overwrite: true});

    return {
        recordCount : ids.length,
        dimension,
        vectorDigest: recordOrderDigest(ids),
        vectorBytes,
        byteOrder   : ARTIFACT_VECTOR_BYTE_ORDER
    };
}

/**
 * Restores a v2 artifact directory to v1 shape (embeddings inline in the JSONL) so the KB import SDK
 * consumes it unchanged. A genuine v1 artifact is a no-op, which is what keeps older assets importable.
 *
 * **Fails closed on the STAMPED contract, not on sidecar presence.** Schema state is read from the
 * metadata: a v2 artifact whose sidecar is missing is an error, never a silent v1 import that would
 * ingest every record with no embedding at all. Unknown versions, a non-`fp16` encoding, an absent
 * digest, a foreign byte order, a row-count mismatch, or a reordered JSONL all abort — positional
 * re-attachment is only safe while every one of those is proven.
 *
 * Bounded memory: rows stream and each vector is read from the sidecar at its own offset, so peak
 * retention is one row rather than the whole corpus.
 * @param {Object} options
 * @param {String} options.artifactDir Unzipped artifact directory.
 * @param {Object} [options.fsModule=fs] Filesystem seam (tests).
 * @returns {Promise<{rehydrated: Boolean, recordCount: Number}>}
 */
export async function rehydrateArtifactFromV2({artifactDir, fsModule = fs}) {
    const metaPath    = path.join(artifactDir, ARTIFACT_META_FILENAME),
          vectorsPath = path.join(artifactDir, ARTIFACT_VECTORS_FILENAME),
          hasSidecar  = await fsModule.pathExists(vectorsPath),
          hasMeta     = await fsModule.pathExists(metaPath);

    if (!hasMeta) {
        if (hasSidecar) {
            throw new Error(`Artifact carries '${ARTIFACT_VECTORS_FILENAME}' but no '${ARTIFACT_META_FILENAME}' — the sidecar is undecodable without its stamped record count, dimension and digest.`);
        }
        // No metadata and no sidecar: a pre-provenance v1 asset. Nothing to re-attach.
        return {rehydrated: false, recordCount: 0}
    }

    const meta                                                                               = JSON.parse(await fsModule.readFile(metaPath, 'utf8')),
          {artifactVersion, vectorEncoding, dimension, recordCount, vectorDigest, byteOrder} = meta;

    // Schema state comes from the STAMP. Deriving it from sidecar presence is what let a v2 artifact
    // with a lost sidecar import as vectorless v1 — the failure a consumer can least afford to guess at.
    const declaredVersion = artifactVersion ?? 1;

    if (declaredVersion === 1) {
        if (hasSidecar) {
            throw new Error(`Artifact declares artifactVersion 1 but carries '${ARTIFACT_VECTORS_FILENAME}'. Refusing a contradictory artifact rather than choosing which half to believe.`);
        }
        return {rehydrated: false, recordCount: 0}
    }

    if (declaredVersion !== ARTIFACT_SCHEMA_VERSION) {
        throw new Error(
            `Artifact declares schema version ${declaredVersion}; this consumer understands ${ARTIFACT_SCHEMA_VERSION}. ` +
            `Refusing to half-decode a format written by a newer producer — upgrade rather than guess.`
        );
    }

    if (!hasSidecar) {
        throw new Error(
            `Artifact declares schema version ${declaredVersion} but '${ARTIFACT_VECTORS_FILENAME}' is missing. ` +
            `Importing would silently ingest every record with NO embedding; refusing.`
        );
    }

    if (vectorEncoding !== 'fp16') {
        throw new Error(`Artifact declares vectorEncoding '${vectorEncoding}'; this consumer decodes 'fp16' only.`);
    }

    // Strict numerics, not truthiness: `dimension: "3"` is truthy and would multiply into a correct-looking
    // byte length via string coercion, so a JSON-typed field slip would pass the geometry check it exists to fail.
    for (const [field, value] of [['dimension', dimension], ['recordCount', recordCount]]) {
        if (!Number.isInteger(value) || value <= 0) {
            throw new Error(
                `Artifact metadata field '${field}' must be a positive integer, got ${JSON.stringify(value)} ` +
                `(${typeof value}). Refusing to derive the sidecar geometry from a coerced value.`
            );
        }
    }

    if (!vectorDigest) {
        throw new Error(
            `Artifact declares schema version ${declaredVersion} without a 'vectorDigest'. ` +
            `The digest is the only thing that proves the row order the positional pairing assumes — it is mandatory, not optional.`
        );
    }

    // Required, never defaulted. Defaulting an absent stamp re-creates the failure this whole gate exists to
    // prevent: it lets the consumer ASSUME the order it happens to run on, which is exactly what a
    // producer on a differently-ordered host would violate silently. The Contract Ledger says required,
    // so the code must too — a ledger the implementation contradicts is worse than no ledger.
    if (!byteOrder) {
        throw new Error(
            `Artifact declares schema version ${declaredVersion} without a 'byteOrder'. ` +
            `The wire order is mandatory for v2 — an absent stamp cannot be assumed to match this host.`
        );
    }

    if (byteOrder !== ARTIFACT_VECTOR_BYTE_ORDER) {
        throw new Error(`Artifact declares byteOrder '${byteOrder}'; the wire contract is '${ARTIFACT_VECTOR_BYTE_ORDER}'.`);
    }

    const jsonlPath   = await resolveSingleArtifactJsonl({artifactDir, fsModule}),
          rowBytes    = dimension * 2,
          expectedLen = recordCount * rowBytes,
          actualLen   = (await fsModule.stat(vectorsPath)).size;

    if (actualLen !== expectedLen) {
        throw new Error(
            `Packed vector sidecar is ${actualLen} bytes, expected ${expectedLen} ` +
            `(${recordCount} records × ${dimension} dims × 2). Artifact is truncated or its metadata is wrong.`
        );
    }

    // Order is proven BEFORE any vector is attached: a permutation pairs every row with the wrong
    // embedding at exactly the right buffer size, so a length check cannot see it.
    const ids = [];

    await streamJsonlRecords({jsonlPath, onRecord: record => { ids.push(record.id) }});

    if (ids.length !== recordCount) {
        throw new Error(`Artifact JSONL holds ${ids.length} records but metadata claims ${recordCount}. Refusing to re-attach vectors positionally.`);
    }

    if (recordOrderDigest(ids) !== vectorDigest) {
        throw new Error(
            `Artifact record order does not match the stamped vector digest (${vectorDigest}). ` +
            `The JSONL was reordered or rewritten after packing — re-attaching by index would pair every record with the wrong embedding.`
        );
    }

    const rehydratedTmp = `${jsonlPath}.v1.tmp`,
          sink          = fs.createWriteStream(rehydratedTmp),
          handle        = await openFileHandle(vectorsPath, 'r'),
          rowBuffer     = Buffer.allocUnsafe(rowBytes);

    try {
        await streamJsonlRecords({
            jsonlPath,
            onRecord: async (record, index) => {
                await handle.read(rowBuffer, 0, rowBytes, index * rowBytes);

                // Swap a COPY: the shared row buffer is reused every iteration, and swapping in place
                // would corrupt the next read's view on a big-endian host.
                const wire   = toWireByteOrder(Buffer.from(rowBuffer)),
                      vector = new Float16Array(wire.buffer, wire.byteOffset, dimension);

                // `Array.from(vector)` alone would emit each fp16 spelled out as its exact double
                // (`0.1` → `0.0999755859375`), which is what makes the rehydrated working file
                // larger than the v1 it reconstructs. Re-spelling is lossless: every value below
                // re-quantizes to the identical fp16.
                await writeWithBackpressure(sink, JSON.stringify({
                    ...record, embedding: Array.from(vector, shortestFp16Decimal)
                }) + '\n');
            }
        });
    } finally {
        await handle.close();
        await new Promise(resolve => sink.end(resolve));
    }

    await fsModule.move(rehydratedTmp, jsonlPath, {overwrite: true});
    // The SDK import only reads `.jsonl`, but leaving the sidecar behind would let a re-run
    // double-rehydrate an already-inline JSONL. Removing it makes the operation idempotent.
    await fsModule.remove(vectorsPath);

    return {rehydrated: true, recordCount};
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

    const entries    = await fsModule.readdir(artifactDir);
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
