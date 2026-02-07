import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Base from '../../../src/core/Base.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

/**
 * Default configuration object for the DevRank Backend Services.
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
         * Number of items per page for API requests.
         * @type {number}
         */
        perPage: 30,
        /**
         * Request timeout in milliseconds.
         * @type {number}
         */
        timeout: 10000
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
     * Data Paths
     */
    paths: {
        /**
         * The main rich data store for the frontend.
         * Contains full profiles, contributions, etc.
         * @type {string}
         */
        data: path.resolve(projectRoot, 'apps/devrank/resources/data.json'),
        
        /**
         * The lightweight user index.
         * Contains login, id, lastUpdate timestamp.
         * Used for prioritizing updates.
         * @type {string}
         */
        users: path.resolve(projectRoot, 'apps/devrank/resources/users.json'),

        /**
         * Tracks visited resources (repos, users) to prevent cycles.
         * @type {string}
         */
        visited: path.resolve(projectRoot, 'apps/devrank/resources/visited.json'),

        /**
         * List of excluded usernames (bots, banned users).
         * @type {string}
         */
        blacklist: path.resolve(projectRoot, 'apps/devrank/resources/blacklist.json')
    }
};

/**
 * @summary Configuration manager for the DevRank Backend.
 *
 * Centralizes configuration for paths, API settings, and limits.
 * Supports loading custom overrides if needed.
 *
 * @class DevRank.services.Config
 * @extends Neo.core.Base
 * @singleton
 */
class Config extends Base {
    static config = {
        /**
         * @member {String} className='DevRank.services.Config'
         * @protected
         */
        className: 'DevRank.services.Config',
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
