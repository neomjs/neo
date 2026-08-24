import {readFile}                         from 'fs/promises';
import {writeFileAtomic}                  from '../shared/atomicFileWrite.mjs';
import {normalizeCorpusProjectionReceipt} from './corpusProjectionContract.mjs';

/**
 * @module ai/services/graph/corpusProjectionReceiptStore
 * @summary Atomic durable store for the one source-bound corpus-projection receipt consumers gate on.
 *
 * Missing means the projection owner has never established a source identity and therefore returns
 * `null`; consumers feed that into the fail-closed admission contract. Malformed or unreadable is a
 * distinct degradation and throws — treating corrupt authority as “nothing yet” would erase the
 * exact evidence that must stop mixed SQLite/Chroma reads.
 */

function createReceiptStoreError(code, message, cause) {
    const error = new Error(message, cause ? {cause} : undefined);
    error.code = code;
    return error
}

function assertFilePath(filePath) {
    if (typeof filePath !== 'string' || !filePath.trim()) {
        throw createReceiptStoreError(
            'CORPUS_PROJECTION_RECEIPT_PATH_INVALID',
            'Corpus projection receipt path must be a non-empty string'
        )
    }

    return filePath
}

/**
 * @summary Reads and validates the current projection receipt.
 * @param {String} filePath Absolute or cwd-relative receipt path.
 * @returns {Promise<Object|null>} Valid normalized receipt, or null when it has never been written.
 */
export async function readCorpusProjectionReceipt(filePath) {
    assertFilePath(filePath);

    let text;
    try {
        text = await readFile(filePath, 'utf8')
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw createReceiptStoreError(
            'CORPUS_PROJECTION_RECEIPT_UNREADABLE',
            `Corpus projection receipt is unreadable: ${error.message}`,
            error
        )
    }

    let parsed;
    try {
        parsed = JSON.parse(text)
    } catch (error) {
        throw createReceiptStoreError(
            'CORPUS_PROJECTION_RECEIPT_MALFORMED',
            `Corpus projection receipt is not valid JSON: ${error.message}`,
            error
        )
    }

    const normalized = normalizeCorpusProjectionReceipt(parsed);

    if (!normalized.valid) {
        throw createReceiptStoreError(
            'CORPUS_PROJECTION_RECEIPT_INVALID',
            `Corpus projection receipt violates ${normalized.code}`
        )
    }

    return normalized.receipt
}

/**
 * @summary Atomically and durably replaces the current projection receipt.
 * @param {String} filePath Absolute or cwd-relative receipt path.
 * @param {Object} receipt Valid source-bound receipt.
 * @returns {Promise<Object>} Normalized receipt that was written.
 */
export async function writeCorpusProjectionReceipt(filePath, receipt) {
    assertFilePath(filePath);

    const normalized = normalizeCorpusProjectionReceipt(receipt);

    if (!normalized.valid) {
        throw createReceiptStoreError(
            'CORPUS_PROJECTION_RECEIPT_INVALID',
            `Refusing to write corpus projection receipt that violates ${normalized.code}`
        )
    }

    await writeFileAtomic(filePath, `${JSON.stringify(normalized.receipt, null, 2)}\n`, {fsync: true});

    return normalized.receipt
}
