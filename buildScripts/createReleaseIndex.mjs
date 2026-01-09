import fs              from 'fs-extra';
import path            from 'path';
import {Command}       from 'commander/esm.mjs';
import {fileURLToPath} from 'url';
import fg              from 'fast-glob';
import matter          from 'gray-matter';
import semver          from 'semver';
import {sanitizeInput} from './util/Sanitizer.mjs';

const ROOT_DIR      = process.cwd();
const RELEASE_DIR   = path.resolve(ROOT_DIR, 'resources/content/release-notes');
const OUTPUT_FILE   = path.resolve(ROOT_DIR, 'apps/portal/resources/data/releases.json');

/**
 * Parsed release note object
 * @typedef {Object} ReleaseNote
 * @property {String} version - The semantic version string (e.g., "11.18.0")
 * @property {String} date - ISO date string
 * @property {String} title - The display title of the release
 * @property {String} path - Relative path to the markdown file (for dynamic loading)
 */

/**
 * Scans the release notes directory and generates a JSON index.
 * @param {Object} options
 * @param {String} options.inputDir - Directory containing markdown release notes
 * @param {String} options.outputFile - Path to the output JSON file
 * @returns {Promise<void>}
 */
async function createReleaseIndex(options = {}) {
    const inputDir   = options.inputDir || RELEASE_DIR;
    const outputFile = options.outputFile || OUTPUT_FILE;

    console.log(`Scanning release notes in: ${inputDir}`);

    // Find all markdown files
    const files = await fg('*.md', { cwd: inputDir, absolute: true });

    if (files.length === 0) {
        console.warn('No release note files found.');
        return;
    }
    
    const releases = await Promise.all(files.map(async (filePath) => {
        const content  = await fs.readFile(filePath, 'utf8');
        const fileName = path.basename(filePath, '.md'); // e.g., 'v11.18.0'
        
        let frontmatter = {};
        let bodyContent = content;

        try {
            const parsed = matter(content);
            frontmatter  = parsed.data;
            bodyContent  = parsed.content;
        } catch (e) {
            console.warn(`Failed to parse frontmatter for ${fileName}:`, e.message);
        }
        
        // Extract Title (Priority: frontmatter.name -> First H1 -> filename)
        let title = frontmatter.name;
        if (!title) {
            const titleMatch = bodyContent.match(/^#\s+(.+)$/m);
            title = titleMatch ? titleMatch[1].trim() : fileName;
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
            date   : date,
            title  : title,
            path   : `resources/content/release-notes/${path.basename(filePath)}`
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
    await fs.writeJSON(outputFile, treeData, { spaces: 4 });
    
    console.log(`Release index written to ${outputFile}`);
}

async function runCli() {
    const program = new Command();

    program
        .name('create-release-index')
        .description('Generates a JSON index of release notes from markdown files.')
        .option('-i, --input <path>',  'Input directory path', sanitizeInput)
        .option('-o, --output <path>', 'Output file path',     sanitizeInput);

    program.parse(process.argv);

    const opts = program.opts();

    await createReleaseIndex({
        inputDir  : opts.input ? path.resolve(ROOT_DIR, opts.input) : undefined,
        outputFile: opts.output ? path.resolve(ROOT_DIR, opts.output) : undefined
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

export default createReleaseIndex;
