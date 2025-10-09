import fs                          from 'fs';
import {promises as fsp}           from 'fs';
import path                        from 'path';
import {spawnSync}                 from 'child_process';
import { Command }                 from 'commander/esm.mjs';
import {
    createTicketContent,
    buildNewTicketFileName
} from './util/ticketUtils.mjs';

/**
 * @summary Syncs GitHub issues to local markdown files.
 *
 * This script finds GitHub issues that don't have corresponding local markdown files
 * and creates them to keep the local .github/ISSUE/ directory in sync with GitHub.
 * It uses the same formatting logic as createGhIssue.mjs to ensure consistency.
 *
 * @see .github/ISSUE/ticket-sync-gh-issues-to-local.md
 */
const program = new Command();

program
    .name('neo-ai-sync-gh-issues-to-local')
    .option('-r, --repo <value>', 'Optional GitHub repository in owner/name format')
    .option('-d, --dry-run', 'Show what would be done without making changes')
    .option('-v, --verbose', 'Show detailed output')
    .parse(process.argv);

const options = program.opts();

(async function syncGhIssuesToLocal() {
    console.log('Syncing GitHub issues to local markdown files...\n');

    // Get list of GitHub issues
    const ghIssues = await getGitHubIssues(options.repo);
    console.log(`Found ${ghIssues.length} GitHub issues`);

    // Get list of local ticket files
    const localTickets = await getLocalTicketFiles();
    console.log(`Found ${localTickets.length} local ticket files`);

    // Find missing issues
    const missingIssues = findMissingIssues(ghIssues, localTickets);
    console.log(`Found ${missingIssues.length} GitHub issues without local files\n`);

    if (missingIssues.length === 0) {
        console.log('✅ All GitHub issues have corresponding local files. No sync needed.');
        return;
    }

    if (options.dryRun) {
        console.log('🔍 DRY RUN - Would create the following files:');
        missingIssues.forEach(issue => {
            const fileName = buildNewTicketFileName(issue.number, issue.title);
            console.log(`  - .github/ISSUE/${fileName} (Issue #${issue.number}: ${issue.title})`);
        });
        return;
    }

    // Create missing ticket files
    const issueDir = path.resolve(process.cwd(), '.github/ISSUE');
    let createdCount = 0;

    for (const issue of missingIssues) {
        try {
            const issueDetails = await getIssueDetails(issue.number, options.repo);
            const fileName = buildNewTicketFileName(issue.number, issue.title);
            const filePath = path.join(issueDir, fileName);

            if (fs.existsSync(filePath)) {
                console.log(`⚠️  Skipping issue #${issue.number}: file already exists (${fileName})`);
                continue;
            }

            const content = createTicketContent(
                issue.number,
                issueDetails.url,
                issue.title,
                issueDetails.body
            );

            await fsp.writeFile(filePath, content, 'utf8');
            console.log(`✅ Created: ${fileName} (Issue #${issue.number})`);
            createdCount++;

            if (options.verbose) {
                console.log(`   Title: ${issue.title}`);
                console.log(`   URL: ${issueDetails.url}`);
                console.log(`   Body length: ${issueDetails.body?.length || 0} characters\n`);
            }
        } catch (error) {
            console.error(`❌ Failed to create ticket for issue #${issue.number}:`, error.message);
        }
    }

    console.log(`\n🎉 Sync complete! Created ${createdCount} new ticket files.`);
})().catch(err => {
    console.error('Error syncing GitHub issues:', err.message || err);
    process.exit(1);
});

/**
 * Gets list of GitHub issues using gh CLI.
 * @param {string} repo - Optional repository in owner/name format
 * @returns {Promise<Array>} Array of issue objects with number and title
 */
async function getGitHubIssues(repo) {
    const ghArgs = ['issue', 'list', '--json', 'number,title,state'];
    
    if (repo) {
        ghArgs.push('--repo', repo);
    }

    const result = spawnSync('gh', ghArgs, {encoding: 'utf8'});

    if (result.error) {
        throw new Error(`Failed to run gh command: ${result.error.message}`);
    }

    if (result.status !== 0) {
        throw new Error(`gh command failed: ${result.stderr?.trim() || 'Unknown error'}`);
    }

    const issues = JSON.parse(result.stdout);
    
    // Filter out closed issues
    return issues.filter(issue => issue.state === 'OPEN');
}

/**
 * Gets list of local ticket files and extracts GitHub issue numbers.
 * @returns {Promise<Array>} Array of issue numbers found in local files
 */
async function getLocalTicketFiles() {
    const issueDir = path.resolve(process.cwd(), '.github/ISSUE');
    
    if (!fs.existsSync(issueDir)) {
        return [];
    }

    const files = fs.readdirSync(issueDir).filter(file => file.endsWith('.md'));
    const issueNumbers = [];

    for (const file of files) {
        const filePath = path.join(issueDir, file);
        const content = await fsp.readFile(filePath, 'utf8');
        
        // Look for GitHub issue references in the content
        const ghIssueMatch = content.match(/# GitHub Issue: #(\d+)/);
        if (ghIssueMatch) {
            issueNumbers.push(parseInt(ghIssueMatch[1], 10));
        }
    }

    return issueNumbers;
}

/**
 * Finds GitHub issues that don't have corresponding local files.
 * @param {Array} ghIssues - Array of GitHub issue objects
 * @param {Array} localIssueNumbers - Array of local issue numbers
 * @returns {Array} Array of missing GitHub issues
 */
function findMissingIssues(ghIssues, localIssueNumbers) {
    return ghIssues.filter(issue => !localIssueNumbers.includes(issue.number));
}

/**
 * Gets detailed information about a specific GitHub issue.
 * @param {number} issueNumber - The issue number
 * @param {string} repo - Optional repository in owner/name format
 * @returns {Promise<Object>} Issue details including URL and body
 */
async function getIssueDetails(issueNumber, repo) {
    const ghArgs = ['issue', 'view', issueNumber.toString(), '--json', 'url,body'];
    
    if (repo) {
        ghArgs.push('--repo', repo);
    }

    const result = spawnSync('gh', ghArgs, {encoding: 'utf8'});

    if (result.error) {
        throw new Error(`Failed to get issue details: ${result.error.message}`);
    }

    if (result.status !== 0) {
        throw new Error(`Failed to get issue #${issueNumber}: ${result.stderr?.trim() || 'Unknown error'}`);
    }

    const issueData = JSON.parse(result.stdout);
    
    return {
        url: issueData.url,
        body: issueData.body || ''
    };
}
