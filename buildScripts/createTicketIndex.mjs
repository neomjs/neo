import fs              from 'fs-extra';
import path            from 'path';
import {Command}       from 'commander/esm.mjs';
import {fileURLToPath} from 'url';
import fg              from 'fast-glob';
import matter          from 'gray-matter';
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
 * Scans the issues and issue-archive directories and generates a JSON index.
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

    const tickets = [];

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
            // Some very old files might lack frontmatter or use a different format. 
            // We skip them to maintain index quality.
            return;
        }

        // Filtering Logic
        const labels = Array.isArray(frontmatter.labels) ? frontmatter.labels.map(l => (l.name || l).toLowerCase()) : [];
        
        const hasIncludeLabel = labels.some(l => INCLUDE_LABELS.has(l));
        const hasExcludeLabel = labels.some(l => EXCLUDE_LABELS.has(l));

        // Strategy: 
        // 1. If it has an EXCLUDE label, we only keep it if it ALSO has an INCLUDE label.
        //    (e.g., 'chore' + 'refactoring' might be interesting, but plain 'chore' is noise).
        // 2. If it has neither, we probably keep it (default inclusion) or strictly require an include label.
        //    Let's be permissive by default but filter out pure chores.
        
        let shouldKeep = true;

        if (hasExcludeLabel && !hasIncludeLabel) {
            shouldKeep = false;
        }

        // Optional: Strict mode (must have at least one valid label). 
        // For now, let's stick to the exclusion rule.

        if (!shouldKeep) {
            return;
        }

        // Construct path relative to repo root (for dynamic loading)
        // We assume the app will load these via fetch, so we need the relative path from the server root
        const relativePath = path.relative(ROOT_DIR, filePath);

        tickets.push({
            id         : String(frontmatter.id), // Ensure string ID
            title      : frontmatter.title,
            state      : frontmatter.state,
            labels     : frontmatter.labels || [], // Keep original casing/structure
            assignees  : frontmatter.assignees || [],
            author     : frontmatter.author || null,
            createdAt  : frontmatter.createdAt,
            updatedAt  : frontmatter.updatedAt,
            closedAt   : frontmatter.closedAt,
            version    : !fileInfo.isActive ? path.basename(path.dirname(filePath)) : null, // Extract version from folder name if archived
            path       : relativePath
        });
    }));

    // Sort by ID (descending) - Newest tickets first
    tickets.sort((a, b) => parseInt(b.id) - parseInt(a.id));

    console.log(`Filtered down to ${tickets.length} indexable tickets.`);

    await fs.ensureDir(path.dirname(outputFile));
    await fs.writeJSON(outputFile, tickets, { spaces: 0 }); // Compact JSON for network performance? Or 4 for readability?
    // Releases.json uses 4 spaces. Let's use 0 to save bytes for the big list, 
    // unless the user specifically wants it readable. 
    // Given the prompt "explore... resources/data/releases.json", which is pretty printed...
    // I'll stick to 0 (minified) for now as this file could get large (hundreds of tickets).
    // Wait, releases.json is pretty printed. Let's do 4 to be consistent with the project style unless file size is an issue.
    // 388 tickets is not that big. 
    
    // Actually, let's check the previous read of releases.json. It was pretty printed.
    await fs.writeJSON(outputFile, tickets, { spaces: 4 });
    
    console.log(`Ticket index written to ${outputFile}`);
}

async function runCli() {
    const program = new Command();

    program
        .name('create-ticket-index')
        .description('Generates a JSON index of tickets from markdown files.')
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
