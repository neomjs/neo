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
     * @returns {Promise<void>}
     */
    async processBatch(logins) {
        if (!logins || logins.length === 0) return;

        console.log(`[Updater] Processing batch of ${logins.length} users...`);
        const results = [];
        const indexUpdates = [];

        for (const login of logins) {
            try {
                process.stdout.write(`  Fetching ${login}... `);
                const data = await this.fetchUserData(login);
                
                if (data) {
                    results.push(data);
                    indexUpdates.push({ login, lastUpdate: data.last_updated });
                    console.log(`OK (${data.total_contributions})`);
                } else {
                    console.log('SKIPPED (No Data/Bot)');
                }
            } catch (error) {
                console.log(`FAILED: ${error.message}`);
                // Continue with next user even if one fails
            }
        }

        // Batch save to storage
        if (results.length > 0) {
            await Storage.updateData(results);
            await Storage.updateUsersIndex(indexUpdates);
            console.log(`[Updater] Batch complete. Saved ${results.length} records.`);
        }
    }

    /**
     * Fetches full profile and contribution history for a single user.
     * @param {String} username
     * @returns {Promise<Object|null>} Enriched user object or null.
     * @private
     */
    async fetchUserData(username) {
        // 1. Fetch Basic Profile
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

        const { createdAt, avatarUrl, name, location, company, bio, followers } = profileRes.user;
        const startYear = new Date(createdAt).getFullYear();
        const currentYear = new Date().getFullYear();

        // 2. Build Multi-Year Contribution Query
        // We construct a single dynamic query aliasing each year
        let contribQuery = `query { user(login: "${username}") {`;
        for (let year = startYear; year <= currentYear; year++) {
            contribQuery += ` y${year}: contributionsCollection(from: "${year}-01-01T00:00:00Z", to: "${year}-12-31T23:59:59Z") { contributionCalendar { totalContributions } }`;
        }
        contribQuery += ` } }`;

        const contribRes = await GitHub.query(contribQuery);
        if (!contribRes?.user) return null;

        // 3. Aggregate Data
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
            last_updated: new Date().toISOString()
        };
    }
}

export default Neo.setupClass(Updater);
