import fs   from 'fs/promises';
import path from 'path';
import Base from '../../../../src/core/Base.mjs';

/**
 * Default configuration object.
 * Defines the structure and default values for the server configuration.
 */
const defaultConfig = {
    /**
     * Global debug flag for all MCP servers.
     * @type {boolean}
     */
    debug: false,
    /**
     * A dummy embedding function to satisfy the ChromaDB API when embeddings are provided manually.
     * @returns {null}
     */
    dummyEmbeddingFunction: {
        generate: () => null
    },
    /**
     * Cache duration for healthy health checks (in milliseconds).
     * Unhealthy results are never cached.
     * @type {number}
     */
    healthCheckCacheDuration: 5 * 60 * 1000, // 5 minutes
    /**
     * The minimum required version of the GitHub CLI (`gh`).
     * @type {string}
     */
    minGhVersion: '2.0.0',
    /**
     * The owner of the GitHub repository.
     * @type {string}
     */
    owner: 'neomjs',
    /**
     * The name of the GitHub repository.
     * @type {string}
     */
    repo: 'neo',
    /**
     * Configuration for the issue synchronization service.
     */
    issueSync: {
        /**
         * The path to the directory for active issues.
         * @type {string}
         */
        issuesDir: path.resolve(process.cwd(), '.github', 'ISSUE'),
        /**
         * The path to the directory for archived issues.
         * @type {string}
         */
        archiveDir: path.resolve(process.cwd(), '.github', 'ISSUE_ARCHIVE'),
        /**
         * The path to the synchronization metadata file.
         * @type {string}
         */
        metadataFile: path.resolve(process.cwd(), '.github', '.sync-metadata.json'),
        /**
         * Labels that, when present on an issue, will cause it to be ignored and deleted locally.
         * @type {string[]}
         */
        droppedLabels: ['dropped', 'wontfix', 'duplicate'],
        /**
         * The date from which to start synchronizing issues and releases.
         * @type {string}
         */
        syncStartDate: '2025-06-15T00:00:00Z',
        /**
         * The path to the directory for release notes.
         * @type {string}
         */
        releaseNotesDir: path.resolve(process.cwd(), '.github', 'RELEASE_NOTES'),
        /**
         * The default version directory to use for archiving issues when no release is found.
         * @type {string}
         */
        defaultArchiveVersion: 'unversioned',
        /**
         * A prefix for issue filenames to prevent them from starting with a number (e.g., 'issue-').
         * @type {string}
         */
        issueFilenamePrefix: 'issue-',
        /**
         * A prefix for release note filenames (e.g., 'v').
         * @type {string}
         */
        releaseFilenamePrefix: 'v',
        /**
         * The maximum number of issues to fetch from the GitHub API in a single sync.
         * @type {number}
         */
        maxIssues: 10000,
        /**
         * The maximum number of releases to fetch from the GitHub API.
         * @type {number}
         */
        maxReleases: 1000,
        /**
         * The number of releases to fetch per page in GraphQL queries.
         * @type {number}
         */
        releaseQueryLimit: 50,
        /**
         * The maximum buffer size for the `gh` CLI command output.
         * @type {number}
         */
        maxGhOutputBuffer: 10 * 1024 * 1024, // 10 MB
        /**
         * The markdown delimiter used to separate the issue body from the comments section.
         * @type {string}
         */
        commentSectionDelimiter: '## Comments',
        /**
         * Maximum number of labels to fetch per issue in GraphQL queries.
         * @type {number}
         */
        maxLabelsPerIssue: 20,
        /**
         * Maximum number of labels to fetch for the entire repository in GraphQL queries.
         * @type {number}
         */
        maxRepoLabels: 100,
        /**
         * Maximum number of assignees to fetch per issue in GraphQL queries.
         * @type {number}
         */
        maxAssigneesPerIssue: 10,
        /**
         * Maximum number of comments to fetch per issue in GraphQL queries.
         * @type {number}
         */
        maxCommentsPerIssue: 100,
        /**
         * Maximum number of sub-issues to fetch per issue in GraphQL queries.
         * @type {number}
         */
        maxSubIssuesPerIssue: 50,
        /**
         * Maximum number of timeline items to fetch per issue in GraphQL queries.
         * @type {number}
         */
        maxTimelineItemsPerIssue: 50
    },
    /**
     * Configuration for pull request queries.
     */
    pullRequest: {
        /**
         * Default values for pull request queries.
         */
        defaults: {
            /**
             * The default number of pull requests to return.
             * @type {number}
             */
            limit: 30,
            /**
             * The default state of pull requests to list.
             * @type {string}
             */
            state: 'open'
        },
        /**
         * The maximum number of pull requests that can be fetched in a single API call.
         * @type {number}
         */
        maxLimit: 100,
        /**
         * Maximum number of comments to fetch per pull request in GraphQL queries.
         * @type {number}
         */
        maxCommentsPerPullRequest: 100
    }
};

/**
 * Configuration manager for the GitHub Workflow MCP server.
 * Supports loading configuration from a custom file and merging with defaults.
 * @class Neo.ai.mcp.server.github-workflow.Config
 * @extends Neo.core.Base
 * @singleton
 */
class Config extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.Config'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.Config',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * The current configuration object.
     * Starts with defaults and can be updated via load().
     * @member {Object} data
     */
    data = null;

    /**
     * Initializes the configuration object by deep cloning the defaults.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.data = Neo.clone(defaultConfig, true);
    }

    /**
     * Loads configuration from a JSON file and merges it with defaults.
     * @param {string} filePath - The path to the configuration file.
     * @returns {Promise<void>}
     */
    async load(filePath) {
        if (!filePath) return;

        try {
            const absolutePath = path.resolve(filePath);
            const ext          = path.extname(absolutePath);
            let   customConfig;

            if (ext === '.mjs' || ext === '.js') {
                const module = await import(absolutePath);
                customConfig = module.default;
            } else {
                const content = await fs.readFile(absolutePath, 'utf-8');
                customConfig  = JSON.parse(content);
            }

            // Deep merge custom config into the data object
            Neo.merge(this.data, customConfig);

            console.log(`[Config] Loaded custom configuration from ${absolutePath}`);

        } catch (error) {
            console.error(`[Config] Failed to load configuration from ${filePath}:`, error.message);
            throw error;
        }
    }
}

const instance = Neo.setupClass(Config);

export default new Proxy(instance, {
    get(target, prop, receiver) {
        // 1. Prefer properties/methods on the instance itself (e.g. load, className)
        if (Reflect.has(target, prop)) {
            return Reflect.get(target, prop, receiver);
        }
        // 2. Fallback to the data object (e.g. owner, repo)
        return target.data[prop];
    }
});
