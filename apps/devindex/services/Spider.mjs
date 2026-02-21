import Base    from '../../../src/core/Base.mjs';
import config  from './config.mjs';
import GitHub  from './GitHub.mjs';
import Storage from './Storage.mjs';

/**
 * @summary The Spider (Discovery Engine) - A Multi-Strategy Graph Crawler.
 *
 * The Spider is responsible for expanding the DevIndex user index by discovering new candidates on GitHub.
 * Unlike simple scrapers, it employs a **"Random Walk"** architecture to avoid "Filter Bubbles" (repeatedly
 * scanning the same top 100 repositories).
 *
 * **Discovery Strategies (Weighted):**
 * 1.  **Network Walker (30%):** The primary engine. Picks a random qualified user from our index and traverses
 *     their "following" graph. This "Depth-First" approach finds high-quality engineers who may not have
 *     massively starred repos but are respected by their peers.
 * 2.  **Core: High Stars (25%):** Scans repositories with high star counts, using **Dynamic Range Slicing**
 *     to bypass GitHub's 1000-result search limit.
 * 3.  **Discovery: Keyword (20%):** Performs a "Dictionary Attack" using developer-centric keywords.
 * 4.  **Discovery: Temporal (15%):** Finds "hidden gems" from specific historical time windows.
 * 5.  **Community / Stargazer (10%):** Niche strategies for diversity and repository-graph traversal.
 *
 * @class DevIndex.services.Spider
 * @extends Neo.core.Base
 * @singleton
 */
class Spider extends Base {
    static config = {
        /**
         * @member {String} className='DevIndex.services.Spider'
         * @protected
         */
        className: 'DevIndex.services.Spider',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Dictionary for random keyword search.
     * @member {String[]} keywords
     * @protected
     * @static
     */
    static keywords = [
        'algorithm', 'analytics', 'api', 'architecture', 'audio', 'automation',
        'benchmark', 'blockchain', 'browser', 'build', 'cache', 'canvas',
        'cli', 'compiler', 'component', 'concurrency', 'crypto', 'data',
        'database', 'debugger', 'design', 'distributed', 'editor', 'emulator',
        'engine', 'framework', 'frontend', 'game', 'geometry', 'graphics',
        'grid', 'gui', 'image', 'kernel', 'language', 'library',
        'linux', 'machine-learning', 'mathematics', 'middleware', 'mobile',
        'network', 'neural', 'operating-system', 'optimization', 'parser',
        'performance', 'physics', 'platform', 'protocol', 'realtime',
        'renderer', 'runtime', 'security', 'server', 'simulation',
        'state-management', 'terminal', 'testing', 'tool', 'ui',
        'utility', 'video', 'virtual-machine', 'visualization', 'wasm', 'web'
    ]

    /**
     * Target organizations for Community Scan strategy.
     * @member {String[]} communityTargets
     * @protected
     * @static
     */
    static communityTargets = [
        'PyLadies', 'WomenWhoCode', 'RLadies', 'DjangoGirls',
        'RailsGirls', 'GirlDevelopIt', 'ladies-of-code'
    ]

    /**
     * Executes the Discovery Workflow.
     *
     * 1.  **State Loading:** Loads the `visited` cache and `blocklist`.
     * 2.  **Strategy Selection:** Uses a weighted random algorithm to pick a discovery method (Core, Keyword, Temporal, Stargazer, or Community).
     * 3.  **Execution:** Runs the selected strategy to find repositories.
     * 4.  **Extraction:** Scans found repositories for top contributors.
     * 5.  **Filtering:** Ignores bots, blocklisted users, and users already in the tracker.
     * 6.  **Persistence:** Saves new candidates to `tracker.json` (as pending) and updates `visited.json`.
     *
     * @param {String} [forcedStrategy] Optional strategy name to enforce (community, keyword, temporal, stargazer, search)
     * @returns {Promise<void>}
     */
    async run(forcedStrategy = null) {
        console.log('[Spider] Starting discovery run...');

        // 1. Load State
        const visited        = await Storage.getVisited();
        const blocklist      = await Storage.getBlocklist();
        const existingUsers  = await Storage.getTracker();
        const existingLogins = new Set(existingUsers.map(u => u.login.toLowerCase()));
        
        // Backpressure Valve: Abort if tracker backlog is too large
        const pendingCount = existingUsers.filter(u => u.lastUpdate === null).length;
        if (pendingCount >= config.spider.maxPendingUsers) {
            console.log(`[Spider] Backpressure Valve Triggered: Backlog (${pendingCount}) exceeds threshold (${config.spider.maxPendingUsers}).`);
            console.log(`[Spider] Aborting discovery run to let the Updater catch up.`);
            return;
        }

        const state = {
            visited,
            blocklist,
            existingLogins,
            newCandidates: new Set(),
            newVisited   : new Set(),
            totalFound   : 0
        };

        // 2. Pick Strategy
        const strategy = this.pickStrategy(existingUsers, forcedStrategy);
        console.log(`[Spider] Strategy Selected: ${strategy.name} (${strategy.description})`);

        // 3. Execute Strategy
        try {
            if (strategy.type === 'search') {
                await this.runSearch(strategy.query, state, strategy.sort, strategy.order);
            } else if (strategy.type === 'stargazer') {
                await this.runStargazer(strategy.username, state);
            } else if (strategy.type === 'network_walker') {
                await this.runNetworkWalker(strategy.username, state);
            } else if (strategy.type === 'community_scan') {
                await this.runCommunityScan(strategy.target, state);
            }
        } catch (error) {
            console.error('[Spider] Fatal error:', error);
        } finally {
            console.log('--------------------------------------------------');
            console.log(`[Spider] Run Complete.`);
            console.log(`[Spider] Total New Candidates Discovered: ${state.totalFound}`);
            console.log('--------------------------------------------------');
        }
    }

    /**
     * Selects a discovery strategy based on a weighted probability distribution.
     *
     * - **Network Walker (30%):** Traverses the social graph.
     * - **High Stars (25%):** Finds established projects but uses slicing to go deeper.
     * - **Keyword (20%):** Finds niche projects based on tech terms.
     * - **Temporal (15%):** Finds hidden gems from specific time periods.
     * - **Community (5%):** Scans diversity-focused organizations.
     * - **Stargazer (5%):** Traverses the repo graph.
     *
     * @param {Array} existingUsers The current list of tracked users (needed for Stargazer strategy).
     * @param {String} [forcedStrategy] Optional strategy name to enforce.
     * @returns {Object} Strategy definition object containing `type`, `query`, and `description`.
     */
    pickStrategy(existingUsers, forcedStrategy = null) {
        const rand = Math.random();

        // Handle Forced Strategy
        if (forcedStrategy) {
            switch (forcedStrategy) {
                case 'community':
                case 'community_scan':
                    // 50/50 Split for Forced Community Strategy
                    if (Math.random() < 0.5) {
                        const targetOrg = Spider.communityTargets[Math.floor(Math.random() * Spider.communityTargets.length)];
                        return {
                            name       : 'Discovery: Community Scan (Forced)',
                            description: `org:${targetOrg}`,
                            type       : 'community_scan',
                            target     : targetOrg
                        };
                    } else {
                        return this.getBioSignalStrategy();
                    }
                case 'keyword':
                    const keyword = Spider.keywords[Math.floor(Math.random() * Spider.keywords.length)];
                    return {
                        name       : 'Discovery: Keyword (Forced)',
                        description: `topic:${keyword}`,
                        type       : 'search',
                        query      : `topic:${keyword} stars:>50`
                    };
                case 'temporal':
                    const dateRange = this.getRandomDateRange();
                    return {
                        name       : 'Discovery: Temporal (Forced)',
                        description: `created:${dateRange}`,
                        type       : 'search',
                        query      : `created:${dateRange} stars:>50`
                    };
                case 'network_walker':
                    if (existingUsers.length > 0) {
                        const randomUser = existingUsers[Math.floor(Math.random() * existingUsers.length)];
                        return {
                            name       : 'Discovery: Network Walker (Forced)',
                            description: `following of ${randomUser.login}`,
                            type       : 'network_walker',
                            username   : randomUser.login
                        };
                    }
                    console.warn('[Spider] Cannot force Network Walker: No existing users. Falling back to Core.');
                    break;
                case 'stargazer':
                    if (existingUsers.length > 0) {
                        const randomUser = existingUsers[Math.floor(Math.random() * existingUsers.length)];
                        return {
                            name       : 'Discovery: Stargazer Leap (Forced)',
                            description: `user:${randomUser.login}`,
                            type       : 'stargazer',
                            username   : randomUser.login
                        };
                    }
                    console.warn('[Spider] Cannot force Stargazer: No existing users. Falling back to Core.');
                    break;
                case 'search':
                default:
                    // Fall through to Core High Stars logic below
                    break;
            }
        }

        // 25% Chance: Core High Stars (Dynamic Ranges)
        if (forcedStrategy === 'search' || rand < 0.25) {
            // Pick a random lower bound to slice the high-star spectrum
            // Range: minStars (1000) to 20000.
            // Using Math.pow(Math.random(), 3) creates a power-law distribution
            // skewing heavily towards the dense 1k-5k range, saving API quota.
            const minStars     = config.github.minStars;
            const randomOffset = Math.floor(Math.pow(Math.random(), 3) * 19000);
            const lowerBound   = minStars + randomOffset;
            const upperBound   = lowerBound + 1000 + Math.floor(Math.random() * 2000); // 1000-3000 width

            return {
                name       : 'Core: High Stars (Sliced)',
                description: `stars:${lowerBound}..${upperBound}`,
                type       : 'search',
                query      : `stars:${lowerBound}..${upperBound}`
            };
        }

        // 20% Chance: Dictionary Attack (Cumulative: 45%)
        if (rand < 0.45) {
            const keyword = Spider.keywords[Math.floor(Math.random() * Spider.keywords.length)];
            return {
                name       : 'Discovery: Keyword',
                description: `topic:${keyword}`,
                type       : 'search',
                query      : `topic:${keyword} stars:>50` // Lower threshold for topics
            };
        }

        // 15% Chance: Temporal Slicing (Cumulative: 60%)
        if (rand < 0.60) {
            const dateRange = this.getRandomDateRange();
            return {
                name       : 'Discovery: Temporal',
                description: `created:${dateRange}`,
                type       : 'search',
                query      : `created:${dateRange} stars:>50`
            };
        }

        // 30% Chance: Network Walker (Social Graph) (Cumulative: 90%)
        if (rand < 0.90) {
            if (existingUsers.length > 0) {
                const randomUser = existingUsers[Math.floor(Math.random() * existingUsers.length)];
                return {
                    name       : 'Discovery: Network Walker',
                    description: `following of ${randomUser.login}`,
                    type       : 'network_walker',
                    username   : randomUser.login
                };
            }
        }

        // 5% Chance: Community Scan (Cumulative: 95%)
        if (rand < 0.95) {
            // 50/50 Split between Org Scan and Bio-Signal Search
            if (Math.random() < 0.5) {
                const targetOrg = Spider.communityTargets[Math.floor(Math.random() * Spider.communityTargets.length)];
                return {
                    name       : 'Discovery: Community Scan',
                    description: `org:${targetOrg}`,
                    type       : 'community_scan',
                    target     : targetOrg
                };
            } else {
                return this.getBioSignalStrategy();
            }
        }

        // 5% Chance: Stargazer Leap (Remaining 5%)
        if (existingUsers.length > 0) {
            const randomUser = existingUsers[Math.floor(Math.random() * existingUsers.length)];
            return {
                name       : 'Discovery: Stargazer Leap',
                description: `user:${randomUser.login}`,
                type       : 'stargazer',
                username   : randomUser.login
            };
        }

        // Fallback: Bio Signals
        return this.getBioSignalStrategy();
    }

    /**
     * Generates a Bio-Signal Search Strategy with dynamic sorting to improve coverage.
     * @returns {Object}
     */
    getBioSignalStrategy() {
        const sorts = ['stars', 'forks', 'updated'];
        const sort  = sorts[Math.floor(Math.random() * sorts.length)];
        const order = Math.random() < 0.5 ? 'desc' : 'asc';

        return {
            name       : 'Discovery: Bio Signals',
            description: `topic search (sort:${sort}-${order})`,
            type       : 'search',
            sort       : sort,
            order      : order,
            // Using broad keyword search with OR as it covers topics and descriptions reliably
            query: `women-in-tech+OR+pyladies+OR+django-girls+OR+rails-girls`
        };
    }

    /**
     * Generates a random date range within the last 10 years.
     * @returns {String} "YYYY-MM-DD..YYYY-MM-DD"
     */
    getRandomDateRange() {
        const startYear = 2015;
        const endYear   = 2025;
        const year      = Math.floor(Math.random() * (endYear - startYear + 1)) + startYear;
        const month     = Math.floor(Math.random() * 12) + 1;

        // Get a random week start
        const day = Math.floor(Math.random() * 20) + 1; // 1-20 to be safe

        const dateStart = new Date(year, month - 1, day);
        const dateEnd   = new Date(year, month - 1, day + 7);

        const fmt = d => d.toISOString().split('T')[0];
        return `${fmt(dateStart)}..${fmt(dateEnd)}`;
    }

    /**
     * Executes a Community Scan strategy.
     * Scans public members and repository contributors of a target organization.
     * @param {String} targetOrg
     * @param {Object} state
     */
    async runCommunityScan(targetOrg, state) {
        if (GitHub.rateLimit.core.remaining < 50) {
             this.logRateLimit('Skipping Community Scan', 'core');
             return;
        }

        console.log(`[Spider] 👩‍💻 Scanning Community Cluster: ${targetOrg}`);
        const { newCandidates, existingLogins, blocklist } = state;

        try {
            // 1. Get Org Members (High signal)
            console.log(`[Spider] Fetching members for ${targetOrg}...`);
            let members = [];

            try {
                members = await GitHub.rest(`orgs/${targetOrg}/public_members?per_page=100`);
            } catch (memberError) {
                // Fallback: If it's not an Org, it might be a user account (e.g. some communities operate as Users)
                if (memberError.message.includes('404')) {
                    console.warn(`[Spider] ${targetOrg} is not an Org. Trying as User...`);
                    // There is no "members" for users, but we can check their following or starred
                    // For now, let's treat it as a Stargazer run if it's a User
                    await this.runStargazer(targetOrg, state);
                    return;
                }
                throw memberError;
            }

            if (Array.isArray(members)) {
                for (const member of members) {
                    const login = member.login;
                    const lowerLogin = login.toLowerCase();
                    if (!blocklist.has(lowerLogin) && !existingLogins.has(lowerLogin)) {
                        newCandidates.add(login);
                    }
                }
                console.log(`[Spider] Found ${members.length} members.`);
            }

            // 2. Get Contributors to their main repos
            console.log(`[Spider] Fetching top repos for ${targetOrg}...`);
            const repos = await GitHub.rest(`orgs/${targetOrg}/repos?sort=updated&per_page=5`);

            if (Array.isArray(repos) && repos.length > 0) {
                await this.processRepositories(repos, state);
            }

            await this.saveCheckpoint(state);

        } catch (e) {
             console.error(`[Spider] Community Scan failed for ${targetOrg}: ${e.message}`);
        }
    }

    /**
     * Executes a search-based discovery strategy.
     * @param {String} query
     * @param {Object} state
     * @param {String} [sort='stars']
     * @param {String} [order='desc']
     */
    async runSearch(query, state, sort = 'stars', order = 'desc') {
        const maxPages = 3; // Reduced from 5 to avoid quota burnout on random walks

        console.log(`[Spider] Search Query: ${query} (Sort: ${sort} ${order})`);

        for (let page = 1; page <= maxPages; page++) {
            if (GitHub.rateLimit.search.remaining < 2) { // 2 is safer than 0 for search
                this.logRateLimit('Stopping search', 'search');
                break;
            }

            console.log(`[Spider] Fetching page ${page}...`);
            const searchRes = await GitHub.rest(`search/repositories?q=${query}&sort=${sort}&order=${order}&per_page=${config.github.perPage}&page=${page}`);

            if (!searchRes || !searchRes.items || searchRes.items.length === 0) {
                console.log('[Spider] No more results.');
                break;
            }

            await this.processRepositories(searchRes.items, state);
            await this.saveCheckpoint(state);
        }
    }

    /**
     * Executes a Network Walker strategy.
     * Scans the 'following' list of a target user to find their network.
     * @param {String} username
     * @param {Object} state
     */
    async runNetworkWalker(username, state) {
        if (GitHub.rateLimit.core.remaining < 50) {
             this.logRateLimit('Skipping Network Walker run', 'core');
             return;
        }

        console.log(`[Spider] 🕸️ Walking network of ${username}...`);
        const { newCandidates, existingLogins, blocklist } = state;

        try {
            // Fetch following (up to 100)
            const following = await GitHub.rest(`users/${username}/following?per_page=100`);

            if (Array.isArray(following)) {
                for (const user of following) {
                    // STRICT FILTER: Only index real users, not Organizations or Bots
                    if (user.type !== 'User') continue;

                    const login = user.login;
                    const lowerLogin = login.toLowerCase();

                    if (!blocklist.has(lowerLogin) && !existingLogins.has(lowerLogin)) {
                        newCandidates.add(login);
                    }
                }
                console.log(`[Spider] Found ${following.length} following, ${newCandidates.size} new candidates.`);
            }

            await this.saveCheckpoint(state);

        } catch (e) {
             console.error(`[Spider] Network Walker failed for ${username}: ${e.message}`);
        }
    }

    /**
     * Executes a stargazer leap strategy.
     * @param {String} username
     * @param {Object} state
     */
    async runStargazer(username, state) {
        if (GitHub.rateLimit.core.remaining < 50) {
             this.logRateLimit('Skipping Stargazer run', 'core');
             return;
        }

        console.log(`[Spider] Fetching starred repos for ${username}...`);

        // Fetch recent stars (first page only)
        const repos = await GitHub.rest(`users/${username}/starred?per_page=${config.github.perPage}`);

        if (!repos || repos.length === 0) {
            console.log('[Spider] User has no starred repos.');
            return;
        }

        await this.processRepositories(repos, state);
        await this.saveCheckpoint(state);
    }

    /**
     * Processes a list of repositories to extract contributors.
     * @param {Array} repos
     * @param {Object} state
     */
    async processRepositories(repos, state) {
        const { visited, newVisited, blocklist, existingLogins, newCandidates } = state;

        console.log(`[Spider] Processing ${repos.length} repositories...`);

        for (const repo of repos) {
            // Rate Limit Check
            if (GitHub.rateLimit.core.remaining < 50) {
                this.logRateLimit('Stopping repo processing', 'core');
                break;
            }

            const repoKey = `repo:${repo.full_name}`;

            if (visited.has(repoKey)) {
                // Skip silently
                continue;
            }

            newVisited.add(repoKey);
            process.stdout.write(`  Scanning ${repo.full_name}... `);

            const contributors = await this.fetchContributors(repo.full_name);
            let addedCount = 0;

            for (const login of contributors) {
                const lowerLogin = login.toLowerCase();

                if (blocklist.has(lowerLogin)) continue;
                if (login.includes('[bot]')) continue;
                if (existingLogins.has(lowerLogin)) continue;

                if (!newCandidates.has(login)) {
                    newCandidates.add(login);
                    addedCount++;
                }
            }
            console.log(`Found ${contributors.length} contributors, ${addedCount} new.`);
        }
    }

    /**
     * Helper to save partial results.
     * @param {Object} state
     */
    async saveCheckpoint(state) {
        const { newCandidates, newVisited, visited } = state;

        if (newCandidates.size > 0) {
            console.log(`[Spider] Checkpoint: Discovered ${newCandidates.size} new candidates. (API Quota: ${GitHub.rateLimit.core.remaining})`);
            const updates = Array.from(newCandidates).map(login => ({
                login,
                lastUpdate: null // Null means "never updated", high priority for Updater
            }));

            await Storage.updateTracker(updates);

            // Track total
            state.totalFound = (state.totalFound || 0) + newCandidates.size;

            newCandidates.clear();
        }

        if (newVisited.size > 0) {
            await Storage.updateVisited(newVisited);
            newVisited.forEach(item => visited.add(item));
            newVisited.clear();
        }
    }

    /**
     * Logs the critical rate limit warning with estimated recovery time.
     * @param {String} context - The context of the operation (e.g. "Stopping search")
     * @param {String} [bucketName='core'] - The rate limit bucket to check ('core' or 'search')
     * @private
     */
    logRateLimit(context, bucketName = 'core') {
        const { remaining, reset } = GitHub.rateLimit[bucketName];
        const now = Math.floor(Date.now() / 1000);
        let recoveryMsg = '';

        if (reset) {
            const minutes = Math.ceil((reset - now) / 60);
            recoveryMsg = ` Recovers in ~${minutes} minutes.`;
        }

        console.warn(`[Spider] RATE LIMIT CRITICAL (${bucketName}): ${remaining}. ${context}.${recoveryMsg}`);
    }

    /**
     * Fetches the top 10 contributors for a given repository.
     *
     * Filters the results to ensure only real users (type 'User') are returned, ignoring Organizations or Bots.
     *
     * @param {String} fullName The full repository name ("owner/repo").
     * @returns {Promise<String[]>} Array of contributor login names.
     * @private
     */
    async fetchContributors(fullName) {
        try {
            // Fetch top 10 contributors
            const limit = 10;
            const res = await GitHub.rest(`repos/${fullName}/contributors?per_page=${limit}`);

            if (!Array.isArray(res)) return [];

            return res
                .filter(c => c.type === 'User')
                .map(c => c.login);
        } catch (e) {
            // Kill-switch for rate limits
            if (e.message.includes('403') || e.message.includes('rate limit')) {
                console.warn(`[Spider] 🚨 Rate limit hit scanning ${fullName}. Forcing shutdown.`);
                GitHub.rateLimit.core.remaining = 0;
            }

            console.error(`[Spider] Failed to fetch contributors for ${fullName}: ${e.message}`);
            return [];
        }
    }
}

export default Neo.setupClass(Spider);
