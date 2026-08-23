import {run as defaultRunJSDoc} from './runner.mjs';
import {transform}              from './transformer.mjs';
import fg                       from 'fast-glob';
import path                     from 'path';
import fs                       from 'fs/promises';

/**
 * Fast glob with optimized settings for documentation files
 * @param {string|string[]} globs - Glob patterns
 * @returns {Promise<string[]>} - Array of matching file paths
 */
async function resolveDocletFiles(globs, {glob = fg} = {}) {
    const patterns = Array.isArray(globs) ? globs : [globs];

    const files = await glob(patterns, {
        absolute : false,
        onlyFiles: true,
        unique   : true,
        dot      : false,
        ignore   : [
            '**/node_modules/**',
            '**/dist/**',
            '**/docs/output/**'
        ],
        caseSensitiveMatch: false,
        // Only match .mjs files (all relevant neo.mjs files use this extension)
        extglob: true
    });

    // `fast-glob` walks directories concurrently, so the same file set can arrive in a different
    // order on consecutive runs. JSDoc resolves cross-file symbols in input order; without this
    // boundary, identical sources produced different memberof/augments/longname content in all.json
    // and assigned different structure ids. The source set needs one canonical order BEFORE it is
    // split into worker batches.
    return files.sort()
}

/**
 * Writes an object to a JSON file.
 * @param {string|{path: string, indent: number|boolean, force: boolean}} options - Path or options object.
 * @param {any} object - The object to write.
 * @returns {Promise<any>} - The original object.
 */
export async function writeJSON(options, object) {
    const opts = typeof options === 'string' ? {path: options} : options;
    const {indent = false, force = false} = opts;

    const indentSize = indent === true ? 2 : (typeof indent === 'number' ? indent : 0);
    const json       = JSON.stringify(object, null, indentSize);

    if (force) {
        await fs.mkdir(path.dirname(opts.path), {recursive: true});
    }

    await fs.writeFile(opts.path, json, 'utf8');
    return object;
}

/**
 * Parses JSDoc documentation from files or source code.
 * @param {object|string|string[]} options - Options or file paths.
 * @param {Object} [dependencies]
 * @param {Function} [dependencies.glob] Injectable file discovery for deterministic-order tests.
 * @param {Function} [dependencies.runJSDoc] Injectable parser runner for source-order observation.
 * @returns {Promise<any>}
 */
export async function parse(options, dependencies) {
    const {glob = fg, runJSDoc = defaultRunJSDoc} = dependencies || {};
    const opts = typeof options !== 'object' || options === null ? {files: options} : {...options};
    opts.files = opts.files || opts.file;

    const hasFiles  = typeof opts.files === 'string' || (Array.isArray(opts.files) && opts.files.length > 0);
    const hasSource = typeof opts.source === 'string';

    if (!hasFiles && !hasSource) {
        throw new Error('Cannot process missing or invalid input files, or source code.');
    }

    if (hasFiles) {
        opts.files = await resolveDocletFiles(opts.files, {glob});

        if (opts.files.length === 0) {
            throw new Error('No files matched the provided glob patterns.');
        }

        console.log(`Found ${opts.files.length} files to process`);
    }

    // The original had a temp file for source, that can be added here if needed.

    const rawDocs = await runJSDoc(opts);

    if (!rawDocs) {
        throw new Error('JSDoc returned no output.');
    }

    const processedDocs = transform(rawDocs, opts, opts.predicate || opts.filter);

    if (options.output) {
        return writeJSON(options.output, processedDocs);
    }

    return processedDocs;
}
