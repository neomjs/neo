import Base        from '../../../../../src/core/Base.mjs';
import fs          from 'fs/promises';
import matter      from 'gray-matter';
import path        from 'path';
import {exec}      from 'child_process';
import {promisify} from 'util';

const execAsync = promisify(exec);

const metadataPath = path.resolve(process.cwd(), '.github', '.sync-metadata.json');
const issuesDir    = path.resolve(process.cwd(), '.github', 'ISSUES');
const archiveDir   = path.resolve(process.cwd(), '.github', 'ISSUE_ARCHIVE');

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
        singleton: true,
        /**
         * @member {String[]} droppedLabels=['dropped', 'wontfix', 'duplicate']
         * @protected
         */
        droppedLabels: ['dropped', 'wontfix', 'duplicate'],
        /**
         * Defines the release schedule for archiving. Newest first.
         * @member {Object[]} releases
         * @protected
         */
        releases: [
            { version: 'v11.0', cutoffDate: '2025-11-01' },
            { version: 'v10.9', cutoffDate: '2025-08-01' },
            { version: 'v10.8', cutoffDate: '2025-05-01' },
        ]
    }

    /**
     * The main sync orchestration logic.
     * @returns {Promise<object>}
     */
    async runFullSync() {
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
            console.error(`Error executing: gh ${cmd}`);
            console.error(error.stderr || error.message);
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

        const isDropped = this.droppedLabels.some(label => labels.includes(label));
        if (isDropped) {
            return null; // Dropped issues are not stored locally.
        }

        if (issue.state === 'OPEN') {
            return path.join(issuesDir, `${number}.md`);
        }

        if (issue.state === 'CLOSED') {
            const closed = new Date(issue.closedAt);
            let version = this.releases[this.releases.length - 1]?.version || 'unknown';

            if (issue.milestone?.title) {
                version = issue.milestone.title;
            } else {
                for (const release of this.releases) {
                    if (closed >= new Date(release.cutoffDate)) {
                        version = release.version;
                        break;
                    }
                }
            }
            return path.join(archiveDir, version, `${number}.md`);
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
            const data = await fs.readFile(metadataPath, 'utf-8');
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
        console.log('📥 Fetching issues from GitHub...');
        const allIssues = await this.#ghCommand('issue list --limit 10000 --state all --json number,title,state,labels,assignees,milestone,createdAt,updatedAt,closedAt,url,author,body');
        console.log(`Found ${allIssues.length} issues`);

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
                        console.log(`🗑️ Removed dropped issue #${issueNumber}: ${oldPath}`);
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
                        console.log(`📦 Moved #${issueNumber}: ${oldIssue.path} → ${targetPath}`);
                    } catch (e) { /* Old file might not exist */ }
                } else {
                    console.log(`✅ Updated #${issueNumber}: ${targetPath}`);
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
        console.log('📤 Checking for local changes to push...');
        if (!metadata.last_sync) {
            console.log('✨ No previous sync found, skipping push.');
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

                console.log(`📝 Local changes detected for #${issueNumber}`);

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

                    console.log(`✅ Updated GitHub issue #${issueNumber}`);
                    pushedCount++;
                } catch (e) {
                    console.warn(`⚠️ Could not push changes for #${issueNumber}. Issue may not exist on GitHub.`);
                }
            }
        }

        metadata.pushedCount = pushedCount;
        if (pushedCount > 0) {
            console.log(`📤 Pushed ${pushedCount} local change(s) to GitHub`);
        } else {
            console.log('✨ No local changes to push');
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

        await scanDir(issuesDir);
        await scanDir(archiveDir);

        return localFiles;
    }

    /**
     * Saves the synchronization metadata to disk.
     * @param {object} metadata
     * @returns {Promise<void>}
     * @private
     */
    async #saveMetadata(metadata) {
        const dir = path.dirname(metadataPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    }
}

export default Neo.setupClass(SyncService);