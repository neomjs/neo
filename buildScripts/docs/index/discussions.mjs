import fs              from 'fs-extra';
import path            from 'path';
import {Command}       from 'commander';
import {fileURLToPath} from 'url';
import fg              from 'fast-glob';
import matter          from 'gray-matter';
import {sanitizeInput} from '../../util/sanitizer.mjs';

/**
 * @module buildScripts.createDiscussionIndex
 * @summary Generates the chunked Discussions tree index for the Neo.mjs Portal application.
 *
 * The script scans synced GitHub Discussion markdown from active and archive content buckets and emits a
 * lightweight root index plus per-content-chunk leaf files. The root index groups by frontmatter category
 * and points at chunk leaf files so the Portal can lazy-load Discussions without loading the entire corpus.
 *
 * @see buildScripts/docs/index/tickets.mjs
 * @see https://github.com/neomjs/neo/issues/12210
 * @keywords portal, discussions, seo, json-index, build-script, chunked-index
 */

const ROOT_DIR    = process.cwd();
const INPUT_DIR   = path.resolve(ROOT_DIR, 'resources/content/discussions');
const ARCHIVE_DIR = path.resolve(ROOT_DIR, 'resources/content/archive/discussions');
const OUTPUT_FILE = path.resolve(ROOT_DIR, 'apps/portal/resources/data/discussions.json');
const OUTPUT_DIR  = path.resolve(ROOT_DIR, 'apps/portal/resources/data/discussions');

const CATEGORY_ORDER = ['Ideas', 'General', 'Q&A'];

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
function getCategory(frontmatter) {
    return frontmatter.category || 'General'
}

/**
 * @summary Resolves the stable tree-state emitted for a discussion leaf.
 * @param {Object} frontmatter
 * @returns {'answered'|'closed'|'open'}
 */
function getDiscussionState(frontmatter) {
    if (frontmatter.state) {
        return String(frontmatter.state).toLowerCase()
    }

    if (frontmatter.isAnswered === true || frontmatter.isAnswered === 'true' || frontmatter.answerChosenAt) {
        return 'answered'
    }

    return frontmatter.closed === true || frontmatter.closed === 'true' ? 'closed' : 'open'
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
 * Core logic to generate the chunked Discussions index.
 *
 * @param {Object} options Configuration options
 * @param {String} [options.archiveDir] Directory containing archived discussion markdown files.
 * @param {String} [options.inputDir] Directory containing active discussion markdown files.
 * @param {String} [options.outputDir] Directory for per-chunk leaf JSON files.
 * @param {String} [options.outputFile] Path to the root index JSON file.
 * @returns {Promise<void>} Resolves when the JSON files are written.
 */
async function createDiscussionIndex(options = {}) {
    const
        inputDir   = options.inputDir   || INPUT_DIR,
        archiveDir = options.archiveDir || ARCHIVE_DIR,
        outputDir  = options.outputDir  || OUTPUT_DIR,
        outputFile = options.outputFile || OUTPUT_FILE;

    console.log(`Scanning discussions in:\n- ${inputDir}\n- ${archiveDir}`);

    const activeFiles   = await fg('**/discussion-*.md', { cwd: inputDir,   absolute: true });
    const archivedFiles = await fg('**/discussion-*.md', { cwd: archiveDir, absolute: true });

    const allFiles = [
        ...activeFiles.map(filePath => ({filePath, isActive: true})),
        ...archivedFiles.map(filePath => ({filePath, isActive: false}))
    ];

    const groups = new Map();
    const chunks = new Map();
    const idMap  = {};

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
            category = getCategory(frontmatter),
            slug     = slugify(category),
            bucket   = getSourceBucket(filePath, {archiveDir, inputDir, isActive}),
            chunkId  = `${category}/${bucket.sourceKey}`,
            chunkPath = `discussions/${slug}/${bucket.sourceKey}.json`,
            dateValue = frontmatter.updatedAt || frontmatter.createdAt || '';

        if (!groups.has(category)) {
            groups.set(category, {
                collapsed: category !== CATEGORY_ORDER[0],
                id       : category,
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
                filePrefix : 'discussion-',
                id         : chunkId,
                isLeaf     : false,
                parentId   : category,
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
            state   : getDiscussionState(frontmatter),
            title   : frontmatter.title
        });

        idMap[String(frontmatter.number)] = chunkId
    }

    const sortedGroups = Array.from(groups.keys()).sort((a, b) => {
        const
            aIndex = CATEGORY_ORDER.indexOf(a),
            bIndex = CATEGORY_ORDER.indexOf(b);

        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.localeCompare(b)
    });

    const rootIndex = [];

    for (const category of sortedGroups) {
        rootIndex.push(groups.get(category));

        const groupChunks = Array.from(chunks.values())
            .filter(chunk => chunk.parentId === category)
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

    // Deep-link resolver: maps every leaf id to its chunk folder id, so consumers can load
    // exactly the one chunk containing a deep-linked item instead of scanning folders.
    await fs.writeJSON(path.join(outputDir, 'idMap.json'), idMap);

    console.log(`Discussions index written to ${outputFile}`);
    console.log(`Discussions leaf chunks written to ${outputDir}`);
    console.log(`Discussions id map written to ${path.join(outputDir, 'idMap.json')}`);
}

/**
 * CLI entry point for the script.
 */
async function runCli() {
    const program = new Command();

    program
        .name('create-discussion-index')
        .description('Generates a chunked JSON index of discussions.')
        .option('-i, --input <path>',   'Active discussions directory path', sanitizeInput)
        .option('-a, --archive <path>', 'Archive discussions directory path', sanitizeInput)
        .option('-d, --output-dir <path>', 'Output chunk directory path', sanitizeInput)
        .option('-o, --output <path>',  'Output root index file path', sanitizeInput);

    program.parse(process.argv);

    const opts = program.opts();

    await createDiscussionIndex({
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

export default createDiscussionIndex;
