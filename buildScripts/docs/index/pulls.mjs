import fs              from 'fs-extra';
import path            from 'path';
import {Command}       from 'commander/esm.mjs';
import {fileURLToPath} from 'url';
import fg              from 'fast-glob';
import matter          from 'gray-matter';
import {sanitizeInput} from '../../util/Sanitizer.mjs';

/**
 * @module buildScripts.createPullRequestIndex
 * @summary Generates the Pull Requests tree index for the Neo.mjs Portal application.
 *
 * Scans synced pull-request markdown from active + archive content buckets and emits a flat tree —
 * semantic group roots (Merged / Open / Closed) with PR leaves directly beneath them, each carrying
 * its markdown `path`. This mirrors the tickets view's `tickets.json` shape so both portal views are
 * structurally consistent. (Lazy / chunked loading is a future migration to be applied to both views
 * together, not pulls-only.)
 *
 * @see buildScripts/docs/index/tickets.mjs
 * @see https://github.com/neomjs/neo/issues/12210
 * @keywords portal, pull-requests, seo, json-index, build-script
 */

const ROOT_DIR    = process.cwd();
const PULLS_DIR   = path.resolve(ROOT_DIR, 'resources/content/pulls');
const ARCHIVE_DIR = path.resolve(ROOT_DIR, 'resources/content/archive/pulls');
const OUTPUT_FILE = path.resolve(ROOT_DIR, 'apps/portal/resources/data/pulls.json');
const OUTPUT_DIR  = path.resolve(ROOT_DIR, 'apps/portal/resources/data/pulls');

const GROUP_ORDER = ['Merged', 'Open', 'Closed'];

/**
 * @param {Object} frontmatter
 * @returns {String}
 */
function getGroupName(frontmatter) {
    const state = String(frontmatter.state || '').toUpperCase();

    if (state === 'MERGED' || frontmatter.mergedAt) {
        return 'Merged'
    }

    if (state === 'OPEN') {
        return 'Open'
    }

    return 'Closed'
}

/**
 * @param {Object} a
 * @param {Object} b
 * @returns {Number}
 */
function sortPulls(a, b) {
    const dateDiff = new Date(b._date || 0) - new Date(a._date || 0);

    return dateDiff || (Number(b.id) - Number(a.id))
}

/**
 * Builds the flat tree (group roots + PR leaves), mirroring the tickets view's `tickets.json` shape.
 * @param {Map<String,Object[]>} pullsByGroup
 * @returns {Object[]}
 */
function buildFlatTree(pullsByGroup) {
    const flatTree = [];

    GROUP_ORDER.forEach(groupName => {
        const leaves = pullsByGroup.get(groupName);

        if (!leaves) {
            return
        }

        flatTree.push({
            collapsed: groupName !== GROUP_ORDER[0],
            id       : groupName,
            isLeaf   : false,
            parentId : null
        });

        leaves.slice().sort(sortPulls).forEach(({id, parentId, path: leafPath, title}) => {
            flatTree.push({id, parentId, path: leafPath, title})
        })
    });

    return flatTree
}

/**
 * Core logic to generate the flat Pull Requests index.
 *
 * @param {Object} options Configuration options
 * @param {String} [options.archiveDir] Directory containing archived pull markdown files.
 * @param {String} [options.inputDir] Directory containing active pull markdown files.
 * @param {String} [options.outputDir] Stale chunk-output directory removed during the flat rewrite.
 * @param {String} [options.outputFile] Path to the flat tree JSON file.
 * @returns {Promise<void>} Resolves when the JSON file is written.
 */
async function createPullRequestIndex(options = {}) {
    const
        inputDir   = options.inputDir   || PULLS_DIR,
        archiveDir = options.archiveDir || ARCHIVE_DIR,
        outputDir  = options.outputDir  || OUTPUT_DIR,
        outputFile = options.outputFile || OUTPUT_FILE;

    console.log(`Scanning pull requests in:\n- ${inputDir}\n- ${archiveDir}`);

    const activeFiles   = await fg('**/pr-*.md', { cwd: inputDir,   absolute: true });
    const archivedFiles = await fg('**/pr-*.md', { cwd: archiveDir, absolute: true });

    const allFiles = [
        ...activeFiles.map(filePath => ({filePath, isActive: true})),
        ...archivedFiles.map(filePath => ({filePath, isActive: false}))
    ];

    const pullsByGroup = new Map();

    for (const fileInfo of allFiles) {
        const {filePath} = fileInfo;

        let frontmatter = {};

        try {
            const parsed = matter(await fs.readFile(filePath, 'utf8'));
            frontmatter  = parsed.data;
        } catch (e) {
            console.warn(`Failed to parse frontmatter for ${filePath}:`, e.message);
            continue
        }

        if (!frontmatter.number || !frontmatter.title) {
            continue
        }

        const
            groupName = getGroupName(frontmatter),
            dateValue = frontmatter.mergedAt || frontmatter.closedAt || frontmatter.updatedAt || frontmatter.createdAt || '';

        if (!pullsByGroup.has(groupName)) {
            pullsByGroup.set(groupName, [])
        }

        pullsByGroup.get(groupName).push({
            _date   : dateValue,
            id      : String(frontmatter.number),
            parentId: groupName,
            path    : path.relative(ROOT_DIR, filePath),
            title   : frontmatter.title
        })
    }

    const flatTree = buildFlatTree(pullsByGroup);

    // Remove the stale per-chunk leaf output from the prior lazy-load shape; the flat tree carries
    // every PR leaf inline (consistent with tickets.json).
    await fs.remove(outputDir);
    await fs.ensureDir(path.dirname(outputFile));
    await fs.writeJSON(outputFile, flatTree);

    console.log(`Pull Requests index written to ${outputFile} (${flatTree.length} nodes)`);
}

/**
 * CLI entry point for the script.
 */
async function runCli() {
    const program = new Command();

    program
        .name('create-pull-request-index')
        .description('Generates a flat JSON index of pull requests.')
        .option('-i, --input <path>',   'Active pull requests directory path', sanitizeInput)
        .option('-a, --archive <path>', 'Archive pull requests directory path', sanitizeInput)
        .option('-d, --output-dir <path>', 'Stale chunk directory to remove', sanitizeInput)
        .option('-o, --output <path>',  'Output flat index file path', sanitizeInput);

    program.parse(process.argv);

    const opts = program.opts();

    await createPullRequestIndex({
        inputDir  : opts.input     ? path.resolve(ROOT_DIR, opts.input)     : undefined,
        archiveDir: opts.archive   ? path.resolve(ROOT_DIR, opts.archive)   : undefined,
        outputDir : opts.outputDir ? path.resolve(ROOT_DIR, opts.outputDir) : undefined,
        outputFile: opts.output    ? path.resolve(ROOT_DIR, opts.output)    : undefined
    })
}

const cliEntryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath   = fileURLToPath(import.meta.url);

if (cliEntryPath && cliEntryPath === modulePath) {
    runCli().catch(err => {
        console.error(err);
        process.exit(1)
    })
}

export default createPullRequestIndex;
