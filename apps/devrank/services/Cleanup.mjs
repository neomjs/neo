import Base from '../../../src/core/Base.mjs';
import config from './config.mjs';
import Storage from './Storage.mjs';

/**
 * @summary DevRank Cleanup Service.
 *
 * Enforces data hygiene by:
 * 1. Filtering users below the contribution threshold (unless whitelisted).
 * 2. Removing blacklisted users from all datasets.
 * 3. Sorting all data files to ensure canonical ordering (minimizing git diffs).
 *
 * @class DevRank.services.Cleanup
 * @extends Neo.core.Base
 * @singleton
 */
class Cleanup extends Base {
    static config = {
        /**
         * @member {String} className='DevRank.services.Cleanup'
         * @protected
         */
        className: 'DevRank.services.Cleanup',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Executes the cleanup process.
     * @returns {Promise<void>}
     */
    async run() {
        console.log('[Cleanup] Starting data hygiene check...');

        // 1. Load All Data
        let users = await Storage.getUsers();
        let tracker = await Storage.getTracker();
        let blacklist = await Storage.getBlacklist(); // Set<string>
        let whitelist = await Storage.getWhitelist(); // Set<string>
        let visited = await Storage.getVisited(); // Set<string>

        const initialUserCount = users.length;
        const initialTrackerCount = tracker.length;

        // 2. Filter Users (Rich Data)
        // Criteria: Not Blacklisted AND (Threshold Met OR Whitelisted)
        users = users.filter(u => {
            const lowerLogin = u.login.toLowerCase();
            
            if (blacklist.has(lowerLogin)) {
                console.log(`[Cleanup] Removing blacklisted user: ${u.login}`);
                return false;
            }

            const meetsThreshold = u.total_contributions >= config.github.minTotalContributions;
            const isWhitelisted = whitelist.has(lowerLogin);

            if (!meetsThreshold && !isWhitelisted) {
                console.log(`[Cleanup] Pruning user below threshold (${u.total_contributions}): ${u.login}`);
                return false;
            }

            return true;
        });

        // 3. Filter Tracker (Index)
        // Criteria: Not Blacklisted.
        // Note: We keep "below threshold" users in tracker to prevent re-crawling them immediately?
        // Actually, if we remove them from users.json, we probably want to keep them in tracker 
        // to remember "we saw them, and they are not worth fetching again yet".
        // BUT, if we add them to blacklist, we remove them from everywhere.
        tracker = tracker.filter(t => {
            const lowerLogin = t.login.toLowerCase();
            if (blacklist.has(lowerLogin)) return false;
            return true;
        });

        // 4. Sort Data
        // Users: Total Contributions DESC
        users.sort((a, b) => (b.total_contributions || 0) - (a.total_contributions || 0));

        // Tracker: Login ASC (Canonical order)
        tracker.sort((a, b) => a.login.localeCompare(b.login));

        // Blacklist/Whitelist/Visited: Convert to Array, Sort ASC
        const sortedBlacklist = Array.from(blacklist).sort();
        const sortedWhitelist = Array.from(whitelist).sort();
        const sortedVisited = Array.from(visited).sort();

        // 5. Save Changes
        // We use lower-level writeJson to enforce the sorted arrays for simple lists
        await Storage.writeJson(config.paths.users, users);
        // Tracker is usually an object map in storage, but getTracker returns array.
        // Storage.updateTracker expects array updates but handles map internally.
        // We want to overwrite the whole file with sorted structure? 
        // Actually, Storage.writeJson writes what we give it.
        // Let's Convert tracker array back to Map object for storage consistency?
        // Wait, Storage.mjs:
        // getTracker -> returns Array
        // updateTracker -> reads Object, updates, writes Object.
        // We want to REWRITE the file cleanly.
        // Let's perform a direct write of the Object (sorted keys?).
        // JSON.stringify keys order is not guaranteed but usually follows insertion order.
        
        const trackerMap = {};
        tracker.forEach(t => trackerMap[t.login] = t.lastUpdate);
        await Storage.writeJson(config.paths.tracker, trackerMap);

        await Storage.writeJson(config.paths.blacklist, sortedBlacklist);
        await Storage.writeJson(config.paths.whitelist, sortedWhitelist);
        await Storage.writeJson(config.paths.visited, sortedVisited);

        console.log(`[Cleanup] Complete.`);
        console.log(`  Users: ${initialUserCount} -> ${users.length} (-${initialUserCount - users.length})`);
        console.log(`  Tracker: ${initialTrackerCount} -> ${tracker.length} (-${initialTrackerCount - tracker.length})`);
    }
}

export default Neo.setupClass(Cleanup);
