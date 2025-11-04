import {run as runJSDoc} from './runner.mjs';
import {transform}       from './transformer.mjs';
import {glob}            from 'glob';
import path              from 'path';
import fs                from 'fs/promises';

async function promiseGlobFiles(globs) {
    const fileArrays = await Promise.all(
        globs.map(pattern => glob(pattern))
    );
    return fileArrays.flat();
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
    const json = JSON.stringify(object, null, indentSize);

    if (force) {
        await fs.mkdir(path.dirname(opts.path), {recursive: true});
    }

    await fs.writeFile(opts.path, json, 'utf8');
    return object;
}

/**
 * Parses JSDoc documentation from files or source code.
 * @param {object|string|string[]} options - Options or file paths.
 * @returns {Promise<any>}
 */
export async function parse(options) {
    const opts = typeof options !== 'object' || options === null ? {files: options} : {...options};
    opts.files = opts.files || opts.file;

    const hasFiles = typeof opts.files === 'string' || (Array.isArray(opts.files) && opts.files.length > 0);
    const hasSource = typeof opts.source === 'string';

    if (!hasFiles && !hasSource) {
        throw new Error('Cannot process missing or invalid input files, or source code.');
    }

    if (hasFiles) {
        opts.files = await promiseGlobFiles(Array.isArray(opts.files) ? opts.files : [opts.files]);
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
