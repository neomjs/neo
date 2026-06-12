import CoreBase from '../../../../src/core/Base.mjs';

/**
 * @summary Abstract base class for Knowledge Base data sources.
 *
 * A Source is responsible for locating, reading, and yielding knowledge chunks from a specific part of the repository
 * OR (in the cross-tenant cloud-ingestion shape introduced by Epic #11624) from an external workspace pushed via the
 * Phase 2 `ingestSourceFiles` ingestion endpoint.
 *
 * ### Chunk shape contracts
 *
 * Concrete sources MUST emit chunks that conform to {@link ../parser/parsed-chunk-v1.schema.json `parsed-chunk-v1`} —
 * the ingest contract. Server-embeds via `TextEmbeddingService.embedTexts()` in `VectorService.embed()`. Records
 * carrying an `embedding` field are rejected here by design (the embedding field is reserved for the restore-only
 * sibling contract; see below).
 *
 * The restore-only sibling contract {@link ../parser/backup-record-v1.schema.json `backup-record-v1`} is NOT emitted
 * by sources. It is the wire shape produced by `DatabaseService.manageDatabaseBackup({action: 'export'})` and
 * consumed by `{action: 'import'}`; embeddings are required and preserved verbatim with no re-embedding. Restore
 * flows through `DatabaseService.importDatabase()`, NOT through any source's `extract()`.
 *
 * ### Path-identity semantics
 *
 * Per the {@link ../parser/identity-tuple.md path-identity tuple contract}, chunks emitted by sources carry
 * `{tenantId, repoSlug, rootKind, sourcePath}` in `chunk.metadata` instead of the legacy single-`neoRootDir`-relative
 * `source` string. Neo's own curated content uses `tenantId: 'neo-shared'`, `repoSlug: 'neo'`.
 *
 * ### Topology anchor
 *
 * Per ADR 0003 (Chroma Topology Unified Only): one ChromaDB daemon, three collections
 * (`knowledge-base`, `neo-agent-memory`, `neo-agent-sessions`). Sources in this directory tree write to the
 * `knowledge-base` collection only.
 *
 * @class Neo.ai.services.knowledge-base.source.Base
 * @extends Neo.core.Base
 */
class Base extends CoreBase {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.source.Base'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.source.Base'
    }

    /**
     * @summary Extracts content from this source and writes chunks to the stream.
     *
     * Implementations are responsible for traversing their source territory, parsing files into chunks, computing
     * each chunk's content-hash via `createHashFn`, and writing one JSON-per-line record to the provided
     * `writeStream`. Records MUST conform to `parsed-chunk-v1` (see class JSDoc); records carrying an `embedding`
     * field are forbidden in this path (they belong to the `backup-record-v1` restore-only contract).
     *
     * @param {Object}   writeStream  The JSONL write stream.
     * @param {Function} createHashFn Function to create content hash. Server prepends `tenantId` + `repoSlug` into
     *                                the hash input automatically — implementations do not need to thread these.
     * @returns {Promise<Number>} The number of chunks extracted.
     * @abstract
     */
    async extract(writeStream, createHashFn) {
        throw new Error('extract() must be implemented by subclass');
    }
}

export default Neo.setupClass(Base);
