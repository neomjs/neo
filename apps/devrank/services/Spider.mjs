import Base from '../../../src/core/Base.mjs';
import config from './config.mjs';
import GitHub from './GitHub.mjs';
import Storage from './Storage.mjs';

/**
 * @summary The Spider (Discovery Engine) - A Multi-Strategy Graph Crawler.
 *
 * The Spider is responsible for expanding the DevRank user index by discovering new candidates on GitHub.
 * Unlike simple scrapers, it employs a **"Random Walk"** architecture to avoid "Filter Bubbles" (repeatedly
 * scanning the same top 100 repositories).
 *
 * **Discovery Strategies (Weighted):**
 * 1.  **Core: High Stars (40%):** Scans repositories with high star counts, but uses **Dynamic Range Slicing**
 *     (e.g., `stars:2000..3000`) to jump into the middle of the dataset and bypass GitHub's 1000-result search limit.
 * 2.  **Discovery: Keyword (30%):** Performs a "Dictionary Attack" using 60+ developer-centric keywords (e.g., "wasm",
 *     "compiler", "neural") to find niche experts in specific domains.
 * 3.  **Discovery: Temporal (20%):** Slices the last 10 years into random 1-week windows to find "hidden gems"
 *     created at specific times, regardless of their total star count.
 * 4.  **Discovery: Stargazer Leap (10%):** Picks a random user already in the index and scans their *starred repositories*,
 *     effectively traversing the social graph to find adjacent communities.
 *
 * @class DevRank.services.Spider
 * @extends Neo.core.Base
 * @singleton
 */
class Spider extends Base {
    static config = {
        /**
         * @member {String} className='DevRank.services.Spider'
         * @protected
         */
        className: 'DevRank.services.Spider',
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
        'RailsGirls', 'Outreachy', 'GirlDevelopIt', 'SheCodes',
        'ladies-of-code', 'womentechmakers'
    ]

    /**
     * Executes the Discovery Workflow.
     * 
     * 1.  **State Loading:** Loads the `visited` cache and `blacklist`.
     * 2.  **Strategy Selection:** Uses a weighted random algorithm to pick a discovery method (Core, Keyword, Temporal, Stargazer, or Community).
     * 3.  **Execution:** Runs the selected strategy to find repositories.
     * 4.  **Extraction:** Scans found repositories for top contributors.
     * 5.  **Filtering:** Ignores bots, blacklisted users, and users already in the tracker.
     * 6.  **Persistence:** Saves new candidates to `tracker.json` (as pending) and updates `visited.json`.
     *
     * @returns {Promise<void>}
     */
    async run() {
        console.log('[Spider] Starting discovery run...');

        // 1. Load State
        const visited = await Storage.getVisited();
        const blacklist = await Storage.getBlacklist();
        const existingUsers = await Storage.getTracker();
        const existingLogins = new Set(existingUsers.map(u => u.login.toLowerCase()));

        const state = {
            visited,
            blacklist,
            existingLogins,
            newCandidates: new Set(),
            newVisited: new Set(),
            totalFound: 0
        };

        // 2. Pick Strategy
        const strategy = this.pickStrategy(existingUsers);
        console.log(`[Spider] Strategy Selected: ${strategy.name} (${strategy.description})`);

        // 3. Execute Strategy
        try {
            if (strategy.type === 'search') {
                await this.runSearch(strategy.query, state);
            } else if (strategy.type === 'stargazer') {
                await this.runStargazer(strategy.username, state);
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
     * - **High Stars (35%):** Finds established projects but uses slicing to go deeper.
     * - **Keyword (25%):** Finds niche projects based on tech terms.
     * - **Temporal (15%):** Finds hidden gems from specific time periods.
     * - **Community (15%):** Scans diversity-focused organizations.
     * - **Stargazer (10%):** Traverses the social graph (requires existing users).
     * 
     * @param {Array} existingUsers The current list of tracked users (needed for Stargazer strategy).
     * @returns {Object} Strategy definition object containing `type`, `query`, and `description`.
     */
    pickStrategy(existingUsers) {
        const rand = Math.random();

        // 35% Chance: Core High Stars (Dynamic Ranges)
        if (rand < 0.35) {
            // Pick a random lower bound to slice the high-star spectrum
            // Range: minStars (1000) to 20000
            const minStars = config.github.minStars;
            const randomOffset = Math.floor(Math.random() * 19000); 
            const lowerBound = minStars + randomOffset;
            const upperBound = lowerBound + 1000 + Math.floor(Math.random() * 2000); // 1000-3000 width

            return {
                name: 'Core: High Stars (Sliced)',
                description: `stars:${lowerBound}..${upperBound}`,
                type: 'search',
                query: `stars:${lowerBound}..${upperBound}`
            };
        }

        // 25% Chance: Dictionary Attack
        if (rand < 0.60) {
            const keyword = Spider.keywords[Math.floor(Math.random() * Spider.keywords.length)];
            return {
                name: 'Discovery: Keyword',
                description: `topic:${keyword}`,
                type: 'search',
                query: `topic:${keyword} stars:>50` // Lower threshold for topics
            };
        }

        // 15% Chance: Temporal Slicing
        if (rand < 0.75) {
            const dateRange = this.getRandomDateRange();
            return {
                name: 'Discovery: Temporal',
                description: `created:${dateRange}`,
                type: 'search',
                query: `created:${dateRange} stars:>50`
            };
        }

        // 15% Chance: Community Scan (Diversity Pivot)
        if (rand < 0.90) {
            const targetOrg = Spider.communityTargets[Math.floor(Math.random() * Spider.communityTargets.length)];
            return {
                name: 'Discovery: Community Scan',
                description: `org:${targetOrg}`,
                type: 'community_scan',
                target: targetOrg
            };
        }

        // 10% Chance: Stargazer Leap (only if we have users)
        if (existingUsers.length > 0) {
            const randomUser = existingUsers[Math.floor(Math.random() * existingUsers.length)];
            return {
                name: 'Discovery: Stargazer Leap',
                description: `user:${randomUser.login}`,
                type: 'stargazer',
                username: randomUser.login
            };
        }

        // Fallback: Bio Signals (The "Bio-Keyword" Attack)
        return {
            name: 'Discovery: Bio Signals',
            description: 'bio keywords',
            type: 'search',
            query: 'bio:"she/her" OR bio:"woman in tech" OR bio:"mom" OR bio:"mother" OR bio:"girl" OR bio:"female" stars:>10'
        };
    }

    /**
     * Generates a random date range within the last 10 years.
     * @returns {String} "YYYY-MM-DD..YYYY-MM-DD"
     */
    getRandomDateRange() {
        const startYear = 2015;
        const endYear = 2025;
        const year = Math.floor(Math.random() * (endYear - startYear + 1)) + startYear;
        const month = Math.floor(Math.random() * 12) + 1;

        // Get a random week start
        const day = Math.floor(Math.random() * 20) + 1; // 1-20 to be safe

        const dateStart = new Date(year, month - 1, day);
        const dateEnd = new Date(year, month - 1, day + 7);

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
        if (GitHub.rateLimit.remaining < 50) {
             console.warn(`[Spider] RATE LIMIT CRITICAL: ${GitHub.rateLimit.remaining}. Skipping Community Scan.`);
             return;
        }

        console.log(`[Spider] 👩‍💻 Scanning Community Cluster: ${targetOrg}`);
        const { newCandidates, existingLogins, blacklist } = state;

        try {
            // 1. Get Org Members (High signal)
            console.log(`[Spider] Fetching members for ${targetOrg}...`);
            const members = await GitHub.rest(`orgs/${targetOrg}/public_members?per_page=100`);
            
            if (Array.isArray(members)) {
                for (const member of members) {
                    const login = member.login;
                    const lowerLogin = login.toLowerCase();
                    if (!blacklist.has(lowerLogin) && !existingLogins.has(lowerLogin)) {
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
     */
    async runSearch(query, state) {
        const maxPages = 3; // Reduced from 5 to avoid quota burnout on random walks

        console.log(`[Spider] Search Query: ${query}`);

        for (let page = 1; page <= maxPages; page++) {
            if (GitHub.rateLimit.remaining < 50) {
                console.warn(`[Spider] RATE LIMIT CRITICAL: ${GitHub.rateLimit.remaining}. Stopping search.`);
                break;
            }

            console.log(`[Spider] Fetching page ${page}...`);
            const searchRes = await GitHub.rest(`search/repositories?q=${query}&sort=stars&per_page=${config.github.perPage}&page=${page}`);

            if (!searchRes || !searchRes.items || searchRes.items.length === 0) {
                console.log('[Spider] No more results.');
                break;
            }

            await this.processRepositories(searchRes.items, state);
            await this.saveCheckpoint(state);
        }
    }

    /**
     * Executes a stargazer leap strategy.
     * @param {String} username
     * @param {Object} state
     */
    async runStargazer(username, state) {
        if (GitHub.rateLimit.remaining < 50) {
             console.warn(`[Spider] RATE LIMIT CRITICAL: ${GitHub.rateLimit.remaining}. Skipping Stargazer run.`);
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
        const { visited, newVisited, blacklist, existingLogins, newCandidates } = state;

        console.log(`[Spider] Processing ${repos.length} repositories...`);

        for (const repo of repos) {
            // Rate Limit Check
            if (GitHub.rateLimit.remaining < 50) {
                console.warn(`[Spider] RATE LIMIT CRITICAL: ${GitHub.rateLimit.remaining}. Stopping repo processing.`);
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

                if (blacklist.has(lowerLogin)) continue;
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
            console.log(`[Spider] Checkpoint: Discovered ${newCandidates.size} new candidates. (API Quota: ${GitHub.rateLimit.remaining})`);
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
            console.error(`[Spider] Failed to fetch contributors for ${fullName}: ${e.message}`);
            return [];
        }
    }
}

export default Neo.setupClass(Spider);