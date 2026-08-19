import fs                from 'fs/promises';
import path              from 'path';
import { fileURLToPath } from 'url';
import Base              from '../../../src/core/Base.mjs';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
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
         * GraphQL points kept untouched for the downstream label-index rebuild.
         *
         * GitHub Actions' repository `GITHUB_TOKEN` currently receives a 1,000-point GraphQL
         * window, while a future GitHub App can receive a larger one. A fixed 100-point reserve
         * protects the small downstream query in either posture without treating the limit as 5,000.
         * @type {number}
         */
        graphqlDownstreamReserve: 100,
        /**
         * Maximum primary GraphQL points reserved while one user is in flight.
         *
         * The bound covers a profile request plus the oldest observed DevIndex history (2007)
         * split into four-year windows, every window falling back once to single years, and rename
         * recovery margin. Unused points are released after the user settles; response-reported
         * `cost` and `remaining` still determine later admission.
         * @type {number}
         */
        graphqlUserReservation: 32,
        /**
         * Request timeout in milliseconds.
         * @type {number}
         */
        timeout: 10000,
        /**
         * Maximum number of users to keep in the index.
         *
         * **Rationale:** A 50,000 user cap results in a ~20MB `users.jsonl` file. While the file is gzipped
         * and streamed over the network, allowing the index to grow unbounded (e.g., 100k users / ~40MB)
         * would introduce significant client-side memory constraints and parsing overhead, eventually degrading
         * the application's responsiveness. The cap ensures the app remains fast and "fun to use" while forcing
         * a "Meritocracy" where only the most active developers remain in the index.
         *
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
        maxDepth: 2,
        /**
         * Backpressure Valve: If the tracker backlog of pending users (`lastUpdate: null`)
         * exceeds this amount, the Spider will abort its run to let the Updater catch up.
         * @type {number}
         */
        maxPendingUsers: 2000
    },

    /**
     * Updater (Enrichment) Configuration
     */
    updater: {
        /**
         * Maximum number of users processed concurrently after GraphQL budget admission.
         * @type {number}
         */
        concurrency: 8,
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
        users: path.resolve(projectRoot, 'apps/devindex/resources/data/users.jsonl'),

        /**
         * The backend discovery index (formerly users.json).
         * Contains login, id, lastUpdate timestamp.
         * Used for prioritizing updates.
         * @type {string}
         */
        tracker: path.resolve(projectRoot, 'apps/devindex/resources/data/tracker.json'),

        /**
         * Tracks visited resources (repos, users) to prevent cycles.
         * @type {string}
         */
        visited: path.resolve(projectRoot, 'apps/devindex/resources/data/visited.json'),

        /**
         * List of excluded usernames (bots, banned users).
         * @type {string}
         */
        blocklist: path.resolve(projectRoot, 'apps/devindex/resources/data/blocklist.json'),

        /**
         * List of users to always track, ignoring thresholds.
         * @type {string}
         */
        allowlist: path.resolve(projectRoot, 'apps/devindex/resources/data/allowlist.json'),

        /**
         * List of users who failed update processing (Penalty Box).
         * @type {string}
         */
        failed: path.resolve(projectRoot, 'apps/devindex/resources/data/failed.json'),

        /**
         * Stores the minimum total contributions required to enter the index.
         * @type {string}
         */
        threshold: path.resolve(projectRoot, 'apps/devindex/resources/data/threshold.json'),

        /**
         * State tracking for the Opt-Out service (last processed timestamp).
         * @type {string}
         */
        optoutSync: path.resolve(projectRoot, 'apps/devindex/resources/data/optout-sync.json'),

        /**
         * State tracking for the Opt-In service (last processed timestamp).
         * @type {string}
         */
        optinSync: path.resolve(projectRoot, 'apps/devindex/resources/data/optin-sync.json'),

        /**
         * Provenance for the last index this pipeline published: a SHA-256 over the exact bytes
         * written, plus line count, byte length and timestamp. Small, and deliberately tracked in git
         * even though the index it describes is on its way out of git — it is the trusted anchor a
         * fetched artifact is checked against, so it must live somewhere the artifact cannot
         * influence.
         *
         * A content digest rather than the served `ETag`, which an earlier draft of this comment
         * claimed: an `ETag` is host-assigned and survives neither recompression nor a CDN swap, so
         * it answers *is this the same response* where this needs *is this the same content*.
         * @type {string}
         */
        indexProvenance: path.resolve(projectRoot, 'apps/devindex/resources/data/index-provenance.json')
    },

    /**
     * The published index, read rather than re-derived.
     *
     * The Data Factory used to obtain its previous state from whatever `actions/checkout` placed in
     * the working tree, which is why it needed a clone of a multi-gigabyte repository to reach one
     * file it only ever reads the tip of. The browser has always read this file over HTTPS from the
     * deployed site; only the producer read it from git. This block moves the producer onto the
     * consumer's path.
     */
    publishedIndex: {
        /**
         * Absolute URL of the deployed index. Declared once and read at the use site — the host is
         * never reassembled from parts anywhere else.
         *
         * **Accepted risk, named rather than guarded: a fork reads production once, unverified.**
         * There is no environment override here, and no other value in this file reads one, so a fork
         * or staging deploy fetches the canonical index. On such a deployment `index-provenance.json`
         * is absent, which takes the absence branch — the branch that accepts the fetched bytes
         * without a digest to check them against — so upstream's contributor index is adopted as that
         * deployment's own prior state on its first run.
         *
         * Accepted here because the destination is a late binding for the whole extraction and a seam
         * invented now would encode a host layout that is about to change. It becomes wrong the moment
         * anyone runs this pipeline outside the canonical deployment, and that is the trigger for
         * adding the override rather than a reason to add it today.
         * @type {string}
         */
        url: 'https://neomjs.com/node_modules/neo.mjs/apps/devindex/resources/data/users.jsonl',

        /**
         * Request timeout in ms. Generous: the artifact is ~24 MB and a slow fetch that succeeds is
         * worth more than a fast fall back to the checkout, which is the path this exists to retire.
         * @type {number}
         */
        timeout: 120000
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
