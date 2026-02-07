import Base from '../../../src/core/Base.mjs';
import config from './config.mjs';
import GitHub from './GitHub.mjs';
import Storage from './Storage.mjs';

/**
 * @summary The Spider (Discovery Engine).
 *
 * Crawls GitHub for new user candidates by:
 * 1. Searching for high-star repositories.
 * 2. Fetching top contributors from those repositories.
 * 3. Adding new, unvisited users to the user index.
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
        
        const newCandidates = new Set();
        const newVisited = new Set();

        // 2. Discover Repositories
        const minStars = config.github.minStars;
        const query = `stars:>${minStars}`;
        const maxPages = 5; // Crawl top 5 pages (~150 repos)

        console.log(`[Spider] Searching repos with ${query} (Pages 1-${maxPages})...`);
        
        try {
            for (let page = 1; page <= maxPages; page++) {
                console.log(`[Spider] Fetching page ${page}...`);
                const searchRes = await GitHub.rest(`search/repositories?q=${query}&sort=stars&per_page=${config.github.perPage}&page=${page}`);
                
                if (!searchRes || !searchRes.items) {
                    console.error('[Spider] Failed to find repositories on page', page);
                    continue;
                }

                const repos = searchRes.items;
                console.log(`[Spider] Page ${page}: Found ${repos.length} repositories.`);

                // 3. Process Repositories
                for (const repo of repos) {
                    const repoKey = `repo:${repo.full_name}`;
                    
                    if (visited.has(repoKey)) {
                        // console.log(`  [Skipping] Visited repo: ${repo.full_name}`);
                        // continue; 
                    }

                    newVisited.add(repoKey);
                    process.stdout.write(`  Scanning ${repo.full_name}... `);

                    const contributors = await this.fetchContributors(repo.full_name);
                    let addedCount = 0;

                    for (const login of contributors) {
                        const lowerLogin = login.toLowerCase();

                        // Filter Logic
                        if (blacklist.has(lowerLogin)) continue;
                        if (login.includes('[bot]')) continue;
                        
                        // If we already know this user, skip adding to candidates
                        if (existingLogins.has(lowerLogin)) continue;

                        if (!newCandidates.has(login)) {
                            newCandidates.add(login);
                            addedCount++;
                        }
                    }
                    console.log(`Found ${contributors.length} contributors, ${addedCount} new.`);
                }
            }

            // 4. Save Results
            if (newCandidates.size > 0) {
                console.log(`[Spider] Discovered ${newCandidates.size} new candidates.`);
                const updates = Array.from(newCandidates).map(login => ({
                    login,
                    lastUpdate: null // Null means "never updated", high priority for Updater
                }));
                
                await Storage.updateTracker(updates);
            } else {
                console.log('[Spider] No new candidates discovered this run.');
            }

            // Update Visited Log
            await Storage.updateVisited(newVisited);

        } catch (error) {
            console.error('[Spider] Fatal error:', error);
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
            // Fetch top 10 contributors? Configurable?
            // Original script used 5. Let's use 10.
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
