import Base from '../../../src/core/Base.mjs';
import config from './config.mjs';
import GitHub from './GitHub.mjs';
import Storage from './Storage.mjs';

/**
 * @summary The Spider (Discovery Engine).
 *
 * Crawls GitHub for new user candidates using a "Random Walk" strategy to ensure
 * diverse discovery and avoid filter bubbles.
 *
 * Strategies:
 * 1. Core: High Stars (Standard top-down approach)
 * 2. Temporal: Random date range search (Hidden gems)
 * 3. Keyword: Random dictionary attack (Topic based)
 * 4. Stargazer: Network traversal via random user stars
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
     * Main entry point for the spider.
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
     * Selects a random discovery strategy.
     * @param {Array} existingUsers
     * @returns {Object} Strategy definition
     */
    pickStrategy(existingUsers) {
        const rand = Math.random();

        // 40% Chance: Core High Stars (Dynamic Ranges)
        if (rand < 0.4) {
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

        // 30% Chance: Dictionary Attack
        if (rand < 0.7) {
            const keyword = Spider.keywords[Math.floor(Math.random() * Spider.keywords.length)];
            return {
                name: 'Discovery: Keyword',
                description: `topic:${keyword}`,
                type: 'search',
                query: `topic:${keyword} stars:>50` // Lower threshold for topics
            };
        }

        // 20% Chance: Temporal Slicing
        if (rand < 0.9) {
            const dateRange = this.getRandomDateRange();
            return {
                name: 'Discovery: Temporal',
                description: `created:${dateRange}`,
                type: 'search',
                query: `created:${dateRange} stars:>50`
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

        // Fallback to Temporal if no users yet
        const dateRange = this.getRandomDateRange();
        return {
            name: 'Discovery: Temporal (Fallback)',
            description: `created:${dateRange}`,
            type: 'search',
            query: `created:${dateRange} stars:>50`
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
     * Executes a search-based discovery strategy.
     * @param {String} query
     * @param {Object} state
     */
    async runSearch(query, state) {
        const maxPages = 3; // Reduced from 5 to avoid quota burnout on random walks

        console.log(`[Spider] Search Query: ${query}`);

        for (let page = 1; page <= maxPages; page++) {
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
            console.log(`[Spider] Checkpoint: Discovered ${newCandidates.size} new candidates.`);
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
     * Fetches top contributors for a repository.
     * @param {String} fullName "owner/repo"
     * @returns {Promise<String[]>} Array of logins
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