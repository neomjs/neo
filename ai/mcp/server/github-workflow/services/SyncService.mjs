import aiConfig    from '../../config.mjs';
import Base        from '../../../../../src/core/Base.mjs';
import fs          from 'fs/promises';
import logger      from '../../logger.mjs';
import matter      from 'gray-matter';
import path        from 'path';
import {exec}      from 'child_process';
import {promisify} from 'util';

const execAsync       = promisify(exec);
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
        if (newMetadata.push_failures?.length > 0) {
            newMetadata.push_failures = newMetadata.push_failures.filter(failedId => !newMetadata.issues[failedId]);
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
            startTime : startTime.toISOString(),
            endTime   : endTime.toISOString(),
            durationMs: durationMs
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
            timing    : timing
        };
    }

    /**
     * Fetches release notes from GitHub and saves them as local Markdown files.
     * @returns {Promise<object>} Statistics about the operation ({count: number, synced: string[]}).
     * @private
     */
    async #syncReleaseNotes() {
        logger.info('📝 Syncing release notes...');
        const releaseDir = issueSyncConfig.releaseNotesDir;
        await fs.mkdir(releaseDir, { recursive: true });

        const stats = {
            count : 0,
            synced: []
        };

        for (const release of this.releases) {
            try {
                const releaseBody = await this.#ghCommand(`release view ${release.tagName} --json body -q .body`, false);
                const filePath = path.join(releaseDir, `${release.tagName}.md`);
                await fs.writeFile(filePath, releaseBody, 'utf-8');
                logger.info(`✅ Synced release notes for ${release.tagName}`);
                stats.count++;
                stats.synced.push(release.tagName);
            } catch (e) {
                logger.warn(`⚠️ Could not sync release notes for ${release.tagName}.`);
            }
        }
        return stats;
    }

    /**
     * Fetches all releases from GitHub, filters them by the syncStartDate, and caches them in `this.releases`.
     * @private
     */
    async #fetchAndCacheReleases() {
        logger.info('Fetching and caching releases...');
        const allReleases = await this.#ghCommand('release list --json tagName,publishedAt --limit 1000');

        this.releases = allReleases
            .filter(release => new Date(release.publishedAt) >= new Date(issueSyncConfig.syncStartDate))
            .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

        if (this.releases.length === 0) {
            logger.warn(`⚠️ No releases found since syncStartDate (${issueSyncConfig.syncStartDate}). Archiving may fall back to default.`);
        }

        logger.info(`Found and cached ${this.releases.length} releases since ${issueSyncConfig.syncStartDate}.`);
    }

    /**
     * Executes a gh CLI command.
     * @param {string} cmd - The gh command to execute (without the leading 'gh').
     * @param {boolean} [json=true] - Whether to parse the stdout as JSON.
     * @returns {Promise<any>} The parsed JSON object or raw stdout string.
     * @throws {Error} If the gh command fails.
     * @private
     */
    async #ghCommand(cmd, json = true) {
        try {
            // Using a larger maxBuffer in case of large outputs (e.g., many issues)
            const { stdout } = await execAsync(`gh ${cmd}`, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 10 });
            return json ? JSON.parse(stdout) : stdout;
        } catch (error) {
            logger.error(`Error executing: gh ${cmd}`);
            logger.error(error.stderr || error.message);
            throw error;
        }
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
            id            : issue.number,
            title         : issue.title,
            state         : issue.state,
            labels        : issue.labels.map(l => l.name),
            assignees     : issue.assignees.map(a => a.login),
            created_at    : issue.createdAt,
            updated_at    : issue.updatedAt,
            github_url    : issue.url,
            author        : issue.author.login,
            comments_count: comments.length
        };

        if (issue.closedAt) {
            frontmatter.closed_at = issue.closedAt;
        }
        if (issue.milestone) {
            frontmatter.milestone = issue.milestone.title;
        }

        let body = `# ${issue.title}\n\n`;
        body += `**Reported by:** @${issue.author.login} on ${issue.createdAt.split('T')[0]}\n\n`;
        body += issue.body || '*(No description provided)*';
        body += '\n\n';

        if (comments.length > 0) {
            body += '## Comments\n\n';
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
        const number = String(issue.number).padStart(4, '0');
        const labels = issue.labels.map(l => l.name.toLowerCase());

        const isDropped = issueSyncConfig.droppedLabels.some(label => labels.includes(label));
        if (isDropped) {
            return null; // Dropped issues are not stored locally.
        }

        if (issue.state === 'OPEN') {
            return path.join(issueSyncConfig.issuesDir, `${number}.md`);
        }

        if (issue.state === 'CLOSED') {
            const closed = new Date(issue.closedAt);
            let version = this.releases.length > 0 ? this.releases[this.releases.length - 1].tagName : issueSyncConfig.defaultArchiveVersion;

            if (issue.milestone?.title) {
                version = issue.milestone.title;
            } else {
                // Find the first release that was published after the issue was closed
                const release = this.releases.find(r => new Date(r.publishedAt) > closed);
                if (release) {
                    version = release.tagName;
                }
            }
            return path.join(issueSyncConfig.archiveDir, version, `${number}.md`);
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
                    last_sync: null,
                    issues   : {}
                };
            }
            throw error;
        }
    }

    /**
     * Fetches all relevant issues from GitHub since the last sync, compares them to local metadata,
     * and updates local Markdown files as needed (create, update, move, or drop).
     * @param {object} metadata - The last known sync metadata.
     * @returns {Promise<{newMetadata: object, stats: object}>} An object containing the newly generated
     * metadata for the next sync and detailed statistics about the pull operation.
     * @private
     */
    async #pullFromGitHub(metadata) {
        logger.info('📥 Fetching issues from GitHub...');
        let allIssues = await this.#ghCommand('issue list --limit 10000 --state all --json number,title,state,labels,assignees,milestone,createdAt,updatedAt,closedAt,url,author,body');
        logger.info(`Found ${allIssues.length} total issues`);

        const startDate = new Date(issueSyncConfig.syncStartDate);
        allIssues = allIssues.filter(issue => {
            return new Date(issue.createdAt) >= startDate || new Date(issue.updatedAt) >= startDate;
        });

        logger.info(`Processing ${allIssues.length} issues since ${issueSyncConfig.syncStartDate}`);

        const newMetadata = {
            issues       : {},
            push_failures: metadata.push_failures || [],
            last_sync    : new Date().toISOString()
        };

        const stats = {
            pulled : { count: 0, created: 0, updated: 0, moved: 0, issues: [] },
            dropped: { count: 0, issues: [] }
        };

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
                    } catch (e) { /* File might not exist, that's ok */ }
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

                const comments = await this.#ghCommand(`issue view ${issueNumber} --json comments --jq '.comments'`);
                const markdown = this.#formatIssueMarkdown(issue, comments);

                await fs.mkdir(path.dirname(targetPath), { recursive: true });
                await fs.writeFile(targetPath, markdown, 'utf-8');

                if (!oldIssue) {
                    stats.pulled.created++;
                    logger.info(`✨ Created #${issueNumber}: ${targetPath}`);
                } else if (oldIssue.path && oldIssue.path !== targetPath) {
                    stats.pulled.moved++;
                    try {
                        await fs.unlink(oldIssue.path);
                        logger.info(`📦 Moved #${issueNumber}: ${oldIssue.path} → ${targetPath}`);
                    } catch (e) { /* Old file might not exist */ }
                } else {
                    stats.pulled.updated++;
                    logger.info(`✅ Updated #${issueNumber}: ${targetPath}`);
                }
            }

            newMetadata.issues[issueNumber] = {
                state    : issue.state,
                path     : targetPath,
                updated  : issue.updatedAt,
                closed_at: issue.closedAt || null,
                milestone: issue.milestone?.title || null,
                title    : issue.title
            };
        }
        return { newMetadata, stats };
    }

    /**
     * Scans local Markdown files for modifications since the last sync and pushes
     * changes (title and body) to the corresponding GitHub issues. It also tracks and
     * skips issues that have previously failed to push.
     * @param {object} metadata - The last known sync metadata.
     * @returns {Promise<object>} Statistics about the push operation ({count: number, issues: number[], failures: number[]}).
     * @private
     */
    async #pushToGitHub(metadata) {
        logger.info('📤 Checking for local changes to push...');
        const stats = { count: 0, issues: [], failures: [] };

        if (!metadata.last_sync) {
            logger.info('✨ No previous sync found, skipping push.');
            return stats;
        }

        const localFiles = await this.#scanLocalFiles();
        const previousFailures = metadata.push_failures || [];

        for (const filePath of localFiles) {
            const fileStats = await fs.stat(filePath);
            if (fileStats.mtime > new Date(metadata.last_sync)) {
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
                    const bodyWithoutComments = parsed.content.split('## Comments')[0].trim();
                    const titleMatch          = bodyWithoutComments.match(/^#\s+(.+)$/m);
                    const title               = titleMatch ? titleMatch[1] : parsed.data.title;

                    const cleanBody = bodyWithoutComments
                        .replace(/^#\s+.+$/m, '')
                        .replace(/^\*\*Reported by:\*\*.+$/m, '')
                        .trim();

                    const bodyFilePath = path.join(path.dirname(filePath), `${issueNumber}.body.tmp`);
                    await fs.writeFile(bodyFilePath, cleanBody, 'utf-8');

                    await this.#ghCommand(`issue edit ${issueNumber} --title "${title.replace(/"/g, '\\"')}" --body-file "${bodyFilePath}"`, false);

                    await fs.unlink(bodyFilePath);

                    logger.info(`✅ Updated GitHub issue #${issueNumber}`);
                    stats.count++;
                    stats.issues.push(issueNumber);
                } catch (e) {
                    logger.warn(`⚠️ Could not push changes for #${issueNumber}. Issue may not exist on GitHub. Error: ${e.stderr || e.message}`);
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
