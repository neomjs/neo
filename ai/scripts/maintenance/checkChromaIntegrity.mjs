/**
 * @plane host
 */
import {program}       from 'commander';
import {ChromaClient}  from 'chromadb';
import {execFile}      from 'child_process';
import fs              from 'fs-extra';
import os              from 'os';
import path            from 'path';
import {pathToFileURL} from 'url';
import {promisify}     from 'util';
import Neo             from '../../../src/Neo.mjs';
import AiConfig        from '../../config.mjs';
import kbConfig        from '../../mcp/server/knowledge-base/config.mjs';
import mcConfig        from '../../mcp/server/memory-core/config.mjs';
import {
    createDynamicTextEmbeddingFunction,
    registerNeoChromaEmbeddingFunctions
} from '../../services/shared/vector/chromaClientPrimitives.mjs';

/**
 * @summary On-demand Chroma integrity diagnostic for unified-store SQLite and API read paths.
 *
 * This script is intentionally outside KB/MC healthcheck hot paths. It copies
 * `chroma.sqlite3` to a temporary snapshot before running SQLite integrity pragmas,
 * then performs read-only Chroma API probes against the configured collections.
 * It never runs `REINDEX`, `VACUUM`, delete/recreate, or live-store repair.
 *
 * Usage:
 *   node ai/scripts/maintenance/checkChromaIntegrity.mjs
 *   node ai/scripts/maintenance/checkChromaIntegrity.mjs --skip-api
 *   node ai/scripts/maintenance/checkChromaIntegrity.mjs --sqlite /path/to/chroma.sqlite3 --json
 *
 * @module ai.scripts.maintenance.checkChromaIntegrity
 * @see learn/agentos/decisions/0017-chroma-single-flat-unified-store.md
 * @see learn/agentos/tooling/RestorationRunbook.md
 */

const execFileAsync = promisify(execFile);
void Neo;

export const DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE = 5;
export const DEFAULT_VECTOR_COVERAGE_SAMPLE_SIZE                = 5;

const METADATA_SEGMENT_SCOPE = 'METADATA',
      VECTOR_SEGMENT_SCOPE   = 'VECTOR';

registerNeoChromaEmbeddingFunctions({
    dummyEmbeddingFunction: AiConfig.dummyEmbeddingFunction
});

/**
 * @param {String} output
 * @returns {{ok: Boolean, output: String}}
 */
export function classifySqliteCheck(output) {
    const normalized = String(output || '').trim();

    return {
        ok    : normalized === 'ok',
        output: normalized
    }
}

/**
 * @param {Object} options
 * @param {String} [options.sqlitePath]
 * @param {Object} [options.memoryCoreConfig=mcConfig]
 * @returns {String}
 */
export function resolveSqlitePath({sqlitePath, memoryCoreConfig = mcConfig} = {}) {
    if (sqlitePath) {
        return path.resolve(sqlitePath)
    }

    return path.join(memoryCoreConfig.engines.chroma.dataDir, 'chroma.sqlite3')
}

/**
 * @param {Object} options
 * @param {Object} [options.knowledgeBaseConfig=kbConfig]
 * @param {Object} [options.memoryCoreConfig=mcConfig]
 * @returns {String[]}
 */
export function resolveCollectionNames({
    knowledgeBaseConfig = kbConfig,
    memoryCoreConfig    = mcConfig
} = {}) {
    return [
        knowledgeBaseConfig.collectionName,
        memoryCoreConfig.collections.memory,
        memoryCoreConfig.collections.session,
        memoryCoreConfig.collections.graph
    ].filter(Boolean)
}

/**
 * @param {Object[]} collectionResults
 * @returns {Number}
 */
export function countFailedApiSteps(collectionResults = []) {
    return collectionResults.reduce((count, collection) => {
        return count + (collection.steps || []).filter(step => step.ok === false).length
    }, 0)
}

/**
 * @summary Counts vector-coverage rows which found metadata/vector drift or missing vector metadata.
 * @param {Object[]} coverageResults
 * @returns {Number}
 */
export function countFailedCoverageRows(coverageResults = []) {
    return coverageResults.filter(row => row.ok === false).length
}

/**
 * @param {Object} options
 * @param {String} options.sourcePath
 * @param {Object} [options.fsModule=fs]
 * @param {String} [options.tmpRoot=os.tmpdir()]
 * @returns {Promise<{snapshotPath: String, tmpDir: String}>}
 */
export async function copySqliteSnapshot({
    sourcePath,
    fsModule = fs,
    tmpRoot  = os.tmpdir()
} = {}) {
    if (!await fsModule.pathExists(sourcePath)) {
        throw new Error(`Chroma SQLite file not found: ${sourcePath}`)
    }

    const tmpDir       = await fsModule.mkdtemp(path.join(tmpRoot, 'neo-chroma-integrity-')),
          snapshotPath = path.join(tmpDir, 'chroma.sqlite3');

    await fsModule.copy(sourcePath, snapshotPath);

    return {snapshotPath, tmpDir}
}

/**
 * @param {Object} options
 * @param {String} options.snapshotPath
 * @param {String} options.pragma
 * @param {Function} [options.execFn=execFileAsync]
 * @returns {Promise<Object>}
 */
export async function runSqlitePragma({
    snapshotPath,
    pragma,
    execFn = execFileAsync
} = {}) {
    try {
        const {stdout} = await execFn('sqlite3', [snapshotPath, `pragma ${pragma};`], {
            maxBuffer: 64 * 1024 * 1024
        });

        return classifySqliteCheck(stdout)
    } catch (error) {
        return {
            ok    : false,
            output: '',
            error : error.message
        }
    }
}

/**
 * @param {String} label
 * @param {Function} fn
 * @returns {Promise<Object>}
 */
async function runStep(label, fn) {
    try {
        return {
            label,
            ok   : true,
            value: await fn()
        }
    } catch (error) {
        return {
            label,
            ok   : false,
            error: error.message
        }
    }
}

/**
 * @param {*} value
 * @returns {Number}
 */
export function normalizeExportabilitySampleSize(value) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 1) {
        return DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE
    }

    return Math.floor(parsed)
}

/**
 * @summary Normalizes the bounded sample size for metadata/vector coverage drift previews.
 * @param {*} value
 * @returns {Number}
 */
export function normalizeVectorCoverageSampleSize(value) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 1) {
        return DEFAULT_VECTOR_COVERAGE_SAMPLE_SIZE
    }

    return Math.floor(parsed)
}

/**
 * @summary Parses sqlite3's JSON projection into a stable array.
 * @param {String} stdout
 * @returns {Object[]}
 */
export function parseSqliteJsonRows(stdout) {
    const trimmed = String(stdout || '').trim();

    if (!trimmed) {
        return []
    }

    return JSON.parse(trimmed)
}

/**
 * @summary Reads configured collection rows and their metadata/vector segment ids from a SQLite snapshot.
 * @param {Object} options
 * @param {String} options.snapshotPath
 * @param {String[]} [options.collectionNames=[]]
 * @param {Function} [options.execFn=execFileAsync]
 * @returns {Promise<Object[]>}
 */
export async function readCollectionSegmentRows({
    snapshotPath,
    collectionNames = [],
    execFn          = execFileAsync
} = {}) {
    const sql = `
        select
            c.name        as collectionName,
            c.id          as collectionId,
            c.database_id as databaseId,
            c.dimension   as dimension,
            ms.id         as metadataSegmentId,
            vs.id         as vectorSegmentId
        from collections c
        left join segments ms
            on ms.collection = c.id
            and ms.scope = '${METADATA_SEGMENT_SCOPE}'
        left join segments vs
            on vs.collection = c.id
            and vs.scope = '${VECTOR_SEGMENT_SCOPE}'
        order by c.name, c.id
    `;

    const {stdout} = await execFn('sqlite3', ['-json', snapshotPath, sql], {
        maxBuffer: 64 * 1024 * 1024
    });

    const names = new Set(collectionNames.filter(Boolean));

    return parseSqliteJsonRows(stdout)
        .filter(row => !names.size || names.has(row.collectionName))
}

/**
 * @summary Reads all metadata-row ids for one Chroma metadata segment from a SQLite snapshot.
 * @param {Object} options
 * @param {String} options.snapshotPath
 * @param {String} options.metadataSegmentId
 * @param {Function} [options.execFn=execFileAsync]
 * @returns {Promise<String[]>}
 */
export async function readMetadataEmbeddingIds({
    snapshotPath,
    metadataSegmentId,
    execFn = execFileAsync
} = {}) {
    if (!metadataSegmentId) {
        return []
    }

    const sql = `
        select embedding_id as id
        from embeddings
        where segment_id = '${String(metadataSegmentId).replaceAll("'", "''")}'
        order by embedding_id
    `;

    const {stdout} = await execFn('sqlite3', ['-json', snapshotPath, sql], {
        maxBuffer: 128 * 1024 * 1024
    });

    return parseSqliteJsonRows(stdout).map(row => row.id)
}

/**
 * @summary Reads Chroma's persisted HNSW id map from `index_metadata.pickle` for one vector segment.
 * @param {Object} options
 * @param {String} options.persistDir
 * @param {String} options.vectorSegmentId
 * @param {Function} [options.execFn=execFileAsync]
 * @param {Object} [options.fsModule=fs]
 * @returns {Promise<Object>}
 */
export async function readVectorIndexIds({
    persistDir,
    vectorSegmentId,
    execFn   = execFileAsync,
    fsModule = fs
} = {}) {
    const metadataPath = vectorSegmentId
        ? path.join(persistDir, vectorSegmentId, 'index_metadata.pickle')
        : null;

    if (!metadataPath || !await fsModule.pathExists(metadataPath)) {
        return {
            ok   : false,
            path : metadataPath,
            ids  : [],
            error: metadataPath
                ? `Vector index metadata file not found: ${metadataPath}`
                : 'Vector segment id missing'
        }
    }

    const script = [
        'import json, pickle, sys',
        'with open(sys.argv[1], "rb") as handle:',
        '    data = pickle.load(handle)',
        'ids = list((data.get("id_to_label") or {}).keys())',
        'print(json.dumps(ids))'
    ].join('\n');

    try {
        const {stdout} = await execFn('python3', ['-c', script, metadataPath], {
            maxBuffer: 128 * 1024 * 1024
        });

        return {
            ok  : true,
            path: metadataPath,
            ids : JSON.parse(stdout || '[]')
        }
    } catch (error) {
        return {
            ok   : false,
            path : metadataPath,
            ids  : [],
            error: error.message
        }
    }
}

/**
 * @summary Enumerates exact id overlap and drift between SQLite metadata rows and HNSW vector ids.
 * @param {Object} options
 * @param {String[]} [options.metadataIds=[]]
 * @param {String[]} [options.vectorIds=[]]
 * @returns {{allIds: String[], vectorIds: String[], missingVectorIds: String[], extraVectorIds: String[], overlapCount: Number}}
 */
export function enumerateMetadataVectorDrift({
    metadataIds = [],
    vectorIds   = []
} = {}) {
    const metadataSet = new Set(metadataIds),
          vectorSet   = new Set(vectorIds),
          allIds      = [...metadataSet],
          missing     = [],
          extra       = [];

    let overlapCount = 0;

    for (const id of allIds) {
        if (vectorSet.has(id)) {
            overlapCount++;
        } else {
            missing.push(id);
        }
    }

    for (const id of vectorSet) {
        if (!metadataSet.has(id)) {
            extra.push(id);
        }
    }

    return {
        allIds,
        vectorIds       : [...vectorSet],
        missingVectorIds: missing,
        extraVectorIds  : extra,
        overlapCount
    }
}

/**
 * @summary Computes exact overlap counts and bounded drift samples between SQLite metadata ids and HNSW vector ids.
 * @param {Object} options
 * @param {String[]} [options.metadataIds=[]]
 * @param {String[]} [options.vectorIds=[]]
 * @param {Number} [options.sampleSize=DEFAULT_VECTOR_COVERAGE_SAMPLE_SIZE]
 * @param {Boolean} [options.includeFullIds=false] Include full id lists for repair tooling.
 * @returns {Object}
 */
export function compareMetadataToVectorIds({
    metadataIds     = [],
    vectorIds       = [],
    sampleSize      = DEFAULT_VECTOR_COVERAGE_SAMPLE_SIZE,
    includeFullIds  = false
} = {}) {
    const drift = enumerateMetadataVectorDrift({metadataIds, vectorIds});

    return {
        metadataRowCount       : drift.allIds.length,
        vectorIndexIdCount     : drift.vectorIds.length,
        overlapCount           : drift.overlapCount,
        missingFromVectorCount : drift.missingVectorIds.length,
        extraInVectorCount     : drift.extraVectorIds.length,
        missingFromVectorSample: drift.missingVectorIds.slice(0, sampleSize),
        extraInVectorSample    : drift.extraVectorIds.slice(0, sampleSize),
        ...(includeFullIds ? {
            allIds          : drift.allIds,
            vectorIds       : drift.vectorIds,
            missingVectorIds: drift.missingVectorIds,
            extraVectorIds  : drift.extraVectorIds
        } : {})
    }
}

/**
 * @summary Audits collection-level metadata row coverage against persisted HNSW vector index ids.
 * @param {Object} options
 * @param {String} options.snapshotPath
 * @param {String} options.persistDir
 * @param {String[]} [options.collectionNames=[]]
 * @param {Number} [options.sampleSize=DEFAULT_VECTOR_COVERAGE_SAMPLE_SIZE]
 * @param {Boolean} [options.includeFullIds=false]
 * @param {Function} [options.execFn=execFileAsync]
 * @param {Object} [options.fsModule=fs]
 * @returns {Promise<Object>}
 */
export async function auditChromaVectorCoverage({
    snapshotPath,
    persistDir,
    collectionNames = [],
    sampleSize      = DEFAULT_VECTOR_COVERAGE_SAMPLE_SIZE,
    includeFullIds  = false,
    execFn          = execFileAsync,
    fsModule        = fs
} = {}) {
    const rows = await readCollectionSegmentRows({
              snapshotPath,
              collectionNames,
              execFn
          }),
          names = rows.reduce((map, row) => {
              const list = map.get(row.collectionName) || [];
              list.push(row.collectionId);
              map.set(row.collectionName, list);
              return map
          }, new Map()),
          duplicateCollectionNames = [...names.entries()]
              .filter(([, ids]) => ids.length > 1)
              .map(([name, collectionIds]) => ({name, collectionIds}));

    const duplicateNames = new Set(duplicateCollectionNames.map(entry => entry.name)),
          collections    = [];

    for (const row of rows) {
        const metadataIds = await readMetadataEmbeddingIds({
                  snapshotPath,
                  metadataSegmentId: row.metadataSegmentId,
                  execFn
              }),
              vectorResult = await readVectorIndexIds({
                  persistDir,
                  vectorSegmentId: row.vectorSegmentId,
                  execFn,
                  fsModule
              }),
              comparison = compareMetadataToVectorIds({
                  metadataIds,
                  vectorIds : vectorResult.ids,
                  sampleSize: normalizeVectorCoverageSampleSize(sampleSize),
                  includeFullIds
              }),
              ok = vectorResult.ok &&
                  comparison.missingFromVectorCount === 0 &&
                  comparison.extraInVectorCount === 0;

        collections.push({
            name                   : row.collectionName,
            collectionId           : row.collectionId,
            databaseId             : row.databaseId,
            dimension              : row.dimension,
            metadataSegmentId      : row.metadataSegmentId,
            vectorSegmentId        : row.vectorSegmentId,
            vectorMetadataPath     : vectorResult.path,
            duplicateCollectionName: duplicateNames.has(row.collectionName),
            ok,
            error                  : vectorResult.ok ? null : vectorResult.error,
            ...comparison
        });
    }

    return {
        collections,
        failedCollections     : countFailedCoverageRows(collections),
        duplicateCollectionNames
    }
}

/**
 * @param {Object} options
 * @param {Object} options.collection
 * @param {Number} [options.sampleSize=DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE]
 * @returns {Promise<Object>}
 */
export async function probeStoredEmbeddingExportability({
    collection,
    sampleSize = DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE
} = {}) {
    const label          = 'stored embedding exportability',
          normalizedSize = normalizeExportabilitySampleSize(sampleSize);

    let ids = [];
    try {
        const response = await collection.get({
            limit  : normalizedSize,
            include: []
        });

        ids = response.ids || [];
    } catch (error) {
        return {
            label,
            ok   : false,
            error: error.message
        }
    }

    const failures  = [];
    let   succeeded = 0;

    for (const id of ids) {
        try {
            const response = await collection.get({
                ids    : [id],
                include: ['embeddings']
            });

            const embedding = response.embeddings?.[0];
            if (!response.ids?.length || !embedding?.length) {
                throw new Error('Stored embedding missing from single-id export')
            }

            succeeded++;
        } catch (error) {
            failures.push({
                id,
                error: error.message
            });
        }
    }

    return {
        label,
        ok   : failures.length === 0,
        value: {
            sampled: ids.length,
            succeeded,
            failed : failures.length,
            failures
        }
    }
}

/**
 * @summary Audits a Chroma collection's stored-vector dimensions — the data-integrity dimension fact-gatherer
 * the diagnostics runner imports to feed `buildDimensionConsistencyDiagnosis`. Samples up to `sampleSize`
 * stored vectors and counts those whose dimension differs from the configured `expectedDimension`. A *missing*
 * embedding is NOT a dimension mismatch — that is index-coverage's domain (`auditChromaVectorCoverage`); only a
 * present vector of the wrong length counts. Returns the producer's per-collection `samples` element shape, 1:1.
 * A probe failure surfaces as an `error` field with a zero count — it never throws into the runner.
 *
 * @param {Object} options
 * @param {Object} options.collection Chroma collection handle (`.get({ids, limit, include})`).
 * @param {String} options.collectionName The collection's name (carried into the sample for the diagnosis).
 * @param {Number} options.expectedDimension The configured embedding dimension every stored vector must match.
 * @param {Number} [options.sampleSize=100] Maximum stored vectors to sample.
 * @returns {Promise<Object>} `{collection, expectedDimension, mismatchedVectorCount, sampledCount}` (+ `error` on probe failure).
 */
export async function auditCollectionVectorDimensions({collection, collectionName, expectedDimension, sampleSize = 100} = {}) {
    try {
        const {ids = []} = await collection.get({limit: sampleSize, include: []});

        if (ids.length === 0) {
            return {collection: collectionName, expectedDimension, mismatchedVectorCount: 0, sampledCount: 0};
        }

        const {embeddings = []} = await collection.get({ids, include: ['embeddings']}),
              // A present vector whose length ≠ expectedDimension is corruption; a missing (null) embedding is
              // index-coverage's domain (auditChromaVectorCoverage), not a dimension mismatch.
              mismatchedVectorCount = embeddings.filter(embedding => Array.isArray(embedding) && embedding.length !== expectedDimension).length;

        return {collection: collectionName, expectedDimension, mismatchedVectorCount, sampledCount: ids.length};
    } catch (error) {
        return {collection: collectionName, expectedDimension, mismatchedVectorCount: 0, sampledCount: 0, error: error.message};
    }
}

/**
 * @summary Audits document-presence for a set of Chroma row ids — the data-integrity gatherer that lets the
 * recovery classifier separate a re-embeddable WAL-stall (documents present, vectors missing) from an
 * unrecoverable wipe (documents also gone). Given the gutted ids (metadata present, vector absent — the
 * `missingFromVector` set surfaced by `auditChromaVectorCoverage`), samples up to `sampleSize` and counts
 * those whose stored document is a non-empty string: a present document is what a lossless re-embed re-drives
 * from, an absent one means the row is unrecoverable from documents alone. A read-only `.get` does not invoke
 * the embedder, so this is NOT gated by the embed canary. Returns the producer's per-collection sample element
 * shape, 1:1. A probe failure surfaces as an `error` field with a zero count — it never throws into the runner.
 *
 * @param {Object} options
 * @param {Object} options.collection Chroma collection handle (`.get({ids, include})`).
 * @param {String} options.collectionName The collection's name (carried into the sample for the diagnosis).
 * @param {String[]} [options.ids=[]] The row ids to probe — the missing-from-vector / gutted ids.
 * @param {Number} [options.sampleSize=100] Maximum ids to sample.
 * @returns {Promise<Object>} `{collection, documentsPresentCount, sampledCount}` (+ `error` on probe failure).
 */
export async function auditCollectionDocumentPresence({collection, collectionName, ids = [], sampleSize = 100} = {}) {
    const sampledIds = ids.slice(0, sampleSize);

    // No gutted ids to probe → nothing to recover from, never a probe (and never a false zero-with-error).
    if (sampledIds.length === 0) {
        return {collection: collectionName, documentsPresentCount: 0, sampledCount: 0};
    }

    try {
        const {documents = []} = await collection.get({ids: sampledIds, include: ['documents']}),
              // A present document is a non-empty string — the source a lossless re-embed re-drives from
              // (WAL-stall); a null/empty document means the row is unrecoverable from documents alone (wipe).
              documentsPresentCount = documents.filter(document => typeof document === 'string' && document.length > 0).length;

        return {collection: collectionName, documentsPresentCount, sampledCount: sampledIds.length};
    } catch (error) {
        return {collection: collectionName, documentsPresentCount: 0, sampledCount: 0, error: error.message};
    }
}

/**
 * @param {Object} options
 * @param {Object} options.collection
 * @param {String} options.name
 * @param {Number} [options.exportabilitySampleSize=DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE]
 * @returns {Promise<Object>}
 */
export async function probeCollection({
    collection,
    name,
    exportabilitySampleSize = DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE
}) {
    const result = {
        name,
        steps: []
    };

    result.steps.push(await runStep('count', async () => collection.count()));

    const idsStep = await runStep('get ids limit 1', async () => {
        const response = await collection.get({limit: 1, include: []});
        return response.ids
    });

    result.steps.push(idsStep);

    const exportabilityStep = await probeStoredEmbeddingExportability({
        collection,
        sampleSize: exportabilitySampleSize
    });

    const id = idsStep.ok ? idsStep.value?.[0] : null;
    if (!id) {
        result.steps.push(exportabilityStep);
        return result
    }

    result.steps.push(await runStep('get metadata/document by id', async () => {
        const response = await collection.get({
            ids    : [id],
            include: ['metadatas', 'documents']
        });

        return {
            ids   : response.ids.length,
            hasDoc: typeof response.documents?.[0] === 'string'
        }
    }));

    let embedding;
    const embeddingStep = await runStep('get embedding by id', async () => {
        const response = await collection.get({
            ids    : [id],
            include: ['embeddings']
        });

        embedding = response.embeddings?.[0];

        return {
            ids: response.ids.length,
            dim: embedding?.length || null
        }
    });

    result.steps.push(embeddingStep);

    result.steps.push(exportabilityStep);

    if (embedding?.length) {
        result.steps.push(await runStep('query by existing embedding', async () => {
            const response = await collection.query({
                queryEmbeddings: [embedding],
                nResults       : 1,
                include        : ['distances']
            });

            return {
                ids     : response.ids?.[0]?.length || 0,
                distance: response.distances?.[0]?.[0] ?? null
            }
        }));
    }

    return result
}

/**
 * @param {Object} options
 * @param {Object} [options.memoryCoreConfig=mcConfig]
 * @param {Object} [options.knowledgeBaseConfig=kbConfig]
 * @param {Function} [options.Client=ChromaClient]
 * @param {Number} [options.exportabilitySampleSize=DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE]
 * @returns {Promise<Object[]>}
 */
export async function probeChromaApi({
    memoryCoreConfig    = mcConfig,
    knowledgeBaseConfig = kbConfig,
    Client                  = ChromaClient,
    exportabilitySampleSize = DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE
} = {}) {
    const chroma = memoryCoreConfig.engines.chroma,
          client = new Client({
              host    : chroma.host,
              port    : Number(chroma.port),
              ssl     : false,
              database: chroma.database
          }),
          embeddingFunction = createDynamicTextEmbeddingFunction({
              providerResolver: () => memoryCoreConfig.embeddingProvider
          }),
          names = resolveCollectionNames({knowledgeBaseConfig, memoryCoreConfig});

    await client.heartbeat();

    const results = [];
    for (const name of names) {
        const result = {
            name,
            steps: []
        };

        const getCollection = await runStep('getCollection', async () => {
            return await client.getCollection({name, embeddingFunction})
        });

        if (!getCollection.ok) {
            result.steps.push(getCollection);
            results.push(result);
            continue
        }

        result.steps.push({
            label: 'getCollection',
            ok   : true,
            value: name
        });
        const collectionResult = await probeCollection({
            collection: getCollection.value,
            name,
            exportabilitySampleSize
        });

        result.steps.push(...collectionResult.steps);
        results.push(result);
    }

    return results
}

/**
 * @param {Object} value
 * @returns {String}
 */
function formatStepValue(value) {
    if (!value || typeof value !== 'object' || !('sampled' in value)) {
        return ''
    }

    const failurePreview = (value.failures || []).slice(0, 3).map(failure => {
        return `${failure.id}: ${failure.error}`
    }).join('; ');

    const failures = failurePreview ? `; failures=${failurePreview}` : '';

    return ` (sampled=${value.sampled}, succeeded=${value.succeeded}, failed=${value.failed}${failures})`
}

/**
 * @param {Object} result
 * @returns {void}
 */
function printHuman(result) {
    console.log(`SQLite source: ${result.sqlite.sourcePath}`);
    console.log(`SQLite snapshot: ${result.sqlite.snapshotPath}`);
    for (const check of result.sqlite.checks) {
        const status = check.ok ? 'ok' : 'failed';
        console.log(`- ${check.pragma}: ${status}${check.output ? ` (${check.output})` : ''}${check.error ? ` (${check.error})` : ''}`);
    }

    if (result.coverage) {
        if (result.coverage.error) {
            console.log(`Chroma vector coverage: failed (${result.coverage.error})`);
        } else {
            console.log('Chroma vector coverage:');
            for (const collection of result.coverage.collections) {
                const status    = collection.ok ? 'ok' : 'failed',
                      duplicate = collection.duplicateCollectionName ? ' duplicate-name' : '';

                console.log(`- ${collection.name} [${collection.collectionId}]: ${status}${duplicate} metadata=${collection.metadataRowCount} vector=${collection.vectorIndexIdCount} overlap=${collection.overlapCount} missing=${collection.missingFromVectorCount} extra=${collection.extraInVectorCount}`);
                if (collection.error) {
                    console.log(`  - vector metadata: ${collection.error}`);
                }
                if (collection.missingFromVectorSample.length) {
                    console.log(`  - missing sample: ${collection.missingFromVectorSample.join(', ')}`);
                }
                if (collection.extraInVectorSample.length) {
                    console.log(`  - extra sample: ${collection.extraInVectorSample.join(', ')}`);
                }
            }
        }
    }

    if (!result.api) {
        return
    }

    console.log('Chroma API read probes:');
    for (const collection of result.api.collections) {
        console.log(`- ${collection.name}`);
        for (const step of collection.steps) {
            const details = step.error ? ` (${step.error})` : formatStepValue(step.value);
            console.log(`  - ${step.label}: ${step.ok ? 'ok' : 'failed'}${details}`);
        }
    }
}

/**
 * @param {String[]} argv
 * @returns {Promise<Object>}
 */
export async function run(argv = process.argv) {
    program
        .name('checkChromaIntegrity')
        .description('Copy-first Chroma SQLite integrity check plus read-only API probes.')
        .option('--sqlite <path>', 'Path to chroma.sqlite3. Defaults to configured unified store.')
        .option('--skip-api', 'Skip live read-only Chroma API probes.', false)
        .option(
            '--exportability-sample-size <count>',
            'Number of ids to sample for stored-embedding exportability probes.',
            String(DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE)
        )
        .option('--skip-vector-coverage', 'Skip local metadata-vs-vector-index coverage audit.', false)
        .option(
            '--vector-coverage-sample-size <count>',
            'Number of missing/extra ids to preview for vector coverage drift.',
            String(DEFAULT_VECTOR_COVERAGE_SAMPLE_SIZE)
        )
        .option(
            '--include-vector-coverage-ids',
            'Include full metadata/vector/missing/extra id lists in vector coverage output for repair planning.',
            false
        )
        .option('--keep-snapshot', 'Keep the copied SQLite snapshot instead of removing the temp dir.', false)
        .option('--json', 'Print machine-readable JSON.', false)
        .parse(argv);

    const options    = program.opts(),
          sourcePath = resolveSqlitePath({sqlitePath: options.sqlite}),
          snapshot   = await copySqliteSnapshot({sourcePath});

    const result = {
        sqlite: {
            sourcePath,
            snapshotPath: snapshot.snapshotPath,
            checks      : []
        },
        coverage: null,
        api     : null
    };

    for (const pragma of ['quick_check', 'integrity_check']) {
        result.sqlite.checks.push({
            pragma,
            ...await runSqlitePragma({snapshotPath: snapshot.snapshotPath, pragma})
        });
    }

    if (!options.skipVectorCoverage) {
        try {
            result.coverage = await auditChromaVectorCoverage({
                snapshotPath   : snapshot.snapshotPath,
                persistDir     : path.dirname(sourcePath),
                collectionNames: resolveCollectionNames(),
                sampleSize     : normalizeVectorCoverageSampleSize(options.vectorCoverageSampleSize),
                includeFullIds : Boolean(options.includeVectorCoverageIds)
            });
        } catch (error) {
            result.coverage = {
                error: error.message
            };
        }
    }

    if (!options.skipApi) {
        try {
            const collections = await probeChromaApi({
                exportabilitySampleSize: normalizeExportabilitySampleSize(options.exportabilitySampleSize)
            });
            result.api = {
                collections,
                failedSteps: countFailedApiSteps(collections)
            };
        } catch (error) {
            result.api = {
                error: error.message
            };
        }
    }

    if (!options.keepSnapshot) {
        await fs.remove(snapshot.tmpDir);
    }

    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        printHuman(result);
    }

    const sqliteFailed   = result.sqlite.checks.some(check => !check.ok),
          coverageFailed = Boolean(result.coverage?.error || result.coverage?.failedCollections),
          apiFailed      = Boolean(result.api?.error || result.api?.failedSteps);

    return {
        result,
        exitCode: sqliteFailed || coverageFailed || apiFailed ? 1 : 0
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    run().then(({exitCode}) => {
        process.exit(exitCode);
    }).catch(error => {
        console.error(error.stack || error.message);
        process.exit(1);
    });
}
