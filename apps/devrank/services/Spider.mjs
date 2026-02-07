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
        const existingUsers = await Storage.getUsersIndex();
        const existingLogins = new Set(existingUsers.map(u => u.login.toLowerCase()));
        
        const newCandidates = new Set();
        const newVisited = new Set();

        // 2. Discover Repositories
        // We use a random offset or different criteria to vary results?
        // For now, let's stick to the high-star query but maybe random page?
        // Actually, let's just use the config default.
        const minStars = config.github.minStars;
        const query = `stars:>${minStars}`;
        const page = 1; // TODO: Randomize or track page state?

        console.log(`[Spider] Searching repos with ${query}...`);
        
        try {
            const searchRes = await GitHub.rest(`search/repositories?q=${query}&sort=stars&per_page=${config.github.perPage}&page=${page}`);
            
            if (!searchRes || !searchRes.items) {
                console.error('[Spider] Failed to find repositories.');
                return;
            }

            const repos = searchRes.items;
            console.log(`[Spider] Found ${repos.length} repositories.`);

            // 3. Process Repositories
            for (const repo of repos) {
                const repoKey = `repo:${repo.full_name}`;
                
                // Skip if we've fully processed this repo recently?
                // For now, we process it again to check for new contributors, 
                // but maybe we should skip it to go wide first.
                // Let's check visited.
                if (visited.has(repoKey)) {
                    // console.log(`  [Skipping] Visited repo: ${repo.full_name}`);
                    // continue; 
                    // Actually, contributors change. Let's re-scan but maybe lower priority?
                    // For this MVP, let's process it.
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
                    
                    // If we already know this user, skip adding to candidates (unless we want to force update?)
                    // The Manager handles updates. Spider just finds NEW people.
                    if (existingLogins.has(lowerLogin)) continue;

                    if (!newCandidates.has(login)) {
                        newCandidates.add(login);
                        addedCount++;
                    }
                }
                console.log(`Found ${contributors.length} contributors, ${addedCount} new.`);
            }

            // 4. Save Results
            if (newCandidates.size > 0) {
                console.log(`[Spider] Discovered ${newCandidates.size} new candidates.`);
                const updates = Array.from(newCandidates).map(login => ({
                    login,
                    lastUpdate: null // Null means "never updated", high priority for Updater
                }));
                
                await Storage.updateUsersIndex(updates);
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
