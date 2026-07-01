import fs              from 'fs-extra';
import path            from 'path';
import {Command}       from 'commander';
import {fileURLToPath} from 'url';
import fg              from 'fast-glob';
import matter          from 'gray-matter';
import semver          from 'semver';
import {sanitizeInput} from '../../util/sanitizer.mjs';

/**
 * @module buildScripts.createPullRequestIndex
 * @summary Generates hierarchical Pull Request indexes for the Neo.mjs Portal application.
 *
 * Sibling to `tickets.mjs`: the PR content tree mirrors the issue content tree because the on-disk
 * markdown structure is identical — `resources/content/pulls/chunk-*` for unreleased PRs and
 * `resources/content/archive/pulls/<version>/chunk-*` for released ones. The script parses that
 * structure into the chunked surface (`pulls/index.json` + per-chunk leaf files + `manifest.json`):
 * a lightweight root index whose chunk nodes carry reconstruction metadata (`contentDir`,
 * `filePrefix`) and point at lazy-loadable leaf files, so the portal tree loads PRs
 * folder-by-folder instead of the whole corpus.
 *
 * Grouping is by **release**, not PR state: ~99% of PRs are merged, so a Merged/Open/Closed split is
 * noise. The release a PR belongs to is its archive folder (`Latest` while unreleased).
 *
 * @see buildScripts/docs/index/tickets.mjs
 * @see apps/portal/view/news/pulls/MainContainer.mjs
 * @keywords portal, pull-requests, seo, json-index, build-script, chunked-index
 */

const ROOT_DIR    = process.cwd();
const PULLS_DIR   = path.resolve(ROOT_DIR, 'resources/content/pulls');
const ARCHIVE_DIR = path.resolve(ROOT_DIR, 'resources/content/archive/pulls');
const DATA_DIR            = path.resolve(ROOT_DIR, 'apps/portal/resources/data');
const CHUNKED_OUTPUT_FILE = path.resolve(ROOT_DIR, 'apps/portal/resources/data/pulls/index.json');
const OUTPUT_DIR          = path.resolve(ROOT_DIR, 'apps/portal/resources/data/pulls');
const MANIFEST_FILE       = path.resolve(ROOT_DIR, 'apps/portal/resources/data/pulls/manifest.json');

// The active (unreleased) bucket's group name; the released buckets are named by their version folder.
const ACTIVE_GROUP = 'Latest';

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
 * @param {String} groupName
 * @param {Number} index
 * @returns {Object}
 */
function createGroupNode(groupName, index) {
    return {
        id       : groupName,
        isLeaf   : false,
        parentId : null,
        collapsed: index !== 1 // Mirror tickets UX: the active group collapsed, the latest release expanded.
    }
}

/**
 * @param {Object} a
 * @param {Object} b
 * @returns {Number}
 */
function sortPulls(a, b) {
    const
        dateA = a._mergedAt || a._closedAt || a._updatedAt || 0,
        dateB = b._mergedAt || b._closedAt || b._updatedAt || 0;

    if (dateA !== dateB) {
        return new Date(dateB) - new Date(dateA)
    }

    return parseInt(b.id) - parseInt(a.id)
}

/**
 * Orders chunk-folder nodes within a group by their positional chunk number, descending (newest /
 * highest-numbered chunk first). This matches the newest-first ordering used elsewhere in the tree
 * (release groups are semver-descending; leaves within a chunk are id-descending) and, critically,
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
 * @param {Map<String,Object[]>} pullsByGroup
 * @returns {{rootIndex: Object[], chunks: Map<String,Object>, idMap: Object}}
 */
function buildChunkedIndex(sortedGroups, pullsByGroup) {
    const
        chunks    = new Map(),
        idMap     = {},
        rootIndex = [];

    for (const groupName of sortedGroups) {
        for (const pull of pullsByGroup.get(groupName).sort(sortPulls)) {
            const
                bucket    = pull._bucket,
                chunkId   = `${groupName}/${bucket.sourceKey}`,
                chunkPath = `pulls/${slugify(groupName)}/${bucket.sourceKey}.json`,
                dateValue = pull._mergedAt || pull._closedAt || pull._updatedAt || '';

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
                id      : pull.id,
                parentId: chunkId,
                title   : pull.title
            });

            idMap[pull.id] = chunkId
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
 * @param {String[]} keys
 * @returns {String[]}
 */
function sortGroups(keys) {
    // `Latest` (unreleased) first, then release versions descending (semver-aware).
    return keys.sort((a, b) => {
        if (a === ACTIVE_GROUP) return -1;
        if (b === ACTIVE_GROUP) return 1;

        const
            vA = a.replace(/^v/, ''),
            vB = b.replace(/^v/, '');

        if (semver.valid(vA) && semver.valid(vB)) {
            return semver.rcompare(vA, vB)
        }

        return b.localeCompare(a, undefined, {numeric: true, sensitivity: 'base'})
    })
}

/**
 * Core logic to scan and index pull-request markdown files into the chunked surface.
 *
 * @param {Object} options Configuration options
 * @param {String} [options.inputDir] Directory containing active (unreleased) PR markdown files.
 * @param {String} [options.archiveDir] Directory containing archived (released) PR markdown files.
 * @param {String} [options.outputDir] Directory for chunked PR leaf JSON files.
 * @param {String} [options.dataDir] Portal data root the chunk `childrenUrl` values resolve against.
 * @param {String} [options.chunkedOutputFile] Path to the chunked root-index JSON file.
 * @param {String} [options.manifestFile] Path to the crawler manifest JSON file.
 * @returns {Promise<void>} Resolves when the JSON files are written.
 */
async function createPullRequestIndex(options = {}) {
    const
        inputDir          = options.inputDir          || PULLS_DIR,
        archiveDir        = options.archiveDir        || ARCHIVE_DIR,
        outputDir         = options.outputDir         || OUTPUT_DIR,
        dataDir           = options.dataDir           || DATA_DIR,
        chunkedOutputFile = options.chunkedOutputFile || CHUNKED_OUTPUT_FILE,
        manifestFile      = options.manifestFile      || MANIFEST_FILE;

    console.log(`Scanning pull requests in:\n- ${inputDir}\n- ${archiveDir}`);

    const activeFiles   = await fg('**/pr-*.md', {cwd: inputDir,   absolute: true});
    const archivedFiles = await fg('**/pr-*.md', {cwd: archiveDir, absolute: true});

    const allFiles = [
        ...activeFiles.map(filePath => ({filePath, isActive: true})),
        ...archivedFiles.map(filePath => ({filePath, isActive: false}))
    ];

    if (allFiles.length === 0) {
        console.warn('No pull-request files found.');
        return
    }

    console.log(`Found ${allFiles.length} total pull-request files.`);

    const pullsByGroup = new Map();

    await Promise.all(allFiles.map(async ({filePath, isActive}) => {
        let frontmatter = {};

        try {
            const parsed = matter(await fs.readFile(filePath, 'utf8'));
            frontmatter  = parsed.data
        } catch (e) {
            console.warn(`Failed to parse frontmatter for ${filePath}:`, e.message);
            return
        }

        if (!frontmatter.number || !frontmatter.title) {
            return
        }

        // Determine group: `Latest` for unreleased, else the release-version archive folder.
        let groupName;

        if (isActive) {
            groupName = ACTIVE_GROUP
        } else {
            groupName = path.relative(archiveDir, filePath).split(path.sep)[0]
        }

        const bucket = getSourceBucket(filePath, {archiveDir, inputDir, isActive});

        if (!pullsByGroup.has(groupName)) {
            pullsByGroup.set(groupName, [])
        }

        pullsByGroup.get(groupName).push({
            id      : String(frontmatter.number),
            parentId: groupName,
            title   : frontmatter.title,
            // Internal sort/bucket keys (stripped before write).
            _mergedAt : frontmatter.mergedAt,
            _closedAt : frontmatter.closedAt,
            _updatedAt: frontmatter.updatedAt,
            _bucket   : bucket
        })
    }));

    const
        sortedGroups               = sortGroups(Array.from(pullsByGroup.keys())),
        pullCount                  = Array.from(pullsByGroup.values()).reduce((sum, group) => sum + group.length, 0),
        {rootIndex, chunks, idMap} = buildChunkedIndex(sortedGroups, pullsByGroup);

    console.log(`Indexed ${pullCount} pull requests in ${sortedGroups.length} groups.`);

    await fs.emptyDir(outputDir);

    for (const chunk of chunks.values()) {
        const target = path.join(dataDir, chunk.childrenUrl);

        chunk.records.sort((a, b) => parseInt(b.id) - parseInt(a.id));

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

    console.log(`Chunked pull-request root index written to ${chunkedOutputFile}`);
    console.log(`Chunked pull-request leaf files written to ${outputDir}`);
    console.log(`Pull-request crawler manifest written to ${manifestFile}`);
    console.log(`Pull-request id map written to ${path.join(outputDir, 'idMap.json')}`)
}

/**
 * CLI entry point for the script.
 */
async function runCli() {
    const program = new Command();

    program
        .name('create-pull-request-index')
        .description('Generates a hierarchical JSON index of pull requests.')
        .option('-i, --input <path>',   'Active pull requests directory path', sanitizeInput)
        .option('-a, --archive <path>', 'Archive pull requests directory path', sanitizeInput)
        .option('-d, --output-dir <path>', 'Output chunk directory path', sanitizeInput)
        .option('-c, --chunked-output <path>', 'Chunked root-index output file path', sanitizeInput)
        .option('-m, --manifest <path>', 'Crawler manifest output file path', sanitizeInput);

    program.parse(process.argv);

    const opts = program.opts();

    await createPullRequestIndex({
        inputDir         : opts.input         ? path.resolve(ROOT_DIR, opts.input)         : undefined,
        archiveDir       : opts.archive       ? path.resolve(ROOT_DIR, opts.archive)       : undefined,
        outputDir        : opts.outputDir     ? path.resolve(ROOT_DIR, opts.outputDir)     : undefined,
        chunkedOutputFile: opts.chunkedOutput ? path.resolve(ROOT_DIR, opts.chunkedOutput) : undefined,
        manifestFile     : opts.manifest      ? path.resolve(ROOT_DIR, opts.manifest)      : undefined
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
