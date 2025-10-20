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
        await this.#fetchAndCacheReleases();

        const metadata = await this.#loadMetadata();

        // 1. Push local changes
        await this.#pushToGitHub(metadata);

        // 2. Pull remote changes
        const newMetadata = await this.#pullFromGitHub(metadata);

        // 3. Save metadata
        await this.#saveMetadata(newMetadata);

        const pushedCount = newMetadata.pushedCount || 0;
        delete newMetadata.pushedCount;

        return {
            message: `Synchronization complete. Pushed ${pushedCount} local change(s).`
        };
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
            let version = issueSyncConfig.releases[issueSyncConfig.releases.length - 1]?.version || 'unknown';

            if (issue.milestone?.title) {
                version = issue.milestone.title;
            } else {
                for (const release of issueSyncConfig.releases) {
                    if (closed >= new Date(release.cutoffDate)) {
                        version = release.version;
                        break;
                    }
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
                    issues: {}
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
        const allIssues = await this.#ghCommand('issue list --limit 10000 --state all --json number,title,state,labels,assignees,milestone,createdAt,updatedAt,closedAt,url,author,body');
        logger.info(`Found ${allIssues.length} issues`);

        const newMetadata = {
            issues: {},
            dropped_ids: [],
            last_sync: new Date().toISOString(),
            pushedCount: metadata.pushedCount || 0
        };

        for (const issue of allIssues) {
            const issueNumber = issue.number;
            const targetPath = this.#getIssuePath(issue);

            if (!targetPath) {
                newMetadata.dropped_ids.push(issueNumber);
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
                const comments = await this.#ghCommand(`issue view ${issueNumber} --json comments --jq '.comments'`);
                const markdown = this.#formatIssueMarkdown(issue, comments);

                await fs.mkdir(path.dirname(targetPath), { recursive: true });
                await fs.writeFile(targetPath, markdown, 'utf-8');

                if (oldIssue?.path && oldIssue.path !== targetPath) {
                    try {
                        await fs.unlink(oldIssue.path);
                        logger.info(`📦 Moved #${issueNumber}: ${oldIssue.path} → ${targetPath}`);
                    } catch (e) { /* Old file might not exist */ }
                } else {
                    logger.info(`✅ Updated #${issueNumber}: ${targetPath}`);
                }
            }

            newMetadata.issues[issueNumber] = {
                state: issue.state,
                path: targetPath,
                updated: issue.updatedAt,
                closed_at: issue.closedAt || null,
                milestone: issue.milestone?.title || null,
                title: issue.title
            };
        }
        return newMetadata;
    }

    /**
     * Scans local issue files for changes and pushes them to GitHub.
     * @param {object} metadata
     * @private
     */
    async #pushToGitHub(metadata) {
        logger.info('📤 Checking for local changes to push...');
        if (!metadata.last_sync) {
            logger.info('✨ No previous sync found, skipping push.');
            return;
        }

        const localFiles = await this.#scanLocalFiles();
        let pushedCount = 0;

        for (const filePath of localFiles) {
            const stats = await fs.stat(filePath);
            if (stats.mtime > new Date(metadata.last_sync)) {
                const content = await fs.readFile(filePath, 'utf-8');
                const parsed = matter(content);
                const issueNumber = parsed.data.id;

                if (!issueNumber) continue;

                logger.info(`📝 Local changes detected for #${issueNumber}`);

                try {
                    const bodyWithoutComments = parsed.content.split('## Comments')[0].trim();
                    const titleMatch = bodyWithoutComments.match(/^#\s+(.+)$/m);
                    const title = titleMatch ? titleMatch[1] : parsed.data.title;

                    const cleanBody = bodyWithoutComments
                        .replace(/^#\s+.+$/m, '')
                        .replace(/^\*\*Reported by:\*\*.+$/m, '')
                        .trim();

                    const bodyFilePath = path.join(path.dirname(filePath), `${issueNumber}.body.tmp`);
                    await fs.writeFile(bodyFilePath, cleanBody, 'utf-8');

                    await this.#ghCommand(`issue edit ${issueNumber} --title "${title.replace(/"/g, '\\"')}" --body-file "${bodyFilePath}"`, false);

                    await fs.unlink(bodyFilePath);

                    logger.info(`✅ Updated GitHub issue #${issueNumber}`);
                    pushedCount++;
                } catch (e) {
                    logger.warn(`⚠️ Could not push changes for #${issueNumber}. Issue may not exist on GitHub.`);
                }
            }
        }

        metadata.pushedCount = pushedCount;
        if (pushedCount > 0) {
            logger.info(`📤 Pushed ${pushedCount} local change(s) to GitHub`);
        } else {
            logger.info('✨ No local changes to push');
        }
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
