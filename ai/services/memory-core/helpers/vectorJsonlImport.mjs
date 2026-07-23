import fs       from 'node:fs';
import readline from 'node:readline';

import {fingerprintRestoreSourceFile} from './restoreTargetSetAdmission.mjs';
import {validateJsonlSourceFile}      from './vectorJsonlSourceValidation.mjs';

/**
 * @module ai/services/memory-core/helpers/vectorJsonlImport
 * @summary Provider-free bounded JSONL loader and read-back validator for
 * run-owned Chroma staging collections.
 */

export const CHROMA_VECTOR_IMPORT_BATCH_SIZE = 250;

/**
 * @summary Imports explicit stored vectors into an empty collection in bounded
 * batches and validates every batch by ID/read-back.
 *
 * @param {Object} options
 * @param {Object} options.collection Run-owned empty Chroma collection.
 * @param {String} options.filePath Admitted JSONL.
 * @param {Number} options.expectedDimension Vector dimension.
 * @param {String} options.expectedFileFingerprint Admitted source SHA-256.
 * @param {Number} options.expectedRowCount Admitted row count.
 * @param {Number} [options.batchSize=250] Bounded request size.
 * @param {Function} [options.recordBatch=()=>{}] Measurement callback.
 * @returns {Promise<Object>} Count/fingerprint/batch receipt.
 */
export async function importVectorJsonlToEmptyCollection({
    collection,
    filePath,
    expectedDimension,
    expectedFileFingerprint,
    expectedRowCount,
    batchSize = CHROMA_VECTOR_IMPORT_BATCH_SIZE,
    recordBatch = () => {}
} = {}) {
    validateCollection(collection);
    validateBatchSize(batchSize);

    const initialCount = await collection.count();
    if (initialCount !== 0) {
        throw new Error(`restore vector staging collection must be empty, observed ${initialCount}`)
    }

    await assertAdmittedVectorSource({
        filePath,
        expectedDimension,
        expectedFileFingerprint,
        expectedRowCount
    });

    let rowCount     = 0,
        batchCount   = 0,
        maxBatchSize = 0;

    await forEachVectorBatch(filePath, batchSize, async rows => {
        await collection.add(toChromaPayload(rows));
        await validateVectorRowsInCollection({collection, rows});

        rowCount     += rows.length;
        batchCount++;
        maxBatchSize = Math.max(maxBatchSize, rows.length);
        recordBatch({
            batchNumber: batchCount,
            batchSize  : rows.length,
            rowCount
        })
    });

    const finalCount = await collection.count();
    if (rowCount !== expectedRowCount || finalCount !== expectedRowCount) {
        throw new Error(
            `restore vector staging count mismatch: source=${expectedRowCount}, streamed=${rowCount}, stored=${finalCount}`
        )
    }

    return {
        valid      : true,
        rowCount,
        fingerprint: expectedFileFingerprint,
        batchCount,
        maxBatchSize
    }
}

/**
 * @summary Validates a collection against one admitted JSONL without retaining
 * the full source or ID set.
 *
 * @param {Object} options See import function, excluding recordBatch.
 * @returns {Promise<Object>} Validation receipt.
 */
export async function validateVectorCollectionFromJsonl({
    collection,
    filePath,
    expectedDimension,
    expectedFileFingerprint,
    expectedRowCount,
    batchSize = CHROMA_VECTOR_IMPORT_BATCH_SIZE
} = {}) {
    validateCollection(collection);
    validateBatchSize(batchSize);

    await assertAdmittedVectorSource({
        filePath,
        expectedDimension,
        expectedFileFingerprint,
        expectedRowCount
    });

    let rowCount = 0;

    await forEachVectorBatch(filePath, batchSize, async rows => {
        await validateVectorRowsInCollection({collection, rows});
        rowCount += rows.length
    });

    const count = await collection.count();
    if (rowCount !== expectedRowCount || count !== expectedRowCount) {
        throw new Error(
            `restore vector validation count mismatch: source=${expectedRowCount}, streamed=${rowCount}, stored=${count}`
        )
    }

    return {
        valid      : true,
        rowCount,
        fingerprint: expectedFileFingerprint
    }
}

async function assertAdmittedVectorSource({
    filePath,
    expectedDimension,
    expectedFileFingerprint,
    expectedRowCount
}) {
    const [{rowCount}, fingerprint] = await Promise.all([
        validateJsonlSourceFile({filePath, expectedDimension, vectorRows: true}),
        fingerprintRestoreSourceFile(filePath)
    ]);

    if (fingerprint !== expectedFileFingerprint) {
        throw new Error('restore vector source changed after admission')
    }
    if (rowCount !== expectedRowCount) {
        throw new Error(`restore vector admitted row count drift: expected ${expectedRowCount}, observed ${rowCount}`)
    }
}

async function forEachVectorBatch(filePath, batchSize, callback) {
    const
        input = fs.createReadStream(filePath, {encoding: 'utf8'}),
        lines = readline.createInterface({input, crlfDelay: Infinity}),
        batch = [];

    try {
        for await (const line of lines) {
            if (!line.trim()) {
                continue
            }

            batch.push(JSON.parse(line));

            if (batch.length === batchSize) {
                await callback(batch.splice(0, batch.length))
            }
        }

        if (batch.length > 0) {
            await callback(batch.splice(0, batch.length))
        }
    } finally {
        lines.close();
        input.destroy()
    }
}

async function validateVectorRowsInCollection({collection, rows}) {
    const
        ids      = rows.map(row => row.id),
        response = await collection.get({
            ids,
            include: ['embeddings', 'metadatas', 'documents']
        }),
        observed = new Map();

    for (let index = 0; index < (response?.ids?.length ?? 0); index++) {
        observed.set(response.ids[index], {
            id       : response.ids[index],
            embedding: Array.from(response.embeddings?.[index] ?? []),
            metadata : response.metadatas?.[index] ?? null,
            document : response.documents?.[index] ?? null
        })
    }

    if (observed.size !== rows.length) {
        throw new Error(`restore vector read-back coverage mismatch: expected ${rows.length}, observed ${observed.size}`)
    }

    for (const row of rows) {
        if (canonicalJson(normalizeVectorRow(observed.get(row.id))) !==
            canonicalJson(normalizeVectorRow(row))) {
            throw new Error(`restore vector read-back mismatch for id '${row.id}'`)
        }
    }
}

function toChromaPayload(rows) {
    return {
        ids       : rows.map(row => row.id),
        embeddings: rows.map(row => row.embedding),
        metadatas : rows.map(row => row.metadata ?? null),
        documents : rows.map(row => row.document ?? null)
    }
}

function normalizeVectorRow(row) {
    return {
        id       : row?.id,
        embedding: Array.from(row?.embedding ?? []),
        metadata : row?.metadata ?? null,
        document : row?.document ?? null
    }
}

function validateCollection(collection) {
    for (const method of ['add', 'count', 'get']) {
        if (typeof collection?.[method] !== 'function') {
            throw new TypeError(`restore vector collection requires ${method}()`)
        }
    }
}

function validateBatchSize(value) {
    if (!Number.isInteger(value) || value <= 0 ||
        value > CHROMA_VECTOR_IMPORT_BATCH_SIZE) {
        throw new TypeError(
            `restore vector batchSize must be 1..${CHROMA_VECTOR_IMPORT_BATCH_SIZE}`
        )
    }
}

function canonicalJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`
    }
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
    }
    return JSON.stringify(value)
}
