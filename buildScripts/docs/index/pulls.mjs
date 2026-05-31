import fs              from 'fs-extra';
import path            from 'path';
import {Command}       from 'commander/esm.mjs';
import {fileURLToPath} from 'url';
import fg              from 'fast-glob';
import matter          from 'gray-matter';
import {sanitizeInput} from '../../util/Sanitizer.mjs';

/**
 * @module buildScripts.createPullRequestIndex
 * @summary Generates the chunked Pull Requests tree index for the Neo.mjs Portal application.
 *
 * The script scans synced pull-request markdown from active and archive content buckets and emits a
 * lightweight root index plus per-content-chunk leaf files. The root index contains semantic groups
 * (Merged / Open / Closed) and chunk-folder nodes; leaves stay in chunk files so the Portal can lazy-load
 * them on folder expand without loading the entire PR corpus up front.
 *
 * @see buildScripts/docs/index/tickets.mjs
 * @see https://github.com/neomjs/neo/issues/12210
 * @keywords portal, pull-requests, seo, json-index, build-script, chunked-index
 */

const ROOT_DIR    = process.cwd();
const PULLS_DIR   = path.resolve(ROOT_DIR, 'resources/content/pulls');
const ARCHIVE_DIR = path.resolve(ROOT_DIR, 'resources/content/archive/pulls');
const OUTPUT_FILE = path.resolve(ROOT_DIR, 'apps/portal/resources/data/pulls.json');
const OUTPUT_DIR  = path.resolve(ROOT_DIR, 'apps/portal/resources/data/pulls');

const GROUP_ORDER = ['Merged', 'Open', 'Closed'];

/**
 * @param {String} value
 * @returns {String}
 */
function slugify(value) {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
}

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
 * @param {String} filePath
 * @param {Object} options
 * @param {String} options.archiveDir
 * @param {String} options.inputDir
 * @param {Boolean} options.isActive
 * @returns {Object}
 */
function getSourceBucket(filePath, {archiveDir, inputDir, isActive}) {
    const
        dir         = path.dirname(filePath),
        relativeDir = path.relative(isActive ? inputDir : archiveDir, dir),
        sourceKey   = `${isActive ? 'active' : 'archive'}-${slugify(relativeDir)}`;

    return {
        contentDir: path.relative(ROOT_DIR, dir),
        sourceKey,
        title     : isActive ? relativeDir : `archive/${relativeDir}`
    }
}

/**
 * Core logic to generate the chunked Pull Requests index.
 *
 * @param {Object} options Configuration options
 * @param {String} [options.archiveDir] Directory containing archived pull markdown files.
 * @param {String} [options.inputDir] Directory containing active pull markdown files.
 * @param {String} [options.outputDir] Directory for per-chunk leaf JSON files.
 * @param {String} [options.outputFile] Path to the root index JSON file.
 * @returns {Promise<void>} Resolves when the JSON files are written.
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

    const groups = new Map();
    const chunks = new Map();

    for (const fileInfo of allFiles) {
        const {filePath, isActive} = fileInfo;

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
            groupSlug = slugify(groupName),
            bucket    = getSourceBucket(filePath, {archiveDir, inputDir, isActive}),
            chunkId   = `${groupName}/${bucket.sourceKey}`,
            chunkPath = `pulls/${groupSlug}/${bucket.sourceKey}.json`,
            dateValue = frontmatter.mergedAt || frontmatter.closedAt || frontmatter.updatedAt || frontmatter.createdAt || '';

        if (!groups.has(groupName)) {
            groups.set(groupName, {
                collapsed: groupName !== GROUP_ORDER[0],
                id       : groupName,
                isLeaf   : false,
                parentId : null
            })
        }

        if (!chunks.has(chunkId)) {
            chunks.set(chunkId, {
                childrenUrl: chunkPath,
                childCount : 0,
                collapsed  : true,
                contentDir : bucket.contentDir,
                filePrefix : 'pr-',
                id         : chunkId,
                isLeaf     : false,
                parentId   : groupName,
                sortDate   : dateValue,
                title      : bucket.title,
                records    : []
            })
        }

        const chunk = chunks.get(chunkId);

        chunk.childCount++;

        if (dateValue && (!chunk.sortDate || new Date(dateValue) > new Date(chunk.sortDate))) {
            chunk.sortDate = dateValue
        }

        chunk.records.push({
            id      : String(frontmatter.number),
            parentId: chunkId,
            title   : frontmatter.title
        })
    }

    const rootIndex = [];

    for (const groupName of GROUP_ORDER) {
        if (!groups.has(groupName)) {
            continue
        }

        rootIndex.push(groups.get(groupName));

        const groupChunks = Array.from(chunks.values())
            .filter(chunk => chunk.parentId === groupName)
            .sort((a, b) => {
                const dateDiff = new Date(b.sortDate || 0) - new Date(a.sortDate || 0);
                return dateDiff || a.id.localeCompare(b.id)
            });

        rootIndex.push(...groupChunks.map(chunk => {
            const {records, sortDate, ...node} = chunk;
            return node
        }))
    }

    await fs.emptyDir(outputDir);

    for (const chunk of chunks.values()) {
        const target = path.join(path.dirname(outputFile), chunk.childrenUrl);

        chunk.records.sort((a, b) => Number(b.id) - Number(a.id));

        await fs.ensureDir(path.dirname(target));
        await fs.writeJSON(target, chunk.records)
    }

    await fs.ensureDir(path.dirname(outputFile));
    await fs.writeJSON(outputFile, rootIndex);

    console.log(`Pull Requests index written to ${outputFile}`);
    console.log(`Pull Requests leaf chunks written to ${outputDir}`);
}

/**
 * CLI entry point for the script.
 */
async function runCli() {
    const program = new Command();

    program
        .name('create-pull-request-index')
        .description('Generates a chunked JSON index of pull requests.')
        .option('-i, --input <path>',   'Active pull requests directory path', sanitizeInput)
        .option('-a, --archive <path>', 'Archive pull requests directory path', sanitizeInput)
        .option('-d, --output-dir <path>', 'Output chunk directory path', sanitizeInput)
        .option('-o, --output <path>',  'Output root index file path', sanitizeInput);

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
