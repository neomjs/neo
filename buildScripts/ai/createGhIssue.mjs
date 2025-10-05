import fs                          from 'fs';
import {promises as fsp}           from 'fs';
import os                          from 'os';
import path                        from 'path';
import {spawnSync}                 from 'child_process';
import {Command}                   from 'commander/esm.mjs';

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
    .version(process.env.npm_package_version)
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

        const updatedBody = prependIssueMetadata(frontmatterBlock, bodyContent, issueNumber, issueUrl);
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

function extractFrontmatter(content) {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
    const match = content.match(frontmatterRegex);

    if (!match) {
        return {
            frontmatterBlock: '',
            frontmatterData : {},
            bodyContent     : content
        };
    }

    const frontmatterRaw = match[1];
    const data = {};

    frontmatterRaw.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith('#')) {
            return;
        }

        const separatorIndex = trimmed.indexOf(':');

        if (separatorIndex === -1) {
            return;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        let value = trimmed.slice(separatorIndex + 1).trim();

        const firstChar = value.at(0);
        const lastChar = value.at(-1);

        if ((firstChar === '"' && lastChar === '"') || (firstChar === "'" && lastChar === "'")) {
            value = value.slice(1, -1);
        }

        if (value.includes(',')) {
            data[key] = value.split(',').map(entry => entry.trim());
        } else {
            data[key] = value;
        }
    });

    const frontmatterBlock = match[0].replace(/\s*$/, '\n\n');
    const bodyContent = content.slice(match[0].length);

    return {frontmatterBlock, frontmatterData: data, bodyContent};
}

function resolveTitle(frontmatterData, bodyContent) {
    const fromFrontmatter = typeof frontmatterData.title === 'string'
        ? frontmatterData.title.trim()
        : Array.isArray(frontmatterData.title) ? frontmatterData.title.join(' ').trim() : '';

    if (fromFrontmatter) {
        return fromFrontmatter;
    }

    const ticketHeaderMatch = bodyContent.match(/^#\s+Ticket:\s*(.+)$/m);

    if (ticketHeaderMatch) {
        return ticketHeaderMatch[1].trim();
    }

    const genericHeaderMatch = bodyContent.match(/^#\s+(.+)$/m);

    if (genericHeaderMatch) {
        return genericHeaderMatch[1].trim();
    }

    throw new Error('Unable to resolve ticket title from frontmatter or markdown headings.');
}

function prepareBodyForIssue(bodyContent) {
    const withoutIssueHeader = bodyContent.replace(/^(# GitHub Issue:.*\r?\n# https?:\/\/[^\r\n]+\r?\n\r?\n)/, '');

    return withoutIssueHeader.trimStart();
}

function extractIssueUrl(stdout, stderr) {
    const combined = `${stdout ?? ''}\n${stderr ?? ''}`;
    const urlMatch = combined.match(/https?:\/\/[^\s]+/);

    if (!urlMatch) {
        throw new Error('GitHub CLI output did not contain an issue URL.');
    }

    return urlMatch[0];
}

function extractIssueNumber(issueUrl, stdout, stderr) {
    const numberFromUrl = issueUrl.match(/\/issues\/(\d+)/);

    if (numberFromUrl) {
        return numberFromUrl[1];
    }

    const combined = `${stdout ?? ''}\n${stderr ?? ''}`;
    const inlineMatch = combined.match(/#(\d+)/);

    if (inlineMatch) {
        return inlineMatch[1];
    }

    throw new Error('Unable to determine issue number from GitHub CLI output.');
}

function prependIssueMetadata(frontmatterBlock, bodyContent, issueNumber, issueUrl) {
    const cleanedBody = prepareBodyForIssue(bodyContent);
    const metadata = `# GitHub Issue: #${issueNumber}\n# ${issueUrl}\n\n`;

    return `${frontmatterBlock}${metadata}${cleanedBody}`;
}

function buildRenamedFileName(issueNumber, title) {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120) || 'ticket';

    return `gh${issueNumber}-${slug}.md`;
}

function ensureTrailingNewline(content) {
    return content.endsWith('\n') ? content : `${content}\n`;
}

function pathsEqual(a, b) {
    return path.resolve(a) === path.resolve(b);
}
