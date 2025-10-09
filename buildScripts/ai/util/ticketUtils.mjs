/**
 * @summary Shared utility functions for GitHub issue and ticket management.
 *
 * This module contains common functions used by both createGhIssue.mjs and syncGhIssuesToLocal.mjs
 * to ensure consistent file formatting and metadata handling across all ticket operations.
 */

/**
 * Extracts frontmatter from markdown content and returns parsed data.
 * @param {string} content - The markdown content to parse
 * @returns {Object} Object containing frontmatterBlock, frontmatterData, and bodyContent
 */
export function extractFrontmatter(content) {
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

/**
 * Resolves the title from frontmatter data or markdown content.
 * @param {Object} frontmatterData - Parsed frontmatter data
 * @param {string} bodyContent - The markdown body content
 * @returns {string} The resolved title
 */
export function resolveTitle(frontmatterData, bodyContent) {
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

/**
 * Prepares body content for GitHub issue creation by removing existing issue headers.
 * @param {string} bodyContent - The markdown body content
 * @returns {string} Cleaned body content
 */
export function prepareBodyForIssue(bodyContent) {
    const withoutIssueHeader = bodyContent.replace(/^(# GitHub Issue:.*\r?\n# https?:\/\/[^\r\n]+\r?\n\r?\n)/, '');

    return withoutIssueHeader.trimStart();
}

/**
 * Updates issue metadata in the content, either replacing placeholder or prepending.
 * @param {string} frontmatterBlock - The frontmatter block
 * @param {string} bodyContent - The markdown body content
 * @param {string} issueNumber - The GitHub issue number
 * @param {string} issueUrl - The GitHub issue URL
 * @returns {string} Updated content with issue metadata
 */
export function updateIssueMetadata(frontmatterBlock, bodyContent, issueNumber, issueUrl) {
    const placeholderRegex = /GH ticket id: #\d+/;
    const cleanedBody = prepareBodyForIssue(bodyContent);

    if (placeholderRegex.test(cleanedBody)) {
        const replacementText = `GH ticket id: #${issueNumber}\nGH ticket url: ${issueUrl}`;
        const updatedBodyContent = cleanedBody.replace(placeholderRegex, replacementText);
        return `${frontmatterBlock}${updatedBodyContent}`;
    }

    // Fallback to prepending if the placeholder is not found
    const metadata = `# GitHub Issue: #${issueNumber}\n# ${issueUrl}\n\n`;
    return `${frontmatterBlock}${metadata}${cleanedBody}`;
}

/**
 * Builds a filename for a GitHub issue ticket.
 * @param {string} issueNumber - The GitHub issue number
 * @param {string} title - The issue title
 * @returns {string} The formatted filename
 */
export function buildRenamedFileName(issueNumber, title) {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120) || 'ticket';

    return `gh${issueNumber}-${slug}.md`;
}

/**
 * Ensures content ends with a trailing newline.
 * @param {string} content - The content to process
 * @returns {string} Content with trailing newline
 */
export function ensureTrailingNewline(content) {
    return content.endsWith('\n') ? content : `${content}\n`;
}

/**
 * Extracts issue URL from GitHub CLI output.
 * @param {string} stdout - Standard output from GitHub CLI
 * @param {string} stderr - Standard error from GitHub CLI
 * @returns {string} The extracted issue URL
 */
export function extractIssueUrl(stdout, stderr) {
    const combined = `${stdout ?? ''}\n${stderr ?? ''}`;
    const urlMatch = combined.match(/https?:\/\/[^\s]+/);

    if (!urlMatch) {
        throw new Error('GitHub CLI output did not contain an issue URL.');
    }

    return urlMatch[0];
}

/**
 * Extracts issue number from GitHub CLI output or URL.
 * @param {string} issueUrl - The GitHub issue URL
 * @param {string} stdout - Standard output from GitHub CLI
 * @param {string} stderr - Standard error from GitHub CLI
 * @returns {string} The extracted issue number
 */
export function extractIssueNumber(issueUrl, stdout, stderr) {
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

/**
 * Creates a new ticket file content from GitHub issue data.
 * @param {string} issueNumber - The GitHub issue number
 * @param {string} issueUrl - The GitHub issue URL
 * @param {string} title - The issue title
 * @param {string} body - The issue body
 * @returns {string} Formatted markdown content for the ticket file
 */
export function createTicketContent(issueNumber, issueUrl, title, body) {
    const metadata = `# GitHub Issue: #${issueNumber}\n# ${issueUrl}\n\n`;
    const content = `${metadata}${body || 'No additional details provided.'}`;
    return ensureTrailingNewline(content);
}

/**
 * Builds a filename for a new GitHub issue ticket (for sync operations).
 * @param {string} issueNumber - The GitHub issue number
 * @param {string} title - The issue title
 * @returns {string} The formatted filename
 */
export function buildNewTicketFileName(issueNumber, title) {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120) || 'ticket';

    return `gh-${issueNumber}-${slug}.md`;
}
