import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Base from '../../../src/core/Base.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

/**
 * Default configuration object for the DevIndex Backend Services.
 */
const defaultConfig = {
    /**
     * The root directory of the project.
     * @type {string}
     */
    projectRoot,

    /**
     * GitHub API Configuration
     */
    github: {
        /**
         * Minimum stars for repository discovery.
         * @type {number}
         */
        minStars: 1000,
        /**
         * Minimum total contributions to be included in the DevIndex index.
         * @type {number}
         */
        minTotalContributions: 1000,
        /**
         * Number of items per page for API requests.
         * @type {number}
         */
        perPage: 30,
        /**
         * Request timeout in milliseconds.
         * @type {number}
         */
        timeout: 10000,
        /**
         * Maximum number of users to keep in the index.
         * @type {number}
         */
        maxUsers: 50000
    },

    /**
     * Spider (Discovery) Configuration
     */
    spider: {
        /**
         * How many users to process in one run.
         * @type {number}
         */
        batchSize: 50,
        /**
         * Maximum depth for crawling (if applicable).
         * @type {number}
         */
        maxDepth: 2
    },

    /**
     * Updater (Enrichment) Configuration
     */
    updater: {
        /**
         * Number of users to process before saving a checkpoint.
         * @type {number}
         */
        saveInterval: 10
    },

    /**
     * Data Paths
     */
    paths: {
        /**
         * The main rich data store for the frontend (formerly data.json).
         * Contains full profiles, contributions, etc.
         * @type {string}
         */
        users: path.resolve(projectRoot, 'apps/devindex/resources/users.jsonl'),
        
        /**
         * The backend discovery index (formerly users.json).
         * Contains login, id, lastUpdate timestamp.
         * Used for prioritizing updates.
         * @type {string}
         */
        tracker: path.resolve(projectRoot, 'apps/devindex/resources/tracker.json'),

        /**
         * Tracks visited resources (repos, users) to prevent cycles.
         * @type {string}
         */
        visited: path.resolve(projectRoot, 'apps/devindex/resources/visited.json'),

        /**
         * List of excluded usernames (bots, banned users).
         * @type {string}
         */
        blacklist: path.resolve(projectRoot, 'apps/devindex/resources/blacklist.json'),

        /**
         * List of users to always track, ignoring thresholds.
         * @type {string}
         */
        whitelist: path.resolve(projectRoot, 'apps/devindex/resources/whitelist.json'),

        /**
         * List of users who failed update processing (Penalty Box).
         * @type {string}
         */
        failed: path.resolve(projectRoot, 'apps/devindex/resources/failed.json'),

        /**
         * Stores the minimum total contributions required to enter the index.
         * @type {string}
         */
        threshold: path.resolve(projectRoot, 'apps/devindex/resources/threshold.json')
    }
};

/**
 * @summary Configuration Manager for the DevIndex Backend Pipeline.
 *
 * This class provides a centralized, read-only configuration interface for all backend services.
 * It defines critical constants for the GitHub API (rate limits, timeouts), the discovery algorithms
 * (spider depth, batch size), and the file system paths for data persistence.
 *
 * **Architecture Note:**
 * This class uses a `Proxy` pattern to expose the `data` object properties directly on the default export,
 * providing a cleaner API for consumers (e.g., `config.github.minStars` instead of `config.data.github.minStars`).
 *
 * @class DevIndex.services.Config
 * @extends Neo.core.Base
 * @singleton
 */
class Config extends Base {
    static config = {
        /**
         * @member {String} className='DevIndex.services.Config'
         * @protected
         */
        className: 'DevIndex.services.Config',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * The current configuration object.
     * @member {Object} data
     */
    data = null;

    /**
     * Initializes the configuration object.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.data = Neo.clone(defaultConfig, true);
    }
}

const instance = Neo.setupClass(Config);

export default new Proxy(instance, {
    get(target, prop, receiver) {
        // 1. Prefer properties/methods on the instance itself
        if (Reflect.has(target, prop)) {
            return Reflect.get(target, prop, receiver);
        }
        // 2. Fallback to the data object
        return target.data[prop];
    }
});
