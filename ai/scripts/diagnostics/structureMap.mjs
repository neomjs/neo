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
 */
import {Command}       from 'commander';
import fs              from 'node:fs';
import path            from 'node:path';
import process         from 'node:process';
import {fileURLToPath} from 'node:url';

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
        // Opt-in, and the reason is measured rather than stylistic: the plane projection walks every
        // npm-declared entrypoint's import closure, which takes ~2.2s against this command's ~160ms.
        // Making a navigation tool 14x slower by default is how it stops being reached for.
        .option('--planes', 'Annotate ai/scripts folders with their derived execution-plane tally.');
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
 * Strips simple block and line comments from one source line for deterministic LOC accounting.
 * This is intentionally lexical, not language-semantic; it is good enough for cohesion budgets
 * without pretending to be a parser for every file type under `ai/`.
 * @param {string} line
 * @param {{jsBlock: boolean, htmlBlock: boolean}} state
 * @param {string} ext
 * @returns {string}
 */
function stripCommentText(line, state, ext) {
    let index  = 0,
        output = '';

    while (index < line.length) {
        if (state.jsBlock) {
            const end = line.indexOf('*/', index);

            if (end === -1) {
                return output;
            }

            state.jsBlock = false;
            index         = end + 2;
            continue;
        }

        if (state.htmlBlock) {
            const end = line.indexOf('-->', index);

            if (end === -1) {
                return output;
            }

            state.htmlBlock = false;
            index           = end + 3;
            continue;
        }

        const jsStart        = line.indexOf('/*', index),
              htmlStart      = line.indexOf('<!--', index),
              slash          = line.indexOf('//', index),
              hashIndex      = ['.yaml', '.yml', '.sh'].includes(ext) ? line.indexOf('#', index) : -1,
              hash           = hashIndex !== -1 && line.slice(hashIndex, hashIndex + 2) !== '#!' ? hashIndex : -1,
              commentIndexes = [jsStart, htmlStart, slash, hash]
                  .filter(value => value !== -1)
                  .sort((a, b) => a - b),
              nextComment    = commentIndexes[0];

        if (nextComment == null) {
            output += line.slice(index);
            break;
        }

        output += line.slice(index, nextComment);

        if (nextComment === jsStart) {
            state.jsBlock = true;
            index         = nextComment + 2;
            continue;
        }

        if (nextComment === htmlStart) {
            state.htmlBlock = true;
            index           = nextComment + 4;
            continue;
        }

        break;
    }

    return output;
}

/**
 * Counts non-empty, non-comment source lines.
 * @param {string} content
 * @param {string} [filePath]
 * @returns {number}
 */
export function countCodeLoc(content, filePath='') {
    const state = {jsBlock: false, htmlBlock: false},
          ext   = path.extname(filePath).toLowerCase();

    return content.split(/\r?\n/).reduce((count, line) => {
        const code = stripCommentText(line, state, ext).trim();

        return code ? count + 1 : count;
    }, 0);
}

/**
 * Creates file descriptors for one directory.
 * @param {string} folderPath
 * @param {Array<Object>} files
 * @param {{includeFiles: boolean, includeLoc: boolean}} options
 * @returns {(Array<string>|Array<Object>|undefined)}
 */
function buildFileList(folderPath, files, {includeFiles, includeLoc}) {
    if (!includeFiles && !includeLoc) {
        return undefined;
    }

    return files.map(file => {
        if (!includeLoc) {
            return file.name;
        }

        const filePath = path.join(folderPath, file.name),
              content  = fs.readFileSync(filePath, 'utf8');

        return {
            name   : file.name,
            codeLoc: countCodeLoc(content, filePath)
        };
    });
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
    includeFiles  = false,
    includeLoc    = false,
    includePlanes = false,
    planeProjection = null
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

        const fileList = buildFileList(folderPath, files, {includeFiles, includeLoc});

        if (fileList) {
            folder.files = fileList;
        }

        folders.push(folder);

        dirs.forEach(dir => visit(path.join(folderPath, dir.name)));
    }

    visit(rootPath);

    folders.sort((a, b) => a.path.localeCompare(b.path));

    if (includePlanes) {
        // The projection is INJECTED, never defaulted. `buildStructureMap` is synchronous and the
        // projection lives behind a dynamic import (so the fast path carries neither the parser
        // dependency nor the ~2.2s closure walk), so the async CLI resolves it and passes it down.
        //
        // A missing projection throws rather than rendering folders with no tally: an empty plane
        // annotation is indistinguishable from "this folder has no entrypoints", which is exactly the
        // silent-default shape this whole lane exists to remove.
        if (!planeProjection) {
            throw new Error('buildStructureMap: includePlanes requires an injected planeProjection');
        }

        const projection = planeProjection;

        folders.forEach(folder => {
            const entry = projection[folder.path];

            if (entry) {
                folder.planes = entry.planes;
                // `mixed` is the load-bearing field: a folder named after its VERB can hold three
                // different planes, and that is precisely what a directory-keyed predicate gets wrong.
                folder.planesMixed = entry.mixed;
                folder.entrypointPlanes = entry.entrypoints
            }
        })
    }

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
        root           : options.root,
        cwd,
        includePlanes  : options.planes,
        planeProjection: options.planeProjection,
        includeFiles   : options.files,
        includeLoc     : options.loc
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
    const options = parseArgs(argv);

    if (options.planes) {
        const {buildPlaneProjection} = await import('../lint/lint-script-plane.mjs');

        options.planeProjection = buildPlaneProjection()
    }

    return writeStructureMap(options, io);
}

const isDirectCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectCli) {
    // Routed through `main()` rather than calling `writeStructureMap` directly: `main` is where the
    // async plane projection is resolved, and a second entry path that skips it would make `--planes`
    // work under test and fail from the shell — the two-entry-point divergence that makes a flag look
    // implemented while nobody can use it.
    Promise.resolve()
        .then(() => main(process.argv.slice(2)))
        .catch(error => {
            console.error(error.message);
            process.exit(1);
        });
}
