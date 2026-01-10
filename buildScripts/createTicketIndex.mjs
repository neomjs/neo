import fs              from 'fs-extra';
import path            from 'path';
import {Command}       from 'commander/esm.mjs';
import {fileURLToPath} from 'url';
import fg              from 'fast-glob';
import matter          from 'gray-matter';
import semver          from 'semver';
import {sanitizeInput} from './util/Sanitizer.mjs';

const ROOT_DIR    = process.cwd();
const ISSUES_DIR  = path.resolve(ROOT_DIR, 'resources/content/issues');
const ARCHIVE_DIR = path.resolve(ROOT_DIR, 'resources/content/issue-archive');
const OUTPUT_FILE = path.resolve(ROOT_DIR, 'apps/portal/resources/data/tickets.json');

// Labels to include (case-insensitive check)
const INCLUDE_LABELS = new Set(['bug', 'feature', 'enhancement', 'documentation', 'epic', 'architecture', 'refactoring']);
// Labels to exclude (unless an include label is present)
const EXCLUDE_LABELS = new Set(['chore', 'task', 'agent-task']);

/**
 * Scans the issues and issue-archive directories and generates a hierarchical JSON index.
 * @param {Object} options
 * @param {String} options.issuesDir - Directory containing active markdown tickets
 * @param {String} options.archiveDir - Directory containing archived markdown tickets (versioned folders)
 * @param {String} options.outputFile - Path to the output JSON file
 * @returns {Promise<void>}
 */
async function createTicketIndex(options = {}) {
    const issuesDir  = options.issuesDir  || ISSUES_DIR;
    const archiveDir = options.archiveDir || ARCHIVE_DIR;
    const outputFile = options.outputFile || OUTPUT_FILE;

    console.log(`Scanning tickets in:\n- ${issuesDir}\n- ${archiveDir}`);

    // 1. Find all markdown files
    const activeFiles   = await fg('*.md',    { cwd: issuesDir,  absolute: true });
    const archivedFiles = await fg('**/*.md', { cwd: archiveDir, absolute: true });

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
        const labels = Array.isArray(frontmatter.labels) ? frontmatter.labels.map(l => (l.name || l).toLowerCase()) : [];
        const hasIncludeLabel = labels.some(l => INCLUDE_LABELS.has(l));
        const hasExcludeLabel = labels.some(l => EXCLUDE_LABELS.has(l));
        
        let shouldKeep = true;
        if (hasExcludeLabel && !hasIncludeLabel) {
            shouldKeep = false;
        }
        if (!shouldKeep) {
            return;
        }

        // Determine Group (Version or Latest)
        let groupName;
        if (fileInfo.isActive) {
            groupName = 'Latest';
        } else {
            // path/to/archive/v11.19.1/issue-123.md -> v11.19.1
            const parentDir = path.basename(path.dirname(filePath));
            groupName = parentDir;
        }

        // Construct path relative to repo root
        const relativePath = path.relative(ROOT_DIR, filePath);
        const ticketId     = String(frontmatter.id);

        const ticketData = {
            id      : ticketId,
            parentId: groupName,
            title   : frontmatter.title,
            path    : relativePath,
            // Internal sorting keys (removed before write)
            _closedAt : frontmatter.closedAt,
            _updatedAt: frontmatter.updatedAt
        };

        if (!ticketsByGroup.has(groupName)) {
            ticketsByGroup.set(groupName, []);
        }
        ticketsByGroup.get(groupName).push(ticketData);
    }));

    // Sort Groups
    // 'Latest' first, then versions descending (using semver)
    const sortedGroups = Array.from(ticketsByGroup.keys()).sort((a, b) => {
        if (a === 'Latest') return -1;
        if (b === 'Latest') return 1;

        // Clean versions for semver comparison
        const vA = a.replace(/^v/, '');
        const vB = b.replace(/^v/, '');

        if (semver.valid(vA) && semver.valid(vB)) {
            return semver.rcompare(vA, vB);
        }
        return b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });
    });

    const flatTree = [];

    sortedGroups.forEach((groupName, index) => {
        // Create Parent Node
        const isFirst = index === 0;
        
        const parentNode = {
            id       : groupName,
            isLeaf   : false,
            parentId : null,
            collapsed: !isFirst // Expand first, collapse rest
        };

        flatTree.push(parentNode);

        // Sort Tickets within Group
        // Priority: closedAt DESC -> updatedAt DESC -> id DESC
        const tickets = ticketsByGroup.get(groupName);
        tickets.sort((a, b) => {
            const dateA = a._closedAt || a._updatedAt || 0;
            const dateB = b._closedAt || b._updatedAt || 0;
            
            if (dateA !== dateB) {
                return new Date(dateB) - new Date(dateA);
            }
            return parseInt(b.id) - parseInt(a.id);
        });

        // Add Tickets to Tree (Cleanup internal keys)
        tickets.forEach(t => {
            delete t._closedAt;
            delete t._updatedAt;
            flatTree.push(t);
        });
    });

    console.log(`Filtered down to ${flatTree.length - sortedGroups.length} tickets in ${sortedGroups.length} groups.`);

    await fs.ensureDir(path.dirname(outputFile));
    await fs.writeJSON(outputFile, flatTree);
    
    console.log(`Ticket index written to ${outputFile}`);
}

async function runCli() {
    const program = new Command();

    program
        .name('create-ticket-index')
        .description('Generates a hierarchical JSON index of tickets.')
        .option('-i, --issues <path>',  'Active issues directory path', sanitizeInput)
        .option('-a, --archive <path>', 'Archive directory path', sanitizeInput)
        .option('-o, --output <path>',  'Output file path',     sanitizeInput);

    program.parse(process.argv);

    const opts = program.opts();

    await createTicketIndex({
        issuesDir : opts.issues  ? path.resolve(ROOT_DIR, opts.issues)  : undefined,
        archiveDir: opts.archive ? path.resolve(ROOT_DIR, opts.archive) : undefined,
        outputFile: opts.output  ? path.resolve(ROOT_DIR, opts.output)  : undefined
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
