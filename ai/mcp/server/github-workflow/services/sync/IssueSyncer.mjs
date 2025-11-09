import aiConfig                                      from '../../config.mjs';
import Base                                          from '../../../../../../src/core/Base.mjs';
import crypto                                        from 'crypto';
import fs                                            from 'fs/promises';
import logger                                        from '../../logger.mjs';
import matter                                        from 'gray-matter';
import path                                          from 'path';
import GraphqlService                                from '../GraphqlService.mjs';
import ReleaseSyncer                                 from './ReleaseSyncer.mjs';
import {FETCH_ISSUES_FOR_SYNC, DEFAULT_QUERY_LIMITS} from '../queries/issueQueries.mjs';
import {GET_ISSUE_ID, UPDATE_ISSUE}                  from '../queries/mutations.mjs';

const issueSyncConfig = aiConfig.issueSync;

/**
 * Handles fetching, creating, and updating local issue files from GitHub.
 * @class Neo.ai.mcp.server.github-workflow.services.sync.IssueSyncer
 * @extends Neo.core.Base
 * @singleton
 */
class IssueSyncer extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.services.sync.IssueSyncer'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.services.sync.IssueSyncer',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Calculates a SHA-256 hash of the given content for change detection.
     * @param {string} content - The content to hash.
     * @returns {string} The hex-encoded hash.
     * @private
     */
    #calculateContentHash(content) {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Formats a GitHub issue and its comments into a single Markdown string with YAML frontmatter.
     * @param {object} issue - The GitHub issue object.
     * @param {object[]} comments - An array of comment objects associated with the issue.
     * @returns {string} The fully formatted Markdown string.
     * @private
     */
    #formatIssueMarkdown(issue, comments) {
        const frontmatter = {
            id                : issue.number,
            title             : issue.title,
            state             : issue.state,
            labels            : issue.labels.nodes.map(l => l.name),
            assignees         : issue.assignees.nodes.map(a => a.login),
            createdAt         : issue.createdAt,
            updatedAt         : issue.updatedAt,
            githubUrl         : issue.url,
            author            : issue.author.login,
            commentsCount     : comments.length,
            parentIssue       : issue.parent ? issue.parent.number : null,
            subIssues         : issue.subIssues?.nodes.map(sub => sub.number) || [],
            subIssuesCompleted: issue.subIssuesSummary?.completed || 0,
            subIssuesTotal    : issue.subIssuesSummary?.total || 0
        };

        if (issue.closedAt) {
            frontmatter.closedAt = issue.closedAt;
        }
        if (issue.milestone) {
            frontmatter.milestone = issue.milestone.title;
        }

        let body = `# ${issue.title}\n\n`;
        body += `**Reported by:** @${issue.author.login} on ${issue.createdAt.split('T')[0]}\n\n`;

        // Add relationship section with clear delimiter
        if (issue.parent || issue.subIssues?.nodes.length > 0) {
            body += '---\n\n';
            if (issue.parent) {
                body += `**Parent Issue:** #${issue.parent.number} - ${issue.parent.title}\n\n`;
            }
            if (issue.subIssues?.nodes.length > 0) {
                body += `**Sub-Issues:** ${issue.subIssues.nodes.map(s => `#${s.number}`).join(', ')}\n`;
                body += `**Progress:** ${issue.subIssuesSummary.completed}/${issue.subIssuesSummary.total} completed (${Math.round(issue.subIssuesSummary.percentCompleted)}%)\n\n`;
            }
            body += '---\n\n';
        }

        body += issue.body || '*(No description provided)*';
        body += '\n\n';

        if (comments.length > 0) {
            body += issueSyncConfig.commentSectionDelimiter + '\n\n';
            for (const comment of comments) {
                const date = comment.createdAt.split('T')[0];
                const time = comment.createdAt.split('T')[1].substring(0, 5);
                body += `### @${comment.author.login} - ${date} ${time}\n\n`;
                body += comment.body;
                body += '\n\n';
            }
        }

        return matter.stringify(body, frontmatter);
    }

    /**
     * Determines the correct local file path for a given issue based on its state (OPEN/CLOSED),
     * labels (dropped), and milestone or closed date (for archiving).
     * @param {object} issue - The GitHub issue object.
     * @returns {string|null} The absolute file path for the issue's Markdown file, or null if the issue should be dropped.
     * @private
     */
    #getIssuePath(issue) {
        const filename = `${issueSyncConfig.issueFilenamePrefix}${issue.number}.md`;

        // Handle both GraphQL (issue.labels.nodes) and potential direct array
        const labels = issue.labels?.nodes
            ? issue.labels.nodes.map(l => l.name.toLowerCase())
            : issue.labels?.map(l => l.name?.toLowerCase() || l.toLowerCase()) || [];

        const isDropped = issueSyncConfig.droppedLabels.some(label => labels.includes(label));
        if (isDropped) {
            return null; // Dropped issues are not stored locally.
        }

        // OPEN issues are always in the main directory
        if (issue.state === 'OPEN') {
            return path.join(issueSyncConfig.issuesDir, filename);
        }

        // Logic for CLOSED issues
        if (issue.state === 'CLOSED') {
            // If an issue has a milestone, it is explicitly archived under that version.
            if (issue.milestone?.title) {
                return path.join(issueSyncConfig.archiveDir, issue.milestone.title, filename);
            }

            // For issues without a milestone, find the earliest release that was published after it was closed.
            const closed = new Date(issue.closedAt);

            const release = (ReleaseSyncer.sortedReleases || []).find(r => new Date(r.publishedAt) > closed);

            // If a subsequent release exists, archive the issue under that release tag.
            if (release) {
                return path.join(issueSyncConfig.archiveDir, release.tagName, filename);
            }

            // If no subsequent release is found, the issue is recently closed and remains in the main issues directory.
            return path.join(issueSyncConfig.issuesDir, filename);
        }

        return null;
    }

    /**
     * Fetches all relevant issues from GitHub using GraphQL with automatic pagination.
     * This single query fetches issues WITH their comments and relationships in one go!
     * @param {object} metadata
     * @returns {Promise<{newMetadata: object, stats: object}>}
     */
    async pullFromGitHub(metadata) {
        logger.info('📥 Fetching issues from GitHub via GraphQL...');

        let allIssues   = [];
        let hasNextPage = true;
        let cursor      = null;
        let totalCost   = 0;
        const maxIssues = issueSyncConfig.maxIssues;

        // Paginate through all issues
        while (hasNextPage && allIssues.length < maxIssues) {
            const data = await GraphqlService.query(
                FETCH_ISSUES_FOR_SYNC,
                {
                    owner : aiConfig.owner,
                    repo  : aiConfig.repo,
                    limit : 100,
                    cursor,
                    states: ['OPEN', 'CLOSED'],
                    since : metadata.lastSync || issueSyncConfig.syncStartDate, // Use lastSync for delta updates
                    ...DEFAULT_QUERY_LIMITS
                },
                true // Enable sub-issues feature
            );

            const issues = data.repository.issues;
            allIssues.push(...issues.nodes);

            hasNextPage = issues.pageInfo.hasNextPage;
            cursor      = issues.pageInfo.endCursor;

            // Monitor rate limit usage
            totalCost += data.rateLimit.cost;
            logger.debug(`Fetched ${issues.nodes.length} issues (total: ${allIssues.length}, cost: ${totalCost}, remaining: ${data.rateLimit.remaining})`);

            // Safety check: If rate limit is getting low, warn
            if (data.rateLimit.remaining < 500) {
                logger.warn(`⚠️ GraphQL rate limit low: ${data.rateLimit.remaining} remaining, resets at ${data.rateLimit.resetAt}`);
            }
        }

        logger.info(`Found ${allIssues.length} issues updated since last sync`);

        const newMetadata = {
            issues      : { ...metadata.issues }, // Start with existing metadata
            pushFailures: metadata.pushFailures || [],
            lastSync    : new Date().toISOString()
        };

        const stats = {
            pulled : { count: 0, created: 0, updated: 0, moved: 0, issues: [] },
            dropped: { count: 0, issues: [] }
        };

        // Process each issue
        for (const issue of allIssues) {
            const issueNumber = issue.number;
            const targetPath  = this.#getIssuePath(issue);

            if (!targetPath) {
                stats.dropped.count++;
                stats.dropped.issues.push(issueNumber);
                const oldPath = metadata.issues[issueNumber]?.path;
                if (oldPath) {
                    try {
                        await fs.unlink(oldPath);
                        logger.info(`🗑️ Removed dropped issue #${issueNumber}: ${oldPath}`);
                    } catch (e) { /* File might not exist */ }
                }
                // Remove from metadata
                delete newMetadata.issues[issueNumber];
                continue;
            }

            const oldIssue = metadata.issues[issueNumber];
            const needsUpdate = !oldIssue ||
                oldIssue.updated !== issue.updatedAt ||
                oldIssue.path !== targetPath;

            let contentHash = oldIssue?.contentHash;

            if (needsUpdate) {
                stats.pulled.count++;
                stats.pulled.issues.push(issueNumber);

                // Comments are already in issue.comments - no separate fetch needed!
                const markdown = this.#formatIssueMarkdown(issue, issue.comments.nodes);
                contentHash = this.#calculateContentHash(markdown);

                await fs.mkdir(path.dirname(targetPath), { recursive: true });
                await fs.writeFile(targetPath, markdown, 'utf-8');

                if (!oldIssue) {
                    stats.pulled.created++;
                    logger.info(`✨ Created #${issueNumber}: ${targetPath}`);
                } else if (oldIssue.path && oldIssue.path !== targetPath) {
                    stats.pulled.moved++;
                    try {
                        await fs.rename(oldIssue.path, targetPath);
                        logger.info(`📦 Moved #${issueNumber}: ${oldIssue.path} → ${targetPath}`);
                    } catch (e) {
                        logger.warn(`Could not rename #${issueNumber}, falling back to write. Error: ${e.message}`);
                        await fs.unlink(oldIssue.path).catch(() => {});
                    }
                } else {
                    stats.pulled.updated++;
                    logger.info(`✅ Updated #${issueNumber}: ${targetPath}`);
                }
            }

            newMetadata.issues[issueNumber] = {
                state    : issue.state,
                path     : targetPath,
                updatedAt: issue.updatedAt,
                closedAt : issue.closedAt || null,
                milestone: issue.milestone?.title || null,
                title    : issue.title,
                contentHash // Store hash for push comparison
            };
        }

        return { newMetadata, stats };
    }

    /**
     * Pushes local changes to GitHub using GraphQL mutations.
     * Uses content hash comparison to detect actual changes and prevent false updates.
     * @param {object} metadata
     * @returns {Promise<object>}
     */
    async pushToGitHub(metadata) {
        logger.info('📤 Checking for local changes to push via GraphQL...');
        const stats = { count: 0, issues: [], failures: [] };

        if (!metadata.lastSync) {
            logger.info('✨ No previous sync found, skipping push.');
            return stats;
        }

        const localFiles       = await this.#scanLocalFiles();
        const previousFailures = metadata.pushFailures || [];

        logger.debug(`Scanning ${localFiles.length} local files for changes...`);

        for (const filePath of localFiles) {
            try {
                const content     = await fs.readFile(filePath, 'utf-8');
                const parsed      = matter(content);
                const issueNumber = parsed.data.id;

                if (!issueNumber) {
                    logger.debug(`Skipping file without issue number: ${path.basename(filePath)}`);
                    continue;
                }

                // Calculate current content hash
                const currentHash = this.#calculateContentHash(content);
                const oldIssue    = metadata.issues[issueNumber];

                // Skip if no metadata exists (shouldn't happen, but be safe)
                if (!oldIssue) {
                    logger.debug(`No metadata for #${issueNumber}, skipping push`);
                    continue;
                }

                // Compare content hash - skip if unchanged
                if (oldIssue.contentHash && oldIssue.contentHash === currentHash) {
                    logger.debug(`No content change for #${issueNumber}, skipping`);
                    continue;
                }

                // Skip previously failed pushes
                if (previousFailures.includes(issueNumber)) {
                    logger.debug(`Skipping previously failed push for issue #${issueNumber}`);
                    stats.failures.push(issueNumber);
                    continue;
                }

                logger.info(`📝 Content changed for #${issueNumber}`);

                // Step 1: Get the issue's GraphQL ID
                const idData = await GraphqlService.query(GET_ISSUE_ID, {
                    owner : aiConfig.owner,
                    repo  : aiConfig.repo,
                    number: issueNumber
                });

                const issueId = idData.repository.issue.id;

                // Step 2: Prepare the updated content
                const bodyWithoutComments = parsed.content.split(issueSyncConfig.commentSectionDelimiter)[0].trim();
                const titleMatch          = bodyWithoutComments.match(/^#\s+(.+)$/m);
                const title               = titleMatch ? titleMatch[1] : parsed.data.title;

                const cleanBody = bodyWithoutComments
                    .replace(/^#\s+.+$/m, '')
                    .replace(/^\*\*Reported by:\*\*.+$/m, '')
                    .replace(/^---\n\n[\s\S]*?^---\n\n/m, '') // Remove relationship section
                    .trim();

                // Step 3: Execute the mutation
                await GraphqlService.query(UPDATE_ISSUE, {
                    issueId,
                    title,
                    body: cleanBody
                });

                logger.info(`✅ Updated GitHub issue #${issueNumber} via GraphQL`);
                stats.count++;
                stats.issues.push(issueNumber);
            } catch (e) {
                logger.warn(`⚠️ Could not push changes for file ${path.basename(filePath)}. Error: ${e.message}`);
                const parsed = matter(await fs.readFile(filePath, 'utf-8'));
                if (parsed.data.id) {
                    stats.failures.push(parsed.data.id);
                }
            }
        }

        if (stats.count > 0) {
            logger.info(`📤 Pushed ${stats.count} local change(s) to GitHub`);
        }
        if (stats.failures.length > 0) {
            logger.warn(`⚠️ Encountered ${stats.failures.length} push failure(s).`);
        }

        return stats;
    }

    /**
     * Reconciles the locations of closed issues in the active directory.
     * This handles the case where a new release is created but issues weren't updated,
     * so they didn't get moved during the pull operation (delta sync limitation).
     *
     * CRITICAL: This method ONLY processes issues that are:
     * 1. Currently in the active issues directory (not already archived)
     * 2. In a CLOSED state
     * 3. Should be archived based on milestone or release date
     *
     * @param {object} metadata - The current metadata object
     * @returns {Promise<object>} Stats about reconciled issues
     */
    async reconcileClosedIssueLocations(metadata) {
        logger.info('🔄 Reconciling closed issue locations...');

        const stats = { count: 0, issues: [] };

        // Ensure releases are loaded
        if (!ReleaseSyncer.sortedReleases || ReleaseSyncer.sortedReleases.length === 0) {
            logger.warn('No releases available for reconciliation, skipping.');
            return stats;
        }

        for (const issueNumber in metadata.issues) {
            const issueData = metadata.issues[issueNumber];

            // CRITICAL: Only process issues in the active directory
            if (!issueData.path.startsWith(issueSyncConfig.issuesDir)) {
                continue; // Already archived, skip it
            }

            // Only process CLOSED issues
            if (issueData.state !== 'CLOSED') {
                continue;
            }

            // Calculate where this closed issue SHOULD be
            const correctPath = this.#getIssuePath({
                number   : parseInt(issueNumber),
                state    : issueData.state,
                milestone: issueData.milestone ? { title: issueData.milestone } : null,
                closedAt : issueData.closedAt,
                updatedAt: issueData.updatedAt
            });

            // If the correct path is null, the issue should be dropped (shouldn't happen here)
            if (!correctPath) {
                logger.warn(`Issue #${issueNumber} has null target path during reconciliation, skipping.`);
                continue;
            }

            // Check if the issue needs to be moved to an archive
            if (issueData.path !== correctPath) {
                // Verify the correct path is actually in an archive, not back to active directory
                if (correctPath.startsWith(issueSyncConfig.issuesDir) &&
                    !correctPath.includes(issueSyncConfig.archiveDir)) {
                    logger.debug(`Issue #${issueNumber} correct path is still in active directory, no move needed.`);
                    continue;
                }

                logger.info(`📦 Archiving closed issue #${issueNumber}: ${issueData.path} → ${correctPath}`);

                try {
                    // Ensure target directory exists
                    await fs.mkdir(path.dirname(correctPath), { recursive: true });

                    // Move the file
                    await fs.rename(issueData.path, correctPath);

                    // Update metadata
                    metadata.issues[issueNumber].path = correctPath;

                    stats.count++;
                    stats.issues.push(parseInt(issueNumber));

                    logger.info(`✅ Archived #${issueNumber} to ${path.relative(process.cwd(), correctPath)}`);
                } catch (e) {
                    logger.error(`❌ Failed to archive #${issueNumber}: ${e.message}`);
                }
            }
        }

        if (stats.count > 0) {
            logger.info(`📦 Archived ${stats.count} closed issue(s)`);
        } else {
            logger.info('✓ No closed issues need archiving');
        }

        return stats;
    }

    /**
     * Recursively scans the configured issue directory to find all local .md issue files.
     * This operation is intentionally limited to the active issues directory as a performance
     * optimization, based on the assumption that closed/archived issues are immutable and
     * do not need to be checked for local changes to push.
     * @returns {Promise<string[]>} A flat list of absolute file paths for all found issue files.
     * @private
     */
    async #scanLocalFiles() {
        const localFiles = [];
        const scanDir = async (dir) => {
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        await scanDir(fullPath);
                    } else if (entry.isFile() && entry.name.endsWith('.md')) {
                        localFiles.push(fullPath);
                    }
                }
            } catch (e) {
                // Directory doesn't exist yet, which is fine.
            }
        };

        await scanDir(issueSyncConfig.issuesDir);

        return localFiles;
    }
}

export default Neo.setupClass(IssueSyncer);
