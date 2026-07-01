import fs              from 'fs-extra';
import path            from 'path';
import {Command}       from 'commander';
import {fileURLToPath} from 'url';
import fg              from 'fast-glob';
import matter          from 'gray-matter';
import semver          from 'semver';
import {sanitizeInput} from '../../util/sanitizer.mjs';

/**
 * @module buildScripts.createTicketIndex
 * @summary Generates hierarchical GitHub ticket indexes for the Neo.mjs Portal application.
 *
 * This script is a critical part of the **Portal Knowledge Hub** data pipeline. It parses local markdown
 * files (synced from GitHub Issues) and transforms them into the chunked `tickets/index.json` surface:
 * a root group-index, per-content-chunk leaf files, and a crawler manifest, loaded folder-by-folder
 * by lazy `TreeList` consumers.
 *
 * **Key Features:**
 * - **Dual-Source Scanning:** Reads from both active issues (`resources/content/issues`) and the issue archive (`resources/content/archive/issues`).
 * - **Intelligent Filtering:** Includes high-value tickets (bug, feature, epic) while excluding noise (chore, task) to ensure high signal-to-noise ratio for SEO and AI.
 * - **Hierarchical Grouping:** Groups tickets by "Backlog" (active) or by release version (archived), sorted semantically.
 * - **Chunked Surface:** Leaf files omit repeated markdown `path` values; chunk nodes carry the
 *   reconstruction metadata (`contentDir`, `filePrefix`) consumers rebuild paths from.
 *
 * @see apps/portal/view/news/tickets/MainContainer.mjs
 * @see buildScripts/createReleaseIndex.mjs
 * @keywords portal, tickets, seo, json-index, build-script, knowledge-base
 */

const ROOT_DIR    = process.cwd();
const ISSUES_DIR  = path.resolve(ROOT_DIR, 'resources/content/issues');
const ARCHIVE_DIR = path.resolve(ROOT_DIR, 'resources/content/archive/issues');
const DATA_DIR            = path.resolve(ROOT_DIR, 'apps/portal/resources/data');
const CHUNKED_OUTPUT_FILE = path.resolve(ROOT_DIR, 'apps/portal/resources/data/tickets/index.json');
const OUTPUT_DIR          = path.resolve(ROOT_DIR, 'apps/portal/resources/data/tickets');
const MANIFEST_FILE       = path.resolve(ROOT_DIR, 'apps/portal/resources/data/tickets/manifest.json');

// Labels to include (case-insensitive check)
const INCLUDE_LABELS = new Set(['bug', 'feature', 'enhancement', 'documentation', 'epic', 'architecture', 'refactoring']);
// Labels to exclude (unless an include label is present)
const EXCLUDE_LABELS = new Set(['chore', 'task', 'agent-task']);

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
 * @param {String} filePath
 * @param {Object} options
 * @param {String} options.archiveDir
 * @param {String} options.issuesDir
 * @param {Boolean} options.isActive
 * @returns {Object}
 */
function getSourceBucket(filePath, {archiveDir, issuesDir, isActive}) {
    const
        dir         = path.dirname(filePath),
        relativeDir = path.relative(isActive ? issuesDir : archiveDir, dir),
        sourceKey   = `${isActive ? 'active' : 'archive'}-${slugify(relativeDir)}`;

    return {
        contentDir: path.relative(ROOT_DIR, dir),
        sourceKey,
        title     : isActive ? relativeDir : `archive/${relativeDir}`
    }
}

/**
 * @param {String} groupName
 * @param {Number} index
 * @returns {Object}
 */
function createGroupNode(groupName, index) {
    return {
        id       : groupName,
        isLeaf   : false,
        parentId : null,
        collapsed: index !== 1 // Preserve the current UX: Backlog collapsed, latest release expanded.
    }
}

/**
 * @param {Object} a
 * @param {Object} b
 * @returns {Number}
 */
function sortTickets(a, b) {
    const
        dateA = a._closedAt || a._updatedAt || 0,
        dateB = b._closedAt || b._updatedAt || 0;

    if (dateA !== dateB) {
        return new Date(dateB) - new Date(dateA)
    }

    return parseInt(b.id) - parseInt(a.id)
}

/**
 * Orders chunk-folder nodes within a group by their positional chunk number, descending (newest /
 * highest-numbered chunk first). This matches the newest-first ordering used elsewhere in the tree
 * (release groups are semver-descending; leaves within a chunk are date/id-descending) and, critically,
 * keeps folder display order aligned with the positional `treeNodeName` range labels.
 *
 * The previous `sortDate`-based ordering scrambled folders relative to their labels: a chunk's max
 * item-date is not monotonic with its number (item updates bump older chunks), so date-order and
 * chunk-number order diverge while the labels stay positional.
 * @param {Object} a
 * @param {Object} b
 * @returns {Number}
 */
function sortChunkFolders(a, b) {
    const
        matchA = a.title?.match(/chunk-(\d+)$/),
        matchB = b.title?.match(/chunk-(\d+)$/);

    if (matchA && matchB) {
        return Number(matchB[1]) - Number(matchA[1])
    }

    // Defensive fallback for any bucket without a `chunk-N` title: preserve the prior date-then-id order.
    return (new Date(b.sortDate || 0) - new Date(a.sortDate || 0)) || a.id.localeCompare(b.id)
}

/**
 * @param {String[]} sortedGroups
 * @param {Map<String,Object[]>} ticketsByGroup
 * @returns {{rootIndex: Object[], chunks: Map<String,Object>, idMap: Object}}
 */
function buildChunkedIndex(sortedGroups, ticketsByGroup) {
    const
        chunks    = new Map(),
        idMap     = {},
        rootIndex = [];

    for (const groupName of sortedGroups) {
        for (const ticket of ticketsByGroup.get(groupName).sort(sortTickets)) {
            const
                bucket    = ticket._bucket,
                chunkId   = `${groupName}/${bucket.sourceKey}`,
                chunkPath = `tickets/${slugify(groupName)}/${bucket.sourceKey}.json`,
                dateValue = ticket._closedAt || ticket._updatedAt || '';

            if (!chunks.has(chunkId)) {
                chunks.set(chunkId, {
                    childrenUrl: chunkPath,
                    childCount : 0,
                    collapsed  : true,
                    contentDir : bucket.contentDir,
                    filePrefix : 'issue-',
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
                id      : ticket.id,
                parentId: chunkId,
                title   : ticket.title
            });

            idMap[ticket.id] = chunkId
        }
    }

    sortedGroups.forEach((groupName, index) => {
        rootIndex.push(createGroupNode(groupName, index));

        const groupChunks = Array.from(chunks.values())
            .filter(chunk => chunk.parentId === groupName)
            .sort(sortChunkFolders);

        rootIndex.push(...groupChunks.map(chunk => {
            const {records, sortDate, ...node} = chunk;
            return node
        }))
    });

    return {rootIndex, chunks, idMap}
}

/**
 * Core logic to scan, filter, and index ticket markdown files.
 *
 * This function performs the heavy lifting:
 * 1.  Glob-scans the configured directories for `.md` files.
 * 2.  Parses YAML frontmatter to extract metadata (id, title, labels, dates).
 * 3.  Applies inclusion/exclusion label logic.
 * 4.  Groups tickets by version (directory name) or 'Backlog'.
 * 5.  Sorts groups by SemVer and tickets by date/ID.
 * 6.  Writes the chunked root-index, per-chunk leaf files, and crawler manifest.
 *
 * @param {Object} options Configuration options
 * @param {String} [options.issuesDir] - Directory containing active markdown tickets (defaults to `resources/content/issues`)
 * @param {String} [options.archiveDir] - Directory containing archived markdown tickets (defaults to `resources/content/archive/issues`)
 * @param {String} [options.outputDir] - Directory for chunked ticket leaf JSON files (defaults to `apps/portal/resources/data/tickets`)
 * @param {String} [options.dataDir] - Portal data root the chunk `childrenUrl` values resolve against (defaults to `apps/portal/resources/data`)
 * @param {String} [options.chunkedOutputFile] - Path to the chunked root-index JSON file (defaults to `apps/portal/resources/data/tickets/index.json`)
 * @param {String} [options.manifestFile] - Path to the crawler manifest JSON file (defaults to `apps/portal/resources/data/tickets/manifest.json`)
 * @returns {Promise<void>} Resolves when the JSON file is written
 */
async function createTicketIndex(options = {}) {
    const
        issuesDir         = options.issuesDir         || ISSUES_DIR,
        archiveDir        = options.archiveDir        || ARCHIVE_DIR,
        outputDir         = options.outputDir         || OUTPUT_DIR,
        dataDir           = options.dataDir           || DATA_DIR,
        chunkedOutputFile = options.chunkedOutputFile || CHUNKED_OUTPUT_FILE,
        manifestFile      = options.manifestFile      || MANIFEST_FILE;

    console.log(`Scanning tickets in:\n- ${issuesDir}\n- ${archiveDir}`);

    // 1. Find all markdown files
    const activeFiles   = await fg('**/*.md', { cwd: issuesDir,  absolute: true });
    const archivedFiles = await fg('**/issue-*.md', { cwd: archiveDir, absolute: true });

    const allFiles = [
        ...activeFiles.map(f => ({ path: f, isActive: true })),
        ...archivedFiles.map(f => ({ path: f, isActive: false }))
    ];

    if (allFiles.length === 0) {
        console.warn('No ticket files found.');
        return;
    }

    console.log(`Found ${allFiles.length} total ticket files.`);

    const ticketsByGroup = new Map();

    await Promise.all(allFiles.map(async (fileInfo) => {
        const filePath = fileInfo.path;

        let content;
        try {
            content = await fs.readFile(filePath, 'utf8');
        } catch (e) {
            console.warn(`Failed to read file ${filePath}:`, e.message);
            return;
        }

        let frontmatter = {};
        try {
            const parsed = matter(content);
            frontmatter  = parsed.data;
        } catch (e) {
            console.warn(`Failed to parse frontmatter for ${filePath}:`, e.message);
            return; // Skip malformed files
        }

        // Validate essential fields
        if (!frontmatter.id || !frontmatter.title) {
            return;
        }

        // Filtering Logic
        const labels          = Array.isArray(frontmatter.labels) ? frontmatter.labels.map(l => (l.name || l).toLowerCase()) : [];
        const hasIncludeLabel = labels.some(l => INCLUDE_LABELS.has(l));
        const hasExcludeLabel = labels.some(l => EXCLUDE_LABELS.has(l));

        let shouldKeep = true;
        if (hasExcludeLabel && !hasIncludeLabel) {
            shouldKeep = false;
        }
        if (!shouldKeep) {
            return;
        }

        // Determine Group (Version or Backlog)
        let groupName;
        if (fileInfo.isActive) {
            groupName = 'Backlog';
        } else {
            // path/to/archive/issues/v1.2.3/chunk-0/issue-123.md -> v1.2.3
            const relativeToArchive = path.relative(archiveDir, filePath);
            groupName = relativeToArchive.split(path.sep)[0];
        }

        const
            ticketId = String(frontmatter.id),
            bucket   = getSourceBucket(filePath, {archiveDir, issuesDir, isActive: fileInfo.isActive});

        const ticketData = {
            id      : ticketId,
            parentId: groupName,
            title   : frontmatter.title,
            // Internal sorting keys (removed before write)
            _closedAt : frontmatter.closedAt,
            _updatedAt: frontmatter.updatedAt,
            _bucket   : bucket
        };

        if (!ticketsByGroup.has(groupName)) {
            ticketsByGroup.set(groupName, []);
        }
        ticketsByGroup.get(groupName).push(ticketData);
    }));

    // Sort Groups
    // 'Backlog' first, then versions descending (using semver)
    const sortedGroups = Array.from(ticketsByGroup.keys()).sort((a, b) => {
        if (a === 'Backlog') return -1;
        if (b === 'Backlog') return 1;

        // Clean versions for semver comparison
        const vA = a.replace(/^v/, '');
        const vB = b.replace(/^v/, '');

        if (semver.valid(vA) && semver.valid(vB)) {
            return semver.rcompare(vA, vB);
        }
        return b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });
    });

    const
        ticketCount                = Array.from(ticketsByGroup.values()).reduce((sum, group) => sum + group.length, 0),
        {rootIndex, chunks, idMap} = buildChunkedIndex(sortedGroups, ticketsByGroup);

    console.log(`Filtered down to ${ticketCount} tickets in ${sortedGroups.length} groups.`);

    await fs.emptyDir(outputDir);

    for (const chunk of chunks.values()) {
        const target = path.join(dataDir, chunk.childrenUrl);

        chunk.records.sort(sortTickets);

        await fs.ensureDir(path.dirname(target));
        await fs.writeJSON(target, chunk.records)
    }

    const manifest = {
        indexUrl: path.relative(dataDir, chunkedOutputFile).split(path.sep).join('/'),
        chunks  : Array.from(chunks.values())
            .map(({childCount, childrenUrl, contentDir, filePrefix, id, parentId, title}) => ({
                id,
                parentId,
                title,
                childrenUrl,
                childCount,
                contentDir,
                filePrefix
            }))
            .sort((a, b) => a.childrenUrl.localeCompare(b.childrenUrl))
    };

    await fs.ensureDir(path.dirname(chunkedOutputFile));
    await fs.ensureDir(path.dirname(manifestFile));
    await fs.writeJSON(chunkedOutputFile, rootIndex);
    await fs.writeJSON(manifestFile, manifest);

    // Deep-link resolver: maps every leaf id to its chunk folder id, so consumers can load
    // exactly the one chunk containing a deep-linked item instead of scanning folders.
    await fs.writeJSON(path.join(outputDir, 'idMap.json'), idMap);

    console.log(`Chunked ticket root index written to ${chunkedOutputFile}`);
    console.log(`Chunked ticket leaf files written to ${outputDir}`);
    console.log(`Ticket crawler manifest written to ${manifestFile}`);
    console.log(`Ticket id map written to ${path.join(outputDir, 'idMap.json')}`);
}

/**
 * CLI entry point for the script.
 * Handles argument parsing using `commander` and invokes the main `createTicketIndex` function.
 *
 * Supported flags:
 * - `-i, --issues <path>`: Custom issues directory
 * - `-a, --archive <path>`: Custom archive directory
 * - `-d, --output-dir <path>`: Custom chunk output directory
 * - `-c, --chunked-output <path>`: Custom chunked root-index output file path
 * - `-m, --manifest <path>`: Custom crawler manifest output file path
 */
async function runCli() {
    const program = new Command();

    program
        .name('create-ticket-index')
        .description('Generates a hierarchical JSON index of tickets.')
        .option('-i, --issues <path>',  'Active issues directory path', sanitizeInput)
        .option('-a, --archive <path>', 'Archive directory path', sanitizeInput)
        .option('-d, --output-dir <path>', 'Output chunk directory path', sanitizeInput)
        .option('-c, --chunked-output <path>', 'Chunked root-index output file path', sanitizeInput)
        .option('-m, --manifest <path>', 'Crawler manifest output file path', sanitizeInput);

    program.parse(process.argv);

    const opts = program.opts();

    await createTicketIndex({
        issuesDir        : opts.issues        ? path.resolve(ROOT_DIR, opts.issues)        : undefined,
        archiveDir       : opts.archive       ? path.resolve(ROOT_DIR, opts.archive)       : undefined,
        outputDir        : opts.outputDir     ? path.resolve(ROOT_DIR, opts.outputDir)     : undefined,
        chunkedOutputFile: opts.chunkedOutput ? path.resolve(ROOT_DIR, opts.chunkedOutput) : undefined,
        manifestFile     : opts.manifest      ? path.resolve(ROOT_DIR, opts.manifest)      : undefined
    });
}

const cliEntryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath   = fileURLToPath(import.meta.url);

if (cliEntryPath && cliEntryPath === modulePath) {
    runCli().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

export default createTicketIndex;
