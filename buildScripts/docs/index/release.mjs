import fs              from 'fs-extra';
import path            from 'path';
import {Command}       from 'commander';
import fg              from 'fast-glob';
import matter          from 'gray-matter';
import semver          from 'semver';
import isEntryModule   from '../../util/isEntryModule.mjs';
import {sanitizeInput} from '../../util/sanitizer.mjs';
import {
    contentPath,
    requireContentRoot
} from '../../util/contentRoot.mjs';

/**
 * @module buildScripts.createReleaseIndex
 * @summary Generates a hierarchical JSON index of Release Notes for the Neo.mjs Portal application.
 *
 * This script scans the markdown release notes under the declared release-notes root (`--release-notes`; in an
 * engine checkout the engine's own `.github/RELEASE_NOTES`) and constructs a structured JSON index
 * (`releases.json`). This index is consumed by the Portal's "Release Notes"
 * section, allowing users to browse history grouped by Major Version.
 *
 * **Key Features:**
 * - **Metadata Extraction:** Parses frontmatter (`tagName`, `publishedAt`) but falls back to file stats/names if needed.
 * - **SemVer Grouping:** Automatically groups releases by Major Version (e.g., "v5", "v6") using `semver`.
 * - **Tree-Ready Output:** Generates a flat-tree structure with `parentId` references, optimized for `Neo.tree.List`.
 *
 * @see apps/portal/view/release/MainContainer.mjs
 * @see buildScripts/createTicketIndex.mjs
 * @keywords portal, releases, changelog, semver, build-script, knowledge-base
 */

const ROOT_DIR    = process.cwd();
const OUTPUT_FILE = path.resolve(ROOT_DIR, 'apps/portal/resources/data/releases.json');

/**
 * Parsed release note object
 * @typedef {Object} ReleaseNote
 * @property {String} version - The semantic version string (e.g., "11.18.0")
 * @property {String} date - ISO date string
 * @property {String} title - The display title of the release
 * @property {String} path - Path to the markdown file relative to the release-notes root (for dynamic loading)
 */

/**
 * Core logic to scan and index release note markdown files.
 *
 * 1.  Recursively scans the release-notes root, including any chunk-N folders.
 * 2.  Extracts version numbers and dates (handling both frontmatter and filesystem fallbacks).
 * 3.  Groups releases into Major Version buckets (e.g., "v1", "v2").
 * 4.  Sorts majors and minors descending.
 * 5.  Flattens the structure for `Neo.data.Store` consumption.
 *
 * @param {Object} options Configuration options
 * @param {String} options.releaseNotesRoot - Directory containing the markdown release notes; required, the index's paths are relative to it
 * @param {String} [options.outputFile] - Path to the output JSON file (defaults to `apps/portal/resources/data/releases.json`)
 * @returns {Promise<void>} Resolves when the JSON file is written
 */
async function createReleaseIndex(options = {}) {
    const inputDir   = requireContentRoot(options.releaseNotesRoot, '--release-notes', 'createReleaseIndex');
    const outputFile = options.outputFile || OUTPUT_FILE;

    console.log(`Scanning release notes in: ${inputDir}`);

    // Find all markdown files recursively, including release notes under chunk-N/.
    const files = await fg('**/*.md', { cwd: inputDir, absolute: true });

    if (files.length === 0) {
        console.warn('No release note files found.');
        return;
    }

    const releases = await Promise.all(files.map(async (filePath) => {
        const content  = await fs.readFile(filePath, 'utf8');
        const fileName = path.basename(filePath, '.md'); // e.g., 'v11.18.0'

        let frontmatter = {};

        try {
            const parsed = matter(content);
            frontmatter  = parsed.data;
        } catch (e) {
            console.warn(`Failed to parse frontmatter for ${fileName}:`, e.message);
        }

        // Extract Date (Priority: frontmatter.publishedAt -> file stats)
        let date = frontmatter.publishedAt;
        if (!date) {
            const stats = await fs.stat(filePath);
            date = stats.birthtime.toISOString();
        }

        // Extract Version (Priority: frontmatter.tagName -> filename)
        let version = frontmatter.tagName;
        if (!version) {
            version = fileName.replace(/^v/, ''); // Remove 'v' prefix if present in filename
        }

        // Clean version for sorting (handle 'v' prefix if it crept in)
        const cleanVersion = version.replace(/^v/, '');

        return {
            version: cleanVersion,
            date,
            // Relative to the release-notes root, chunk-N segment included; the portal resolves it against the base it serves the notes from
            path: contentPath(inputDir, filePath)
        };
    }));

    // Sort by version (descending)
    releases.sort((a, b) => {
        // Use semver if valid, otherwise fallback to localeCompare
        if (semver.valid(a.version) && semver.valid(b.version)) {
            return semver.rcompare(a.version, b.version);
        }
        // Fallback for non-semver strings
        return b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' });
    });

    const treeData      = [],
          majorVersions = new Map();

    releases.forEach(release => {
        const
            version     = release.version,
            validSemver = semver.valid(version),
            major       = validSemver ? semver.major(version) : 'Other',
            parentId    = `v${major}`;

        if (!majorVersions.has(major)) {
            majorVersions.set(major, {
                children : [], // Temp storage
                collapsed: true, // Default to collapsed
                id       : parentId,
                isLeaf   : false,
                parentId : null
            });
        }

        // Add tree fields to release
        release.id       = version;
        // release.isLeaf = true; // Default value in model is true
        release.parentId = parentId;

        delete release.version;

        majorVersions.get(major).children.push(release);
    });

    // Convert Map to Array and sort Major versions (descending)
    // If keys are numbers, b - a. If 'Other', handle it.
    const sortedMajors = Array.from(majorVersions.values()).sort((a, b) => {
        const
            aMajor = parseInt(a.id.replace('v', '')),
            bMajor = parseInt(b.id.replace('v', ''));

        if (isNaN(aMajor)) return 1;
        if (isNaN(bMajor)) return -1;

        return bMajor - aMajor;
    });

    // Flatten logic
    sortedMajors.forEach((majorNode, index) => {
        // Expand the latest major version (first one)
        if (index === 0) {
            majorNode.collapsed = false;
        }

        // Add parent node
        treeData.push({
            collapsed: majorNode.collapsed,
            id       : majorNode.id,
            isLeaf   : majorNode.isLeaf,
            parentId : majorNode.parentId
        });

        // Add children (already sorted from previous step)
        treeData.push(...majorNode.children);
    });

    console.log(`Found ${releases.length} releases.`);

    await fs.ensureDir(path.dirname(outputFile));
    await fs.writeJSON(outputFile, treeData);

    console.log(`Release index written to ${outputFile}`);
}

/**
 * CLI entry point for the script.
 * Handles argument parsing using `commander` and invokes the main `createReleaseIndex` function.
 *
 * Supported flags:
 * - `-r, --release-notes <path>`: The release-notes root (required)
 * - `-o, --output <path>`: Custom output file path
 */
async function runCli() {
    const program = new Command();

    program
        .name('create-release-index')
        .description('Generates a JSON index of release notes from markdown files.')
        .requiredOption('-r, --release-notes <path>', 'Release-notes root', sanitizeInput)
        .option('-o, --output <path>', 'Output file path',     sanitizeInput);

    program.parse(process.argv);

    const opts = program.opts();

    await createReleaseIndex({
        releaseNotesRoot: path.resolve(opts.releaseNotes),
        outputFile      : opts.output ? path.resolve(ROOT_DIR, opts.output) : undefined
    });
}

if (isEntryModule(import.meta.url)) {
    runCli().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

export default createReleaseIndex;
