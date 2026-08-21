import {EMBEDDING_INPUT_FORMAT_ID, EMBEDDING_INPUT_FORMAT_METADATA_KEY}
                              from './embeddingInputFormat.mjs';

/**
 * @summary Flattens one chunk into Chroma-storable scalar metadata, stamped with the format its
 * vector was built from.
 *
 * Pure and Neo-free, and lifted out of `VectorService` for the reason the sibling helpers here were:
 * the service is a connect-on-init singleton whose `initAsync` awaits `ChromaManager.ready()`, so a
 * unit spec cannot import it to exercise this writer. Living here, the production write path is
 * directly reachable — the alternative was tests that construct the stamp themselves and therefore
 * stay green when the producer stops emitting it.
 *
 * The single producer for both the full-batch upsert and the partial upsert a cooperative lease yield
 * performs. Two sites deriving this independently could drift, and drift here means a stored vector
 * whose metadata disagrees with the vector beside it.
 * @param {Object} chunk Tenant-stamped chunk.
 * @returns {Object} Scalar-only metadata carrying the format id.
 */
export function buildChunkRowMetadata(chunk) {
    const metadata = {};

    for (const [key, value] of Object.entries(chunk)) {
        metadata[key] = (value === null) ? 'null' : (typeof value === 'object') ? JSON.stringify(value) : value;
    }

    // Stamped here rather than onto the chunk, because three upsert sites call this function and a
    // chunk-side stamp is three places to forget.
    //
    // AFTER the copy loop, and that order is load-bearing: a chunk carrying a field of this name
    // must not be able to declare which format its vector was built from. The row's claim comes from
    // the module that owns the format, never from parsed content.
    metadata[EMBEDDING_INPUT_FORMAT_METADATA_KEY] = EMBEDDING_INPUT_FORMAT_ID;

    return metadata
}
