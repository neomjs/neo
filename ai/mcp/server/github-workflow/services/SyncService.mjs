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
     * The main sync orchestration logic.
     * @returns {Promise<object>}
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

        // 4. Save metadata
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
     * Fetches all releases from GitHub, filters them by the syncStartDate, and caches them.
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
     * Executes a gh CLI command. Can return parsed JSON or raw stdout.
     * @param {String} cmd
     * @param {boolean} [json=true] - Whether to parse the output as JSON.
     * @returns {Promise<any>}
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
     * Formats a GitHub issue and its comments into a Markdown string with YAML frontmatter.
     * @param {object} issue
     * @param {object[]} comments
     * @returns {string}
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
     * Determines the correct local file path for a given issue.
     * @param {object} issue
     * @returns {string|null}
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
     * Loads the synchronization metadata file from disk.
     * @returns {Promise<object>}
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
     * Fetches all issues from GitHub and updates the local Markdown files.
     * @param {object} metadata
     * @returns {Promise<object>} The new metadata object.
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
            issues   : {},
            last_sync: new Date().toISOString()
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
     * Scans local issue files for changes and pushes them to GitHub.
     * @param {object} metadata
     * @private
     */
    async #pushToGitHub(metadata) {
        logger.info('📤 Checking for local changes to push...');
        const stats = { count: 0, issues: [] };

        if (!metadata.last_sync) {
            logger.info('✨ No previous sync found, skipping push.');
            return stats;
        }

        const localFiles = await this.#scanLocalFiles();

        for (const filePath of localFiles) {
            const fileStats = await fs.stat(filePath);
            if (fileStats.mtime > new Date(metadata.last_sync)) {
                const content     = await fs.readFile(filePath, 'utf-8');
                const parsed      = matter(content);
                const issueNumber = parsed.data.id;

                if (!issueNumber) continue;

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
                    logger.warn(`⚠️ Could not push changes for #${issueNumber}. Issue may not exist on GitHub.`);
                }
            }
        }

        if (stats.count > 0) {
            logger.info(`📤 Pushed ${stats.count} local change(s) to GitHub`);
        } else {
            logger.info('✨ No local changes to push');
        }
        return stats;
    }

    /**
     * Recursively scans issue directories for .md files.
     * @returns {Promise<string[]>} A list of absolute file paths.
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
     * Saves the synchronization metadata to disk.
     * @param {object} metadata
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
