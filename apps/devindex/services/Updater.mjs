import Base from '../../../src/core/Base.mjs';
import config from './config.mjs';
import GitHub from './GitHub.mjs';
import Heuristics from './Heuristics.mjs';
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
 *     (and is not allowlisted), they are marked for immediate deletion from the Tracker ("Active Pruning").
 *     **Dynamic Threshold:** Once the database hits the `maxUsers` cap (managed by `Storage`), this
 *     threshold dynamically rises to match the lowest performer in the database, ensuring only superior
 *     candidates displace existing ones.
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
     * Enforces the "Meritocracy Logic" by checking the contribution threshold and allowlist status.
     *
     * **Safe Purge Protocol (Self-Healing):**
     * This method implements a defensive strategy for handling API errors:
     * 1.  **Transient Errors (5xx, Rate Limits):** Users are moved to the "Penalty Box" (`failed.json`) to be retried later.
     * 2.  **Fatal Errors (404, Not a User):**
     *     -   **If User Has History:** If the user exists in `users.jsonl`, we assume the 404 is a glitch or temporary suspension. They are **Protected** and moved to the Penalty Box.
     *     -   **If User Is New:** If the user has *never* been successfully indexed, they are classified as a "Bad Seed" (e.g., leaked Organization, Typo). They are **Pruned** (deleted) from the tracker immediately.
     * 3.  **Rename Recovery:** If a user returns a 404 but exists in our Rich Data Store with a valid GitHub Database ID,
     *     we query the API for their current login. If found, the old record is pruned and the new login is immediately
     *     fetched and indexed, preserving history.
     *
     * @param {String[]} logins             Array of usernames to process in this batch.
     * @param {Number}   [initialBacklog=0] The total size of the backlog *before* this batch started, used for reporting.
     * @returns {Promise<void>}
     */
    async processBatch(logins, initialBacklog = 0) {
        if (!logins || logins.length === 0) return;

        console.log(`[Updater] Processing batch of ${logins.length} users...`);
        let results         = [];
        let indexUpdates    = [];
        let failedLogins    = [];
        let recoveredLogins = [];
        let prunedLogins    = []; // Users to remove from users.jsonl (e.g. Renames)
        let successCount    = 0;
        let failCount       = 0;
        let skipCount       = 0;
        const saveInterval  = config.updater.saveInterval;
        const allowlist     = await Storage.getAllowlist();
        const richUsers     = await Storage.getUsers();
        const richUserMap   = new Map(richUsers.map(u => [u.l.toLowerCase(), u]));
        const concurrency   = 8; // Slightly reduced from 10 to balance speed vs stability

        const threshold     = await Storage.getLowestContributionThreshold();
        const minTc         = Math.max(config.github.minTotalContributions, threshold);

        // Helper to process a single user
        const processUser = async (login) => {
            try {
                const data = await this.fetchUserData(login);

                if (data) {
                    const isAllowlisted  = allowlist.has(login.toLowerCase());
                    const meetsThreshold = data.tc >= minTc;

                    if (meetsThreshold || isAllowlisted) {
                        results.push(data);
                        indexUpdates.push({ login, lastUpdate: data.lu });
                        recoveredLogins.push(login); // Remove from Penalty Box
                        successCount++;
                        console.log(`[${login}] OK (${data.tc})` + (isAllowlisted && !meetsThreshold ? ' [ALLOWLISTED]' : ''));
                    } else {
                        indexUpdates.push({ login, delete: true });
                        skipCount++;
                        console.log(`[${login}] SKIPPED (Low Activity: ${data.tc}) [PRUNED]`);
                    }
                } else {
                    indexUpdates.push({ login, lastUpdate: new Date().toISOString() });
                    skipCount++;
                    console.log(`[${login}] SKIPPED (No Data/Bot)`);
                }
            } catch (error) {
                const lowerLogin = login.toLowerCase();
                const isFatal    = error.message.includes('Could not resolve to a User') || error.message.includes('NOT_FOUND') || error.message.includes('GraphQL Fatal Error');
                const richUser   = richUserMap.get(lowerLogin);

                // ID-Based Rename Handling
                if (isFatal && richUser && richUser.i) {
                     try {
                         const newLogin = await GitHub.getLoginByDatabaseId(richUser.i);
                         if (newLogin && newLogin.toLowerCase() !== lowerLogin) {
                             console.log(`[${login}] 🔄 RENAME DETECTED -> ${newLogin}`);

                             // 1. Mark old login for removal
                             indexUpdates.push({ login, delete: true }); // Tracker
                             prunedLogins.push(login); // Rich Data

                             // 2. Fetch data for new login immediately
                             const newData = await this.fetchUserData(newLogin);
                             if (newData) {
                                 results.push(newData);
                                 indexUpdates.push({ login: newLogin, lastUpdate: newData.lu });
                                 // Success for new user implies we handled the 'slot' for the old user effectively
                                 successCount++;
                                 console.log(`[${newLogin}] Rename recovery successful.`);
                                 return; // Done
                             }
                         }
                     } catch (renameErr) {
                         console.warn(`[${login}] Rename check failed: ${renameErr.message}`);
                     }
                }

                if (isFatal && !richUser) {
                    // Safe Purge: User is invalid AND has never been indexed before.
                    console.log(`[${login}] PERMANENT FAILURE: Invalid User/Org. [PRUNED]`);
                    indexUpdates.push({ login, delete: true });
                    // Do NOT add to failedLogins (Penalty Box), just delete.
                    skipCount++; // Count as skipped/pruned
                } else {
                    // Transient Error OR User has History (Protect them)
                    console.log(`[${login}] FAILED: ${error.message}`);

                    // Penalty Box: Update timestamp to push failed users to the back of the queue
                    indexUpdates.push({ login, lastUpdate: new Date().toISOString() });
                    failedLogins.push(login); // Add to Penalty Box
                    failCount++; // Count as processed even if failed
                }

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
                await this.saveCheckpoint(results, indexUpdates, failedLogins, recoveredLogins, prunedLogins);
                results         = [];
                indexUpdates    = [];
                failedLogins    = [];
                recoveredLogins = [];
                prunedLogins    = [];
            }
        }

        // Final Save for remaining items
        if (results.length > 0 || indexUpdates.length > 0 || failedLogins.length > 0 || prunedLogins.length > 0) {
            await this.saveCheckpoint(results, indexUpdates, failedLogins, recoveredLogins, prunedLogins);
        }

        console.log('--------------------------------------------------');
        console.log('[Updater] Run Complete.');
        console.log(`[Updater] Successfully Updated: ${successCount}`);
        console.log(`[Updater] Skipped/Pruned: ${skipCount}`);
        console.log(`[Updater] Failed (Penalty Box): ${failCount}`);

        if (initialBacklog > 0) {
            const totalProcessed = successCount + skipCount + failCount;
            const remaining      = Math.max(0, initialBacklog - totalProcessed);
            console.log(`[Updater] Remaining Backlog: ${remaining}`);
        }

        console.log('--------------------------------------------------');
    }

    /**
     * Helper to save partial results.
     * @param {Array} results
     * @param {Array} indexUpdates
     * @param {Array} failedLogins
     * @param {Array} recoveredLogins
     * @param {Array} prunedLogins
     */
    async saveCheckpoint(results, indexUpdates, failedLogins = [], recoveredLogins = [], prunedLogins = []) {
        if (results.length      > 0) await Storage.updateUsers(results);
        if (indexUpdates.length > 0) await Storage.updateTracker(indexUpdates);
        if (prunedLogins.length > 0) await Storage.deleteUsers(prunedLogins);

        // Manage Penalty Box
        if (failedLogins.length    > 0) await Storage.updateFailed(failedLogins, true);
        if (recoveredLogins.length > 0) await Storage.updateFailed(recoveredLogins, false);

        console.log(`[Updater] Checkpoint: Saved ${results.length} records, Pruned ${prunedLogins.length} old logins. (API Quota: ${GitHub.rateLimit.core.remaining}/${GitHub.rateLimit.core.limit})`);
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
                    sponsorshipsAsMaintainer { totalCount }
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
                name      : org.login, // REST API often just gives login, description is separate.
                avatar_url: org.avatar_url,
                login     : org.login
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

        const { createdAt, avatarUrl, name, location, company, bio, followers, socialAccounts, isHireable, hasSponsorsListing, sponsorshipsAsMaintainer, twitterUsername, websiteUrl } = profileRes.user;
        const startYear   = new Date(createdAt).getFullYear();
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
        //
        // TOP REPO STRATEGY:
        // We want to identify the user's "Lifetime Top Repository" (highest commit count).
        // - Ideally, we would fetch ALL contributions for ALL years, but fetching `commitContributionsByRepository`
        //   without a limit is too expensive and slow.
        // - GitHub API sorts this list by `OCCURRED_AT` (default), not by count.
        // - We use `maxRepositories: 10` as a statistical trade-off. For prolific users (contributing to >10 repos/year),
        //   we might miss a high-count repo if it wasn't recently active in that year.
        // - We aggregate these counts across all years.
        // - We MUST use `${owner}/${name}` as the key, because `name` alone is ambiguous (forks, common names).
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
                    commitContributionsByRepository(maxRepositories: 10) {
                        repository { name, owner { login } }
                        contributions { totalCount }
                    }
                }`;
            }
            query += ` } }`;
            // Pass username as logContext
            const res = await GitHub.query(query, {}, 3, username);
            if (res?.user) Object.assign(contribData, res.user);
        };

        const yearChunks = [];
        const chunkSize  = 4; // Reduced to 4
        for (let y = startYear; y <= currentYear; y += chunkSize) {
            const end = Math.min(y + chunkSize - 1, currentYear);
            yearChunks.push({ start: y, end });
        }

        // Fetch year chunks sequentially to be safe
        for (const chunk of yearChunks) {
            try {
                // 1. Try Fast Path (Batch of 4)
                await fetchYears(chunk.start, chunk.end);
            } catch (err) {
                // 2. Detect Failure (504/502/Timeout)
                console.warn(`[Updater] [${username}] Batch failed (${chunk.start}-${chunk.end}). Falling back to single years...`);

                // 3. Fallback: Process year by year
                for (let y = chunk.start; y <= chunk.end; y++) {
                    try {
                        await fetchYears(y, y);
                    } catch (innerErr) {
                        if (innerErr.message.includes('IP allow list enabled')) {
                            console.warn(`[Updater] [${username}] Year ${y} blocked by IP allow list. Skipping year.`);
                            continue;
                        }
                        console.error(`[Updater] [${username}] Year ${y} failed even individually.`);
                        throw innerErr; // If even 1 year fails, the user is truly broken
                    }
                }
            }
        }

        // 4. Aggregate Data & Minify
        let total        = 0;
        const yearsArr   = [];
        const commitsArr = [];
        const privateArr = [];
        const repoMap    = new Map(); // name -> total

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

            // Aggregate Repos (Focus Metric)
            if (collection?.commitContributionsByRepository) {
                collection.commitContributionsByRepository.forEach(repo => {
                    const name     = repo.repository.name;
                    const owner    = repo.repository.owner.login;
                    const fullName = `${owner}/${name}`;
                    const count    = repo.contributions.totalCount;

                    repoMap.set(fullName, (repoMap.get(fullName) || 0) + count);
                });
            }

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
            l : username,
            tc: total,
            fy: startYear,
            lu: new Date().toISOString(),
            y : yearsArr,
            cy: commitsArr,
            py: privateArr
        };

        // Top Repo (Focus Metric)
        if (repoMap.size > 0) {
            let topRepoName  = null;
            let topRepoCount = -1;

            for (const [name, count] of repoMap) {
                if (count > topRepoCount) {
                    topRepoCount = count;
                    topRepoName = name;
                }
            }

            if (topRepoName) {
                minified.tr = [topRepoName, topRepoCount];
            }
        }

        if (name && name !== username) minified.n = name;

        const avatarId = extractId(avatarUrl);
        if (avatarId) minified.i = avatarId;

        if (location) minified.lc = location;

        const countryCode = LocationNormalizer.normalize(location);
        if (countryCode) minified.cc = countryCode;

        if (company) minified.c = company;
        if (bio) minified.b = bio;
        if (followers?.totalCount > 0) minified.fl = followers.totalCount;

        if (linkedin_url) {
            // Extract username (handle trailing slash)
            const match = linkedin_url.match(/linkedin\.com\/in\/([^/]+)/);
            if (match) minified.li = match[1];
        }

        // Metadata
        if (isHireable) minified.h = 1;
        if (hasSponsorsListing || sponsorshipsAsMaintainer?.totalCount > 0) {
            minified.s = sponsorshipsAsMaintainer?.totalCount || 0;
        }
        if (twitterUsername) minified.t = twitterUsername;
        if (websiteUrl) minified.w = websiteUrl;

        if (orgs.length > 0) {
            // Take top 5, map to [login, id]
            minified.o = orgs.slice(0, 5).map(org => [
                org.login,
                extractId(org.avatar_url)
            ]);
        }

        // 5. Apply Heuristics (Anomaly Detection & Cyborg Metrics)
        const heuristics = Heuristics.analyze(minified);
        if (heuristics) {
            minified.hm = heuristics;
        }

        return minified;
    }
}

export default Neo.setupClass(Updater);
