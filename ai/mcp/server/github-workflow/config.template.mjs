import path            from 'path';
import {fileURLToPath} from 'url';
import BaseConfig, { createConfigProxy } from '../../../BaseConfig.mjs';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);

const packageRoot = path.resolve(__dirname, '../../../../');
const projectRoot = process.cwd() === '/' ? packageRoot : process.cwd();
const validLogLevels = ['error', 'warn', 'info', 'log', 'debug'];

function parseLogLevel(envVarName, {env = process.env, warn = console.warn} = {}) {
    const rawValue = env[envVarName];
    if (rawValue === undefined || rawValue === null || rawValue === '') return;
    const value = String(rawValue).trim().toLowerCase();

    if (validLogLevels.includes(value)) {
        return value;
    }

    warn(`[Config] Invalid ${envVarName} value: "${rawValue}" (must be one of: ${validLogLevels.join(', ')}); falling back.`);
    return undefined;
}

/**
 * Default configuration object.
 * Defines the structure and default values for the server configuration.
 */
const defaultConfig = {
    /**
     * The root directory of the project.
     * @type {string}
     */
    projectRoot,
    /**
     * Global debug flag for all MCP servers.
     * @type {boolean}
     */
    debug: false,
    /**
     * Minimum stderr log level for the GitHub workflow logger.
     * @type {string}
     */
    logLevel: 'warn',
    /**
     * @summary Shared MCP logger policy for GitHub Workflow.
     *
     * Priority-filtered stderr only. `debug: true` promotes the default `warn`
     * threshold to `debug`; no file sink is used for this workflow server.
     * @type {Object}
     */
    logger: {
        defaultLevel: 'warn',
        fileSink    : false,
        stderrMode  : 'threshold'
    },
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
     * Whether to automatically trigger a full sync when the server starts.
     * @type {boolean}
     */
    syncOnStartup: true,
    /**
     * Whether to automatically commit and push changes after a sync.
     * Only executes if the user has write permissions and there are non-metadata changes.
     * @type {boolean}
     */
    pushToRepoAfterSync: true,
    /**
     * Configuration for the issue synchronization service.
     */
    issueSync: {
        /**
         * The root directory for synced content.
         * @type {string}
         */
        contentRoot: path.resolve(projectRoot, 'resources/content'),
        /**
         * The path to the directory for active issues.
         * @type {string}
         */
        issuesDir: path.resolve(projectRoot, 'resources/content/issues'),
        /**
         * The root directory for version-based archives across all entities.
         * @type {string}
         */
        archiveRoot: path.resolve(projectRoot, 'resources/content/archive'),
        /**
         * The path to the directory for discussions.
         * @type {string}
         */
        discussionsDir: path.resolve(projectRoot, 'resources/content/discussions'),
        /**
         * The path to the directory for pull requests.
         * @type {string}
         */
        pullsDir: path.resolve(projectRoot, 'resources/content/pulls'),
        /**
         * The path to the synchronization metadata file.
         * @type {string}
         */
        metadataFile: path.resolve(projectRoot, 'resources/content/.sync-metadata.json'),
        /**
         * Labels that, when present on an issue, will cause it to be ignored and deleted locally.
         * @type {string[]}
         */
        droppedLabels: ['dropped', 'wontfix', 'duplicate'],
        /**
         * The date from which to start synchronizing issues and releases.
         * @type {string}
         */
        syncStartDate: '2025-01-01T00:00:00Z',
        /**
         * The path to the directory for release notes.
         * @type {string}
         */
        releaseNotesDir: path.resolve(projectRoot, 'resources/content/release-notes'),
        /**
         * A prefix for issue filenames to prevent them from starting with a number (e.g., 'issue-').
         * @type {string}
         */
        issueFilenamePrefix: 'issue-',
        /**
         * @member {String} discussionFilenamePrefix='discussion-'
         */
        discussionFilenamePrefix: 'discussion-',
        /**
         * A prefix for version-based archive directories (e.g., 'v' for 'v1.2.3').
         * Applies to both milestone titles and release tags.
         * @type {string}
         */
        versionDirectoryPrefix: 'v',
        /**
         * The maximum number of items per chunk directory in the archive.
         * @type {number}
         */
        archiveChunkThreshold: 100,
        /**
         * A prefix for archive chunk directories (e.g., 'chunk-').
         * @type {string}
         */
        archiveChunkPrefix: 'chunk-',
        /**
         * A prefix for release note filenames (e.g., 'v').
         * @type {string}
         */
        releaseFilenamePrefix: 'v',
        /**
         * The maximum number of issues to fetch from the GitHub API in a single sync.
         * Defensive ceiling against runaway pagination on a misconfigured GraphQL pageInfo while
         * leaving enough headroom for clean-slate exhaustive emission under ADR 0004. The local
         * droppedLabels filter further trims the actual processed set.
         * @type {number}
         */
        maxIssues: 20000,
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
         * Maximum number of sub-issues to fetch per issue in GraphQL queries.
         * @type {number}
         */
        maxSubIssuesPerIssue: 100,
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

const envBindings = {
    issueSync: {
        archiveRoot: 'NEO_MCP_GITHUB_ARCHIVE_ROOT'
    },
    logLevel: {var: 'NEO_LOG_LEVEL', parse: parseLogLevel}
};

/**
 * @summary Configuration manager for the GitHub Workflow MCP server.
 *
 * Supports loading configuration from a custom file and merging with defaults.
 * The configuration handles GitHub repository details, sync settings, and server behavior options.
 *
 * @class Neo.ai.mcp.server.github-workflow.Config
 * @extends Neo.ai.BaseConfig
 * @singleton
 */
class Config extends BaseConfig {
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
        singleton: true,
        /**
         * @member {Object} defaultConfig
         */
        defaultConfig,
        /**
         * @member {Object} envBindings
         */
        envBindings
    }
}
const instance = Neo.setupClass(Config);

export default createConfigProxy(instance);
