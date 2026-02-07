import Base from '../../../src/core/Base.mjs';
import config from './config.mjs';
import GitHub from './GitHub.mjs';
import Storage from './Storage.mjs';

/**
 * @summary User Enrichment Service.
 *
 * Responsible for fetching detailed user data and contribution history from GitHub.
 * Updates both the rich data store and the lightweight user index.
 *
 * @class DevRank.services.Updater
 * @extends Neo.core.Base
 * @singleton
 */
class Updater extends Base {
    static config = {
        /**
         * @member {String} className='DevRank.services.Updater'
         * @protected
         */
        className: 'DevRank.services.Updater',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Processes a batch of users.
     * @param {String[]} logins Array of usernames to process.
     * @param {Number} [initialBacklog=0] Total backlog size before this batch.
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

        for (const login of logins) {
            try {
                process.stdout.write(`  Fetching ${login}... `);
                const data = await this.fetchUserData(login);
                
                if (data) {
                    const isWhitelisted = whitelist.has(login.toLowerCase());
                    const meetsThreshold = data.total_contributions >= config.github.minTotalContributions;

                    if (meetsThreshold || isWhitelisted) {
                        results.push(data);
                        indexUpdates.push({ login, lastUpdate: data.last_updated });
                        successCount++;
                        console.log(`OK (${data.total_contributions})` + (isWhitelisted && !meetsThreshold ? ' [WHITELISTED]' : ''));
                    } else {
                        // Prune from tracker if low value.
                        // We use delete: true to signal Storage to remove it.
                        indexUpdates.push({ login, delete: true });
                        successCount++; // Count as handled
                        console.log(`SKIPPED (Low Activity: ${data.total_contributions}) [PRUNED]`);
                    }
                } else {
                    // Update tracker even if no data (e.g. bot, not found) to prevent infinite retry loop
                    indexUpdates.push({ login, lastUpdate: new Date().toISOString() });
                    successCount++;
                    console.log('SKIPPED (No Data/Bot)');
                }
            } catch (error) {
                console.log(`FAILED: ${error.message}`);
                // Continue with next user even if one fails
            }

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
        console.log(`[Updater] Checkpoint: Saved ${results.length} records.`);
    }

    /**
     * Fetches full profile and contribution history for a single user.
     * @param {String} username
     * @returns {Promise<Object|null>} Enriched user object or null.
     * @private
     */
    async fetchUserData(username) {
        // 1. Fetch Basic Profile & Social Accounts
        const profileQuery = `
            query { 
                user(login: "${username}") { 
                    createdAt 
                    avatarUrl 
                    name 
                    location
                    company
                    bio
                    followers { totalCount }
                    isHireable
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

        let profileRes;
        try {
            profileRes = await GitHub.query(profileQuery);
        } catch (e) {
            // If user not found (404), return null
            if (e.message.includes('NOT_FOUND')) return null;
            throw e;
        }

        if (!profileRes?.user) return null;

        const { createdAt, avatarUrl, name, location, company, bio, followers, socialAccounts } = profileRes.user;
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

        // 2. Fetch Organizations (REST API for Public Memberships)
        // GraphQL requires 'read:org' scope even for public orgs, whereas REST /users/:username/orgs does not.
        let orgs = [];
        try {
            const orgRes = await GitHub.rest(`users/${username}/orgs`);
            if (Array.isArray(orgRes)) {
                orgs = orgRes.map(org => ({
                    name: org.login, // REST API often just gives login, description is separate.
                    avatar_url: org.avatar_url,
                    login: org.login
                }));
            }
        } catch (e) {
            console.warn(`[Updater] Skipped orgs for ${username} (REST Error): ${e.message}`);
        }

        // 3. Build Multi-Year Contribution Query
        let contribQuery = `query { user(login: "${username}") {`;
        for (let year = startYear; year <= currentYear; year++) {
            contribQuery += ` y${year}: contributionsCollection(from: "${year}-01-01T00:00:00Z", to: "${year}-12-31T23:59:59Z") { contributionCalendar { totalContributions } }`;
        }
        contribQuery += ` } }`;

        const contribRes = await GitHub.query(contribQuery);
        if (!contribRes?.user) return null;

        // 4. Aggregate Data
        let total = 0;
        const yearsData = {};
        
        Object.keys(contribRes.user).forEach(key => {
            if (key.startsWith('y')) {
                const year = key.replace('y', '');
                const val = contribRes.user[key].contributionCalendar.totalContributions;
                yearsData[year] = val;
                total += val;
            }
        });

        return {
            login: username,
            name: name || username,
            avatar_url: avatarUrl,
            location: location,
            company: company,
            bio: bio,
            followers: followers.totalCount,
            total_contributions: total,
            years: yearsData,
            first_year: startYear,
            last_updated: new Date().toISOString(),
            linkedin_url,
            organizations: orgs
        };
    }
}

export default Neo.setupClass(Updater);
