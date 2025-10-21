import aiConfig                                      from '../../config.mjs';
import Base                                          from '../../../../../src/core/Base.mjs';
import fs                                            from 'fs/promises';
import logger                                        from '../../logger.mjs';
import matter                                        from 'gray-matter';
import path                                          from 'path';
import GraphqlService                                from './GraphqlService.mjs';
import {FETCH_ISSUES_FOR_SYNC, DEFAULT_QUERY_LIMITS} from './queries/issueQueries.mjs';
import {GET_ISSUE_ID, UPDATE_ISSUE}                  from './queries/mutations.mjs';
import {FETCH_RELEASES}                              from './queries/releaseQueries.mjs';

const issueSyncConfig = aiConfig.githubWorkflow.issueSync;

/**
 * Orchestrates the bi-directional synchronization of GitHub issues with local Markdown files.
 *
 * This service is the core engine for the GitHub issue sync workflow. Its primary responsibilities include:
 * - **State Management:** It maintains a persistent state via a `.sync-metadata.json` file to track
 *   the last sync time and the status of each issue, enabling efficient delta-based updates.
 * - **Conflict Resolution:** It employs a "push-then-pull" strategy to minimize merge conflicts.
 *   Local changes are always pushed to GitHub before remote changes are pulled, ensuring local edits
 *   are not accidentally overwritten.
 * - **Data Transformation:** It fetches full issue data (including comments) from GitHub and formats it
 *   into structured Markdown files with YAML frontmatter for easy parsing and editing.
 * - **Local File Management:** It handles the creation, updating, moving (archiving), and deletion of
 *   local issue files based on changes from GitHub.
 * - **Release Awareness:** It fetches GitHub releases to intelligently archive closed issues into
 *   versioned directories, providing historical context.
 *
 * The main entry point is the `runFullSync` method, which executes the entire orchestration sequence.
 * @class Neo.ai.mcp.server.github-workflow.SyncService
 * @extends Neo.core.Base
 * @singleton
 */
class SyncService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.SyncService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.SyncService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {Array|null} releases=null
     * @protected
     */
    releases = null;

    /**
     * The main public entry point for the synchronization process.
     *
     * This method orchestrates the entire bi-directional sync workflow in a specific order
     * to ensure data integrity and minimize conflicts:
     * 1.  Fetches and caches GitHub release data to aid in archiving.
     * 2.  Loads the persistent metadata from the last sync.
     * 3.  **Pushes** any local changes (detected via file modification times) to GitHub.
     * 4.  **Pulls** the latest changes from GitHub, updating local files.
     * 5.  Syncs release notes into local Markdown files.
     * 6.  Saves the updated metadata to disk for the next run.
     *
     * @returns {Promise<object>} A comprehensive object containing detailed statistics and timing
     * information about all operations performed during the sync, conforming to the
     * `SyncIssuesResponse` schema in the OpenAPI definition.
     * @example
     * const result = await syncService.runFullSync();
     * // result = {
     * //   success: true,
     * //   summary: "Synchronization complete",
     * //   statistics: {
     * //     pushed: { count: 2, issues: [1234, 1235] },
     * //     pulled: { count: 15, created: 3, updated: 12, moved: 0, issues: [...] },
     * //     dropped: { count: 1, issues: [999] },
     * //     releases: { count: 5, synced: ['v11.0', ...] }
     * //   },
     * //   timing: { startTime: '...', endTime: '...', durationMs: 150000 }
     * // }
     */
    async runFullSync() {
        const startTime = new Date();

        await this.#fetchAndCacheReleases();

        const metadata = await this.#loadMetadata();

        // 1. Push local changes
        const pushStats = await this.#pushToGitHub(metadata);

        // 2. Pull remote changes
        const { newMetadata, stats: pullStats } = await this.#pullFromGitHub(metadata);

        // 3. Sync release notes
        const releaseStats = await this.#syncReleaseNotes();

        // 4. Self-heal push failures: If a previously failed issue was successfully pulled, remove it from the failure list
        if (newMetadata.pushFailures?.length > 0) {
            newMetadata.pushFailures = newMetadata.pushFailures.filter(failedId => !newMetadata.issues[failedId]);
        }

        // 5. Save metadata
        await this.#saveMetadata(newMetadata);

        const endTime    = new Date();
        const durationMs = endTime - startTime;

        const finalStats = {
            pushed  : pushStats,
            pulled  : pullStats.pulled,
            dropped : pullStats.dropped,
            releases: releaseStats
        };

        const timing = {
            startTime: startTime.toISOString(),
            endTime  : endTime.toISOString(),
            durationMs
        };

        logger.info('✨ Sync Complete');
        logger.info(`   Pushed:   ${finalStats.pushed.count} issues`);
        logger.info(`   Pulled:   ${finalStats.pulled.count} issues (${finalStats.pulled.created} new, ${finalStats.pulled.updated} updated, ${finalStats.pulled.moved} moved)`);
        logger.info(`   Dropped:  ${finalStats.dropped.count} issues`);
        logger.info(`   Releases: ${finalStats.releases.count} synced`);
        logger.info(`   Duration: ${Math.round(timing.durationMs / 1000)}s`);

        return {
            success   : true,
            summary   : "Synchronization complete",
            statistics: finalStats,
            timing
        };
    }

    /**
     * Saves release notes from GitHub as local Markdown files.
     * @returns {Promise<object>} Statistics about the operation ({count: number, synced: string[]}).
     * @private
     */
    async #syncReleaseNotes() {
        logger.info('📄 Syncing release notes...');
        const releaseDir = issueSyncConfig.releaseNotesDir;
        await fs.mkdir(releaseDir, { recursive: true });

        const stats = {
            count : 0,
            synced: []
        };

        for (const release of this.releases) {
            try {
                const filePath = path.join(releaseDir, `${release.tagName}.md`);

                const frontmatter = {
                    tagName     : release.tagName,
                    name        : release.name,
                    publishedAt : release.publishedAt,
                    isPrerelease: release.isPrerelease || false,
                    isDraft     : release.isDraft || false
                };

                // GraphQL returns 'description' not 'body'
                const content = matter.stringify(release.description || '', frontmatter);

                await fs.writeFile(filePath, content, 'utf-8');
                logger.info(`✅ Synced release notes for ${release.tagName}`);
                stats.count++;
                stats.synced.push(release.tagName);
            } catch (e) {
                logger.warn(`⚠️ Could not sync release notes for ${release.tagName}: ${e.message}`);
            }
        }
        return stats;
    }

    /**
     * Fetches all releases from GitHub using GraphQL with automatic pagination.
     * @private
     */
    async #fetchAndCacheReleases() {
        logger.info('Fetching and caching releases via GraphQL...');

        let allReleases = [];
        let hasNextPage = true;
        let cursor      = null;
        const maxReleases = issueSyncConfig.maxReleases;

        // Paginate through all releases
        while (hasNextPage && allReleases.length < maxReleases) {
            const data = await GraphqlService.query(FETCH_RELEASES, {
                owner: aiConfig.githubWorkflow.owner,
                repo : aiConfig.githubWorkflow.repo,
                limit: 100,
                cursor
            });

            const releases = data.repository.releases;
            allReleases.push(...releases.nodes);

            hasNextPage = releases.pageInfo.hasNextPage;
            cursor = releases.pageInfo.endCursor;

            logger.debug(`Fetched ${releases.nodes.length} releases (total: ${allReleases.length})`);
        }

        // Filter by syncStartDate
        const startDate = new Date(issueSyncConfig.syncStartDate);
        this.releases = allReleases
            .filter(release => new Date(release.publishedAt) >= startDate)
            .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

        if (this.releases.length === 0) {
            logger.warn(`⚠️ No releases found since syncStartDate (${issueSyncConfig.syncStartDate}). Archiving may fall back to default.`);
        }

        logger.info(`Found and cached ${this.releases.length} releases since ${issueSyncConfig.syncStartDate}.`);
    }

    /**
     * Formats a GitHub issue object and its comments into a single Markdown string with YAML frontmatter.
     * @param {object} issue - The GitHub issue object from the API.
     * @param {object[]} comments - An array of comment objects for the issue.
     * @returns {string} The fully formatted Markdown string.
     * @private
     */
    #formatIssueMarkdown(issue, comments) {
        const frontmatter = {
            id           : issue.number,
            title        : issue.title,
            state        : issue.state,
            labels       : issue.labels.nodes.map(l => l.name),
            assignees    : issue.assignees.nodes.map(a => a.login),
            createdAt    : issue.createdAt,
            updatedAt    : issue.updatedAt,
            githubUrl    : issue.url,
            author       : issue.author.login,
            commentsCount: comments.length,
            // NEW: Add relationship tracking
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
     * @example
     * // For an open issue
     * #getIssuePath({ number: 123, state: 'OPEN', labels: [] })
     * // => '/path/to/project/.github/ISSUES/0123.md'
     *
     * // For a closed issue with a milestone
     * #getIssuePath({ number: 456, state: 'CLOSED', milestone: { title: 'v11.0' }, labels: [], closedAt: '...' })
     * // => '/path/to/project/.github/ISSUE_ARCHIVE/v11.0/0456.md'
     *
     * // For a dropped issue
     * #getIssuePath({ number: 789, state: 'OPEN', labels: [{ name: 'wontfix' }] })
     * // => null
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

        if (issue.state === 'OPEN') {
            return path.join(issueSyncConfig.issuesDir, filename);
        }

        if (issue.state === 'CLOSED') {
            const closed = new Date(issue.closedAt);
            let version = this.releases.length > 0
                ? this.releases[this.releases.length - 1].tagName
                : issueSyncConfig.defaultArchiveVersion;

            if (issue.milestone?.title) {
                version = issue.milestone.title;
            } else {
                // Find the first release that was published after the issue was closed
                const release = this.releases.find(r => new Date(r.publishedAt) > closed);
                if (release) {
                    version = release.tagName;
                }
            }
            return path.join(issueSyncConfig.archiveDir, version, filename);
        }

        return null;
    }

    /**
     * Loads the synchronization metadata file from disk. If the file doesn't exist,
     * it returns a default empty metadata object.
     * @returns {Promise<object>} The parsed metadata object.
     * @throws {Error} If reading the file fails for reasons other than not existing.
     * @private
     */
    async #loadMetadata() {
        try {
            const data = await fs.readFile(issueSyncConfig.metadataFile, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return {
                    lastSync: null,
                    issues   : {}
                };
            }
            throw error;
        }
    }

    /**
     * Fetches all relevant issues from GitHub using GraphQL with automatic pagination.
     * This single query fetches issues WITH their comments and relationships in one go!
     * @param {object} metadata
     * @returns {Promise<{newMetadata: object, stats: object}>}
     * @private
     */
    async #pullFromGitHub(metadata) {
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
                    owner : aiConfig.githubWorkflow.owner,
                    repo  : aiConfig.githubWorkflow.repo,
                    limit : 100,
                    cursor,
                    states: ['OPEN', 'CLOSED'],
                    since : issueSyncConfig.syncStartDate,
                    ...DEFAULT_QUERY_LIMITS
                },
                true // Enable sub-issues feature
            );

            const issues = data.repository.issues;
            allIssues.push(...issues.nodes);

            hasNextPage = issues.pageInfo.hasNextPage;
            cursor = issues.pageInfo.endCursor;

            // Monitor rate limit usage
            totalCost += data.rateLimit.cost;
            logger.debug(`Fetched ${issues.nodes.length} issues (total: ${allIssues.length}, cost: ${totalCost}, remaining: ${data.rateLimit.remaining})`);

            // Safety check: If rate limit is getting low, warn
            if (data.rateLimit.remaining < 500) {
                logger.warn(`⚠️ GraphQL rate limit low: ${data.rateLimit.remaining} remaining, resets at ${data.rateLimit.resetAt}`);
            }
        }

        logger.info(`Found ${allIssues.length} total issues`);
        logger.info(`Processing ${allIssues.length} issues since ${issueSyncConfig.syncStartDate}`);

        const newMetadata = {
            issues       : {},
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
                continue;
            }

            const oldIssue = metadata.issues[issueNumber];
            const needsUpdate = !oldIssue ||
                oldIssue.updated !== issue.updatedAt ||
                oldIssue.path !== targetPath;

            if (needsUpdate) {
                stats.pulled.count++;
                stats.pulled.issues.push(issueNumber);

                // Comments are already in issue.comments - no separate fetch needed!
                const markdown = this.#formatIssueMarkdown(issue, issue.comments.nodes);

                await fs.mkdir(path.dirname(targetPath), { recursive: true });
                await fs.writeFile(targetPath, markdown, 'utf-8');

                if (!oldIssue) {
                    stats.pulled.created++;
                    logger.info(`✨ Created #${issueNumber}: ${targetPath}`);
                } else if (oldIssue.path && oldIssue.path !== targetPath) {
                    stats.pulled.moved++;
                    try {
                        await fs.rename(oldIssue.path, targetPath);
                        logger.info(`📦 Renamed/Moved #${issueNumber}: ${oldIssue.path} → ${targetPath}`);
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
                updated  : issue.updatedAt,
                closedAt : issue.closedAt || null,
                milestone: issue.milestone?.title || null,
                title    : issue.title
            };
        }

        return { newMetadata, stats };
    }

    /**
     * Pushes local changes to GitHub using GraphQL mutations.
     * @param {object} metadata
     * @returns {Promise<object>}
     * @private
     */
    async #pushToGitHub(metadata) {
        logger.info('📤 Checking for local changes to push via GraphQL...');
        const stats = { count: 0, issues: [], failures: [] };

        if (!metadata.lastSync) {
            logger.info('✨ No previous sync found, skipping push.');
            return stats;
        }

        const localFiles       = await this.#scanLocalFiles();
        const previousFailures = metadata.pushFailures || [];

        for (const filePath of localFiles) {
            const fileStats = await fs.stat(filePath);
            if (fileStats.mtime > new Date(metadata.lastSync)) {
                const content     = await fs.readFile(filePath, 'utf-8');
                const parsed      = matter(content);
                const issueNumber = parsed.data.id;

                if (!issueNumber) continue;

                if (previousFailures.includes(issueNumber)) {
                    logger.debug(`Skipping previously failed push for issue #${issueNumber}`);
                    stats.failures.push(issueNumber);
                    continue;
                }

                logger.info(`📝 Local changes detected for #${issueNumber}`);

                try {
                    // Step 1: Get the issue's GraphQL ID
                    const idData = await GraphqlService.query(GET_ISSUE_ID, {
                        owner : aiConfig.githubWorkflow.owner,
                        repo  : aiConfig.githubWorkflow.repo,
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
                    logger.warn(`⚠️ Could not push changes for #${issueNumber}. Error: ${e.message}`);
                    stats.failures.push(issueNumber);
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
     * Recursively scans the configured issue and archive directories to find all local .md issue files.
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
        await scanDir(issueSyncConfig.archiveDir);

        return localFiles;
    }

    /**
     * Saves the provided metadata object to the configured metadata file on disk,
     * ensuring the directory exists.
     * @param {object} metadata - The metadata object to serialize and save.
     * @returns {Promise<void>}
     * @private
     */
    async #saveMetadata(metadata) {
        const dir = path.dirname(issueSyncConfig.metadataFile);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(issueSyncConfig.metadataFile, JSON.stringify(metadata, null, 2), 'utf-8');
    }
}

export default Neo.setupClass(SyncService);
