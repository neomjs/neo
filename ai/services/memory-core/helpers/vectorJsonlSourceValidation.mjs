import fs       from 'node:fs';
import readline from 'node:readline';

import {classifyRowVector} from './vectorWriteInvariant.mjs';

/**
 * @summary Full-source JSONL validation for import/restore entry paths: proves an entire backup
 * file BEFORE any destructive operation (replace-mode truncate) is allowed to run.
 *
 * The per-batch write gate in {@link module:ai/services/memory-core/helpers/vectorWriteInvariant}
 * rejects bad rows at the upsert boundary, but a replace-mode import truncates first — so a file
 * whose corruption sits in its final row would wipe the collection and only then discover the
 * defect. This validator streams the whole file up front: every line must parse, and (for vector
 * collections) every row must carry a non-empty string `id` plus a valid expected-dimension
 * vector. Streaming keeps memory O(1) per line — no whole-file buffering — so the check composes
 * with bounded import batching.
 * @module ai/services/memory-core/helpers/vectorJsonlSourceValidation
 */

/**
 * @summary The reasons a source file fails validation, stable for fail-loud reporting.
 */
export const SOURCE_REJECTION_REASONS = Object.freeze({
    jsonParse       : 'json-parse',
    missingId       : 'missing-id',
    missingEmbedding: 'missing-embedding',
    emptyEmbedding  : 'empty-embedding',
    wrongDimension  : 'wrong-dimension',
    nonFiniteValues : 'non-finite-values'
});

/**
 * @summary Streams one JSONL source file and validates every row, throwing on the first defect.
 *
 * @param {Object} options
 * @param {String} options.filePath Absolute path of the `.jsonl` source file.
 * @param {Number} options.expectedDimension Required vector dimension for vector rows.
 * @param {Boolean} [options.vectorRows=true] `false` for non-vector files (e.g. graph backups):
 *     rows are then only required to parse.
 * @returns {Promise<{rowCount: Number}>} Total non-empty rows validated.
 * @throws {Error} `Source validation failed at <file> (line <n>): <reason>` — the reason is one of
 *     {@link SOURCE_REJECTION_REASONS}; vector-row failures also name the row id when present.
 */
export async function validateJsonlSourceFile({filePath, expectedDimension, vectorRows = true}) {
    const stream = fs.createReadStream(filePath, {encoding: 'utf8'});
    const rl     = readline.createInterface({input: stream, crlfDelay: Infinity});

    let lineNo   = 0,
        rowCount = 0;

    const fail = (reason, detail = '') => {
        throw new Error(`Source validation failed at ${filePath} (line ${lineNo}): ${reason}${detail ? ` (${detail})` : ''}`)
    };

    try {
        for await (const line of rl) {
            if (!line.trim()) continue;
            lineNo++;
            rowCount++;

            let row;
            try {
                row = JSON.parse(line);
            } catch (err) {
                fail(SOURCE_REJECTION_REASONS.jsonParse, err.message);
            }

            if (vectorRows) {
                if (typeof row?.id !== 'string' || row.id.length === 0) {
                    fail(SOURCE_REJECTION_REASONS.missingId);
                }

                const reason = classifyRowVector(row, expectedDimension);
                if (reason) {
                    fail(reason, `row id: ${row.id}`);
                }
            }
        }
    } finally {
        rl.close();
        stream.destroy();
    }

    return {rowCount}
}
