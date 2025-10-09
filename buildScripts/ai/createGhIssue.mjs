import fs                          from 'fs';
import {promises as fsp}           from 'fs';
import os                          from 'os';
import path                        from 'path';
import {spawnSync}                 from 'child_process';
import { Command }                 from 'commander/esm.mjs';
import {
    extractFrontmatter,
    resolveTitle,
    prepareBodyForIssue,
    updateIssueMetadata,
    buildRenamedFileName,
    ensureTrailingNewline,
    extractIssueUrl,
    extractIssueNumber
} from './util/ticketUtils.mjs';

/**
 * @summary Automates GitHub issue creation from local ticket markdown files.
 *
 * This script extracts the metadata from a local ticket, creates the matching GitHub issue via
 * the GitHub CLI, and then updates the ticket file to reference the new issue. It supports
 * both YAML frontmatter and legacy heading-based tickets used throughout the repository.
 *
 * @see .github/ISSUE/gh-automate-github-issue-creation.md
 */
const program = new Command();

program
    .name('neo-ai-create-gh-issue')
    .argument('<ticketPath>', 'Path to the local markdown ticket file')
    .option('-r, --repo <value>', 'Optional GitHub repository in owner/name format')
    .parse(process.argv);

const [ticketPath] = program.args;
const options = program.opts();

if (!ticketPath) {
    console.error('A ticket file path is required.');
    process.exit(1);
}

(async function createGhIssue() {
    const absoluteTicketPath = path.resolve(process.cwd(), ticketPath);

    if (!fs.existsSync(absoluteTicketPath)) {
        throw new Error(`Ticket file not found: ${absoluteTicketPath}`);
    }

    const originalContent = await fsp.readFile(absoluteTicketPath, 'utf8');
    const {frontmatterBlock, frontmatterData, bodyContent} = extractFrontmatter(originalContent);
    const title = resolveTitle(frontmatterData, bodyContent);

    console.log(`Creating GitHub issue for "${title}"`);

    const cleanedBody = prepareBodyForIssue(bodyContent);

    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'neo-gh-issue-'));
    const bodyFilePath = path.join(tempDir, 'issue-body.md');

    try {
        await fsp.writeFile(bodyFilePath, cleanedBody || 'No additional details provided.', 'utf8');

        const ghArgs = ['issue', 'create', '--title', title, '--body-file', bodyFilePath];

        if (options.repo) {
            ghArgs.push('--repo', options.repo);
        }

        const ghResult = spawnSync('gh', ghArgs, {encoding: 'utf8'});

        if (ghResult.error) {
            throw ghResult.error;
        }

        if (ghResult.status !== 0) {
            const stderr = ghResult.stderr?.trim();
            throw new Error(stderr || 'Failed to create GitHub issue.');
        }

        const issueUrl = extractIssueUrl(ghResult.stdout, ghResult.stderr);
        const issueNumber = extractIssueNumber(issueUrl, ghResult.stdout, ghResult.stderr);

        console.log(`Created GitHub issue #${issueNumber}: ${issueUrl}`);

        const updatedBody = updateIssueMetadata(frontmatterBlock, bodyContent, issueNumber, issueUrl);
        const updatedContent = ensureTrailingNewline(updatedBody);

        const fileDir = path.dirname(absoluteTicketPath);
        const newFileName = buildRenamedFileName(issueNumber, title);
        const newFilePath = path.join(fileDir, newFileName);

        await fsp.writeFile(absoluteTicketPath, updatedContent, 'utf8');

        if (!pathsEqual(absoluteTicketPath, newFilePath)) {
            if (fs.existsSync(newFilePath)) {
                throw new Error(`Cannot rename ticket: target file already exists: ${newFilePath}`);
            }

            await fsp.rename(absoluteTicketPath, newFilePath);
            console.log(`Renamed ticket to ${newFileName}`);
        }
    } finally {
        await fsp.rm(tempDir, {recursive: true, force: true});
    }
})().catch(err => {
    console.error('Error creating GitHub issue:', err.message || err);
    process.exit(1);
});


function pathsEqual(a, b) {
    return path.resolve(a) === path.resolve(b);
}
