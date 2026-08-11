#!/usr/bin/env node
/**
 * Pre-Flight (structural fast-path): `ai/scripts/diagnostics/structureMap.mjs`
 * matches sibling pattern of `ai/scripts/diagnostics/check-substrate-size.mjs`
 * and `ai/scripts/diagnostics/diagnoseMcpConcurrency.mjs`; all are read-only
 * Agent OS diagnostics / architecture-observability scripts. Sibling-file-lift
 * applies; no novel directory choice.
 *
 * @summary Deterministic structure-map generator for Agent OS folders.
 *
 * The generator is intentionally read-only and timestamp-free so its JSON output can be
 * committed or diffed by follow-on architecture linting. It defaults to `ai/`, but accepts a
 * configurable root for tests, migrations, or future architecture programs.
 * @plane in-plane
 */
import {Command}       from 'commander';
import fs              from 'node:fs';
import path            from 'node:path';
import process         from 'node:process';
import {fileURLToPath} from 'node:url';

import {readDeclaredPlane, stripComments} from '../lint/scriptSource.mjs';

const DEFAULT_ROOT = 'ai';

/**
 * Converts platform-specific path separators to POSIX separators for stable JSON output.
 * @param {string} value
 * @returns {string}
 */
function toPosixPath(value) {
    return value.split(path.sep).join('/');
}

/**
 * Returns a repo-relative path when possible, otherwise a normalized absolute path.
 * @param {string} absolutePath
 * @param {string} cwd
 * @returns {string}
 */
function formatOutputPath(absolutePath, cwd) {
    const relativePath = path.relative(cwd, absolutePath);

    if (!relativePath) {
        return '.';
    }

    return relativePath.startsWith('..') ? toPosixPath(absolutePath) : toPosixPath(relativePath);
}

/**
 * Creates the Commander program used by the CLI and unit tests.
 * @returns {Command}
 */
export function createProgram() {
    return new Command()
        .name('ai-structure-map')
        .description('Emit deterministic JSON describing an Agent OS folder structure.')
        .option('-r, --root <path>', 'Root directory to inspect.', DEFAULT_ROOT)
        .option('--files', 'Include sorted file names per folder.')
        .option('--loc', 'Include code LOC per file, excluding blank lines and common comment forms.')
        .option('--plane', 'Include each script\'s declared execution plane, plus a per-folder tally.');
}

/**
 * Parses CLI arguments using Commander failure semantics.
 * @param {string[]} [argv]
 * @returns {{root: string, files: boolean, loc: boolean}}
 */
export function parseArgs(argv=process.argv.slice(2)) {
    const program = createProgram();

    program.exitOverride();
    program.configureOutput({writeOut: () => {}, writeErr: () => {}});
    program.parse(argv, {from: 'user'});

    return program.opts();
}

/**
 * Counts non-empty, non-comment source lines.
 *
 * The comment model itself lives in `ai/scripts/lint/scriptSource.mjs`, shared with the plane
 * classifier so this map and `lint-script-plane` cannot drift on what counts as a comment.
 * @param {string} content
 * @param {string} [filePath]
 * @returns {number}
 */
export function countCodeLoc(content, filePath='') {
    return stripComments(content, filePath)
        .split('\n')
        .filter(line => line.trim())
        .length;
}

/**
 * Creates file descriptors for one directory.
 * @param {string} folderPath
 * @param {Array<Object>} files
 * @param {{includeFiles: boolean, includeLoc: boolean}} options
 * @returns {(Array<string>|Array<Object>|undefined)}
 */
function buildFileList(folderPath, files, {includeFiles, includeLoc, includePlane, cwd}) {
    if (!includeFiles && !includeLoc && !includePlane) {
        return undefined;
    }

    return files.map(file => {
        if (!includeLoc && !includePlane) {
            return file.name;
        }

        const filePath   = path.join(folderPath, file.name),
              content    = fs.readFileSync(filePath, 'utf8'),
              descriptor = {name: file.name};

        if (includeLoc) {
            descriptor.codeLoc = countCodeLoc(content, filePath);
        }

        if (includePlane && file.name.endsWith('.mjs')) {
            // The DECLARED plane is what the map publishes — the reader wants the author's answer to
            // "can I run this?", not the detector's partial view. `lint-script-plane` is what keeps
            // the two honest, so the map never has to hedge.
            descriptor.plane = readDeclaredPlane(content, filePath).plane;
        }

        return descriptor;
    });
}

/**
 * Tallies declared planes across one folder's scripts.
 *
 * This is the line that answers the ticket's actual complaint. A folder reporting both a `host` and
 * an `in-plane` count is a MIXED folder — the verb-named taxonomy said nothing about that, and
 * finding it previously meant opening every file in the directory.
 * @param {(Array<string>|Array<Object>|undefined)} fileList
 * @returns {(Object|undefined)}
 */
function tallyPlanes(fileList) {
    if (!Array.isArray(fileList)) {
        return undefined;
    }

    const tally = {};

    fileList.forEach(entry => {
        const plane = entry?.plane;

        if (plane) {
            tally[plane] = (tally[plane] || 0) + 1;
        }
    });

    return Object.keys(tally).length > 0 ? tally : undefined;
}

/**
 * Builds a deterministic structure map for a filesystem root.
 * @param {Object} options
 * @param {string} [options.root]
 * @param {string} [options.cwd]
 * @param {boolean} [options.includeFiles]
 * @param {boolean} [options.includeLoc]
 * @returns {Object}
 */
export function buildStructureMap({
    root         = DEFAULT_ROOT,
    cwd          = process.cwd(),
    includeFiles = false,
    includeLoc   = false,
    includePlane = false
} = {}) {
    const rootPath = path.resolve(cwd, root),
          stat     = fs.statSync(rootPath);

    if (!stat.isDirectory()) {
        throw new Error(`Structure-map root is not a directory: ${root}`);
    }

    const folders = [];

    function visit(folderPath) {
        const entries = fs.readdirSync(folderPath, {withFileTypes: true})
                .sort((a, b) => a.name.localeCompare(b.name)),
              files   = entries.filter(entry => entry.isFile()),
              dirs    = entries.filter(entry => entry.isDirectory());

        const folder = {
            path     : formatOutputPath(folderPath, cwd),
            fileCount: files.length
        };

        const fileList = buildFileList(folderPath, files, {includeFiles, includeLoc, includePlane, cwd});

        if (fileList) {
            folder.files = fileList;
        }

        const planes = includePlane ? tallyPlanes(fileList) : undefined;

        if (planes) {
            folder.planes = planes;
        }

        folders.push(folder);

        dirs.forEach(dir => visit(path.join(folderPath, dir.name)));
    }

    visit(rootPath);

    folders.sort((a, b) => a.path.localeCompare(b.path));

    return {
        root   : formatOutputPath(rootPath, cwd),
        folders: folders
    };
}

/**
 * Runs the CLI and writes deterministic JSON to stdout.
 * @param {string[]} [argv]
 * @param {Object} [io]
 * @param {string} [io.cwd]
 * @param {{write: Function}} [io.stdout]
 * @returns {Promise<{root:string, folders:Array}>}
 */
function writeStructureMap(options, {
    cwd    = process.cwd(),
    stdout = process.stdout
} = {}) {
    const map = buildStructureMap({
        root        : options.root,
        cwd,
        includeFiles: options.files,
        includeLoc  : options.loc,
        includePlane: options.plane
    });

    stdout.write(`${JSON.stringify(map, null, 2)}\n`);

    return map;
}

/**
 * Programmatic entry point used by unit tests.
 * @param {string[]} [argv]
 * @param {Object} [io]
 * @param {string} [io.cwd]
 * @param {{write: Function}} [io.stdout]
 * @returns {Promise<{root:string, folders:Array}>}
 */
export async function main(argv=process.argv.slice(2), io={}) {
    return writeStructureMap(parseArgs(argv), io);
}

const isDirectCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectCli) {
    Promise.resolve().then(() => {
        const program = createProgram();

        program.parse(process.argv);

        return writeStructureMap(program.opts());
    }).catch(error => {
        console.error(error.message);
        process.exit(1);
    });
}
