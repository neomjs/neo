import Base from '../../../src/core/Base.mjs';
import config from './config.mjs';
import GitHub from './GitHub.mjs';
import LocationNormalizer from './LocationNormalizer.mjs';
import Storage from './Storage.mjs';

/**
 * @summary User Enrichment & Filtering Service.
 *
 * This service is the "Worker Bee" of the pipeline. It takes a batch of raw usernames (from the Tracker)
 * and turns them into rich, structured data profiles for the application.
 *
 * **Core Workflow:**
 * 1.  **Fetch:** Queries GitHub (GraphQL) for the user's profile and a multi-year contribution history matrix.
 * 2.  **Enrich:** Augments the profile with Organization memberships via the REST API.
 * 3.  **Filter:** Applies the "Meritocracy Logic". If a user falls below the `minTotalContributions` threshold
 *     (and is not whitelisted), they are marked for immediate deletion from the Tracker ("Active Pruning").
 * 4.  **Persist:** Saves valid users to the Rich Data Store and updates their timestamp in the Tracker.
 * 5.  **Rescue:** Handles "Not Found" or "Bot" errors by setting a dummy timestamp to prevent infinite retry loops.
 *
 * @class DevIndex.services.Updater
 * @extends Neo.core.Base
 * @singleton
 */
class Updater extends Base {
    static config = {
        /**
         * @member {String} className='DevIndex.services.Updater'
         * @protected
         */
        className: 'DevIndex.services.Updater',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Orchestrates the update process for a specific batch of users.
     * 
     * Iterates through the provided list of logins, fetching their latest data from GitHub.
     * Enforces the "Meritocracy Logic" by checking the contribution threshold and whitelist status.
     * - **Pass:** Persists rich data to `users.json` and updates the timestamp in `tracker.json`.
     * - **Fail:** Signals `Storage` to DELETE the user from `tracker.json` (Active Pruning).
     * 
     * Finally, it logs a summary of the run, including the number of successful updates and remaining backlog.
     *
     * @param {String[]} logins             Array of usernames to process in this batch.
     * @param {Number}   [initialBacklog=0] The total size of the backlog *before* this batch started, used for reporting.
     * @returns {Promise<void>}
     */
    async processBatch(logins, initialBacklog = 0) {
        if (!logins || logins.length === 0) return;

        console.log(`[Updater] Processing batch of ${logins.length} users...`);
        let results = [];
        let indexUpdates = [];
        let successCount = 0;
        const saveInterval = config.updater.saveInterval;
        const whitelist = await Storage.getWhitelist();
        const concurrency = 8; // Slightly reduced from 10 to balance speed vs stability

        // Helper to process a single user
        const processUser = async (login) => {
            try {
                const data = await this.fetchUserData(login);
                
                if (data) {
                    const isWhitelisted = whitelist.has(login.toLowerCase());
                    const meetsThreshold = data.tc >= config.github.minTotalContributions;

                    if (meetsThreshold || isWhitelisted) {
                        results.push(data);
                        indexUpdates.push({ login, lastUpdate: data.lu });
                        successCount++;
                        console.log(`[${login}] OK (${data.tc})` + (isWhitelisted && !meetsThreshold ? ' [WHITELISTED]' : ''));
                    } else {
                        indexUpdates.push({ login, delete: true });
                        successCount++;
                        console.log(`[${login}] SKIPPED (Low Activity: ${data.tc}) [PRUNED]`);
                    }
                } else {
                    indexUpdates.push({ login, lastUpdate: new Date().toISOString() });
                    successCount++;
                    console.log(`[${login}] SKIPPED (No Data/Bot)`);
                }
            } catch (error) {
                console.log(`[${login}] FAILED: ${error.message}`);
                
                // Kill-switch: If we hit a rate limit error, force internal state to 0 to trigger graceful shutdown
                if (error.message.includes('rate limit')) {
                    console.warn(`[Updater] 🚨 Rate limit hit for ${login}. Forcing shutdown sequence.`);
                    GitHub.rateLimit.core.remaining = 0;
                }
            }
        };

        // Process in chunks
        for (let i = 0; i < logins.length; i += concurrency) {
            // Rate Limit Check
            if (GitHub.rateLimit.core.remaining < 50) {
                console.warn(`\n[Updater] ⚠️ RATE LIMIT CRITICAL: ${GitHub.rateLimit.core.remaining} requests remaining.`);
                if (GitHub.rateLimit.core.reset) {
                    const resetDate = new Date(GitHub.rateLimit.core.reset * 1000);
                    console.warn(`[Updater] Limit resets at: ${resetDate.toLocaleString()}`);
                }
                console.warn(`[Updater] Stopping gracefully to preserve quota.\n`);
                break;
            }

            const chunk = logins.slice(i, i + concurrency);
            await Promise.all(chunk.map(login => processUser(login)));

            // Checkpoint Save
            if (results.length >= saveInterval) {
                await this.saveCheckpoint(results, indexUpdates);
                results = [];
                indexUpdates = [];
            }
        }

        // Final Save for remaining items
        if (results.length > 0 || indexUpdates.length > 0) {
            await this.saveCheckpoint(results, indexUpdates);
        }
        
        console.log('--------------------------------------------------');
        console.log('[Updater] Run Complete.');
        console.log(`[Updater] Successfully Updated: ${successCount}`);
        
        if (initialBacklog > 0) {
            const remaining = Math.max(0, initialBacklog - successCount);
            console.log(`[Updater] Remaining Backlog: ${remaining}`);
        }
        
        console.log('--------------------------------------------------');
    }

    /**
     * Helper to save partial results.
     * @param {Array} results 
     * @param {Array} indexUpdates 
     */
    async saveCheckpoint(results, indexUpdates) {
        if (results.length > 0) await Storage.updateUsers(results);
        if (indexUpdates.length > 0) await Storage.updateTracker(indexUpdates);
        console.log(`[Updater] Checkpoint: Saved ${results.length} records. (API Quota: ${GitHub.rateLimit.core.remaining}/${GitHub.rateLimit.core.limit})`);
    }

    /**
     * Fetches and aggregates comprehensive profile data for a single user.
     *
     * This method combines data from multiple sources:
     * 1.  **GraphQL User Query:** Fetches profile info (bio, company, location) and social accounts.
     * 2.  **GraphQL Contribution Graph:** Fetches the *entire* contribution history (total contributions) for every year since account creation.
     * 3.  **REST API Organizations:** Fetches public organization memberships (bypassing GraphQL scope limitations).
     *
     * Returns `null` if the user is not found (404) or flagged as a bot, allowing the caller to handle the error gracefull.
     *
     * @param {String} username The GitHub login to fetch.
     * @returns {Promise<Object|null>} The enriched user object matching the `users.json` schema, or null.
     * @private
     */
    async fetchUserData(username) {
        // 1. Fetch Basic Profile & Social Accounts (GraphQL)
        const profileQuery = `
            query { 
                rateLimit { remaining limit resetAt }
                user(login: "${username}") { 
                    createdAt 
                    avatarUrl 
                    name 
                    location
                    company
                    bio
                    followers { totalCount }
                    isHireable
                    hasSponsorsListing
                    twitterUsername
                    websiteUrl
                    socialAccounts(first: 5) {
                        nodes {
                            provider
                            url
                        }
                    }
                } 
            }`;

        // 2. Fetch Organizations (REST API for Public Memberships)
        // GraphQL requires 'read:org' scope even for public orgs, whereas REST /users/:username/orgs does not.
        // We run this in parallel with the profile query.
        const orgsPromise = GitHub.rest(`users/${username}/orgs`, username)
            .then(res => Array.isArray(res) ? res.map(org => ({
                name: org.login, // REST API often just gives login, description is separate.
                avatar_url: org.avatar_url,
                login: org.login
            })) : [])
            .catch(e => {
                console.warn(`[Updater] [${username}] Skipped orgs (REST Error): ${e.message}`);
                return [];
            });

        // Pass username as logContext
        const profilePromise = GitHub.query(profileQuery, {}, 3, username);

        let profileRes, orgs;
        try {
            [profileRes, orgs] = await Promise.all([profilePromise, orgsPromise]);
        } catch (e) {
            // If user not found (404), return null
            if (e.message.includes('NOT_FOUND')) return null;
            throw e;
        }

        if (!profileRes?.user) return null;

        const { createdAt, avatarUrl, name, location, company, bio, followers, socialAccounts, isHireable, hasSponsorsListing, twitterUsername, websiteUrl } = profileRes.user;
        const startYear = new Date(createdAt).getFullYear();
        const currentYear = new Date().getFullYear();

        // Extract LinkedIn URL
        let linkedin_url = null;
        
        const linkedInAccount = socialAccounts?.nodes?.find(acc => acc.provider === 'LINKEDIN');
        if (linkedInAccount) {
            linkedin_url = linkedInAccount.url;
        } else if (profileRes.user.websiteUrl && profileRes.user.websiteUrl.includes('linkedin.com/in/')) {
            linkedin_url = profileRes.user.websiteUrl;
        }

        // 3. Build Multi-Year Contribution Query
        // BATCHING: We split the years into chunks of 4 to prevent 502/504 errors on large accounts.
        const contribData = {};

        const fetchYears = async (fromYear, toYear) => {
            let query = `query { 
                rateLimit { remaining limit resetAt }
                user(login: "${username}") {`;
            for (let year = fromYear; year <= toYear; year++) {
                query += ` y${year}: contributionsCollection(from: "${year}-01-01T00:00:00Z", to: "${year}-12-31T23:59:59Z") { 
                    totalCommitContributions
                    totalIssueContributions
                    totalPullRequestContributions
                    totalPullRequestReviewContributions
                    totalRepositoryContributions
                    restrictedContributionsCount
                }`;
            }
            query += ` } }`;
            // Pass username as logContext
            const res = await GitHub.query(query, {}, 3, username);
            if (res?.user) Object.assign(contribData, res.user);
        };

        const yearChunks = [];
        const chunkSize = 4; // Reduced to 4
        for (let y = startYear; y <= currentYear; y += chunkSize) {
            const end = Math.min(y + chunkSize - 1, currentYear);
            yearChunks.push({ start: y, end });
        }

        // Fetch year chunks sequentially to be safe
        for (const chunk of yearChunks) {
            await fetchYears(chunk.start, chunk.end);
        }

        // 4. Aggregate Data & Minify
        let total = 0;
        const yearsArr = [];
        const commitsArr = [];
        const privateArr = [];
        
        // Ensure years are sorted and fill the array sequentially from startYear
        for (let year = startYear; year <= currentYear; year++) {
            const key = `y${year}`;
            const collection = contribData[key];
            
            const commits = collection?.totalCommitContributions || 0;
            const privateStats = collection?.restrictedContributionsCount || 0;

            // Sum up the lightweight counters
            const val = (commits) +
                        (collection?.totalIssueContributions || 0) +
                        (collection?.totalPullRequestContributions || 0) +
                        (collection?.totalPullRequestReviewContributions || 0) +
                        (collection?.totalRepositoryContributions || 0) +
                        privateStats;

            yearsArr.push(val);
            commitsArr.push(commits);
            privateArr.push(privateStats);
            total += val;
        }

        const extractId = (url) => {
            if (!url) return null;
            const match = url.match(/\/u\/(\d+)/);
            return match ? parseInt(match[1], 10) : null;
        };

        const minified = {
            l: username,
            tc: total,
            fy: startYear,
            lu: new Date().toISOString(),
            y: yearsArr,
            cy: commitsArr,
            py: privateArr
        };

        if (name && name !== username) minified.n = name;
        
        const avatarId = extractId(avatarUrl);
        if (avatarId) minified.i = avatarId;

        if (location) minified.lc = location;
        
        const countryCode = LocationNormalizer.normalize(location);
        if (countryCode) minified.cc = countryCode;

        if (company) minified.c = company;
        if (bio) minified.b = bio;
        if (followers?.totalCount > 0) minified.fl = followers.totalCount;
        if (linkedin_url) minified.li = linkedin_url;

        // Metadata
        if (isHireable) minified.h = 1;
        if (hasSponsorsListing) minified.s = 1;
        if (twitterUsername) minified.t = twitterUsername;
        if (websiteUrl) minified.w = websiteUrl;

        if (orgs.length > 0) {
            // Take top 5, map to [login, id]
            minified.o = orgs.slice(0, 5).map(org => [
                org.login,
                extractId(org.avatar_url)
            ]);
        }

        return minified;
    }
}

export default Neo.setupClass(Updater);
