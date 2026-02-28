import Base from '../../../src/core/Base.mjs';
import config from './config.mjs';
import Storage from './Storage.mjs';

/**
 * @summary DevIndex Cleanup Service (Data Hygiene & Lifecycle Management).
 *
 * This singleton service acts as the **"Garbage Collector" and "State Enforcer"** for the DevIndex data pipeline.
 * It is automatically invoked by the `Manager` before any `spider` or `update` operation to ensure the system
 * starts with a clean, consistent state.
 *
 * **Core Responsibilities:**
 * 1.  **Threshold Pruning:** Removes users from both the Rich Data Store (`users.json`) and the Tracker Index (`tracker.json`)
 *     if they fall below the `minTotalContributions` threshold. This prevents the index from bloating with low-value data.
 * 2.  **Blocklist Enforcement:** Hard-deletes any user present in `blocklist.json` from all data files.
 * 3.  **Allowlist Protection:** "Resurrects" any user found in `allowlist.json` who is missing from the tracker, ensuring
 *     VIPs are always scheduled for updates. Also protects them from being pruned, regardless of their contribution count.
 * 4.  **Canonical Sorting:** Re-writes all JSON files with deterministic sorting (by contributions or login) to minimize
 *     git diff noise and ensure O(1) human readability.
 * 5.  **Penalty Box Retention:** Enforces a 30-day Time-To-Live (TTL) on failed users. If a user remains in the "Penalty Box"
 *     (`failed.json`) for >30 days, they are permanently expunged.
 *
 * **Key Concepts:**
 * - **Active Pruning:** The proactive removal of "dead weight" users to optimize the `Updater` loop.
 * - **Resurrection:** The mechanism to bring a user back into the tracking loop via the allowlist.
 *
 * @class DevIndex.services.Cleanup
 * @extends Neo.core.Base
 * @singleton
 */
class Cleanup extends Base {
    static config = {
        /**
         * @member {String} className='DevIndex.services.Cleanup'
         * @protected
         */
        className: 'DevIndex.services.Cleanup',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Executes the comprehensive cleanup and data hygiene workflow.
     *
     * **Steps:**
     * 1.  **Load State:** Reads all JSON data files into memory.
     * 1.5. **Retention Check:** Scans `failed.json` for expired entries (>30 days). Expired users are removed from the penalty box protection, effectively allowing them to be pruned if they remain invalid.
     * 2.  **Resurrection:** Checks `allowlist.json` against `tracker.json`. If a VIP is missing, they are added back to the queue.
     * 3.  **User Pruning:** Filters `users.json`. Removes any user who is in the blocklist OR (below threshold AND not allowlisted).
     * 4.  **Tracker Pruning:** Filters `tracker.json`. Removes users who have been scanned (`lastUpdate` exists) but failed the threshold check (are not in the filtered `users` list). Explicitly protects allowlisted users.
     * 5.  **Canonical Sorting:** Sorts all datasets (Users by contributions, others alphabetically) to minimize git diffs.
     * 6.  **Persistence:** Writes clean, sorted data back to disk.
     *
     * @returns {Promise<void>}
     */
    async run() {
        console.log('[Cleanup] Starting data hygiene check...');

        // 1. Load All Data
        let users     = await Storage.getUsers();
        let tracker   = await Storage.getTracker();
        let blocklist = await Storage.getBlocklist(); // Set<string>
        let allowlist = await Storage.getAllowlist(); // Set<string>
        let visited   = await Storage.getVisited(); // Set<string>
        let failed    = await Storage.getFailed(); // Map<string, string> (login -> timestamp)

        const initialUserCount    = users.length;
        const initialTrackerCount = tracker.length;

        // 1.25. Enforce Retention Policy (Penalty Box TTL)
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
        const now            = Date.now();
        const expiredLogins  = [];

        for (const [login, timestamp] of failed) {
            const ts = new Date(timestamp).getTime();
            if (now - ts > THIRTY_DAYS_MS) {
                console.log(`[Cleanup] Expiring failed user (TTL > 30d): ${login}`);
                expiredLogins.push(login);
                failed.delete(login); // Remove from memory map immediately (removes Tracker protection)
            }
        }

        const expiredSet = new Set(expiredLogins);

        // 1.5. Sync Allowlist -> Tracker (Resurrection)
        // Ensure all allowlisted users are in the tracker so they get scheduled.
        allowlist.forEach(login => {
            const lowerLogin = login.toLowerCase();
            // Check if already in tracker (case-insensitive check needed, or rely on normalization)
            // Tracker is an array of objects.
            const exists = tracker.some(t => t.login.toLowerCase() === lowerLogin);

            if (!exists && !blocklist.has(lowerLogin)) {
                console.log(`[Cleanup] Resurrecting allowlisted user: ${login}`);
                tracker.push({ login, lastUpdate: null });
            }
        });

        // 2. Filter Users (Rich Data)
        // Criteria: Not Blocklisted AND Not Expired AND (Threshold Met OR Allowlisted)
        users = users.filter(u => {
            const lowerLogin = u.l.toLowerCase();

            if (blocklist.has(lowerLogin)) {
                console.log(`[Cleanup] Removing blocklisted user: ${u.l}`);
                return false;
            }

            if (expiredSet.has(lowerLogin)) {
                console.log(`[Cleanup] Pruning expired failed user: ${u.l}`);
                return false;
            }

            const meetsThreshold = u.tc >= config.github.minTotalContributions;
            const isAllowlisted = allowlist.has(lowerLogin);

            if (!meetsThreshold && !isAllowlisted) {
                console.log(`[Cleanup] Pruning user below threshold (${u.tc}): ${u.l}`);
                return false;
            }

            return true;
        });

        // Create a Set for O(1) lookups
        const userLogins = new Set(users.map(u => u.l.toLowerCase()));

        // 3. Filter Tracker (Index)
        // Criteria: Not Blocklisted AND (Threshold Met OR Allowlisted)
        tracker = tracker.filter(t => {
            const lowerLogin = t.login.toLowerCase();

            if (blocklist.has(lowerLogin)) return false;
            if (allowlist.has(lowerLogin)) return true; // Explicit protection

            if (t.lastUpdate) {
                // If they have been updated, they must be in the filtered `users` list to stay in tracker.
                if (!userLogins.has(lowerLogin)) {
                    // Check for Penalty Box (failed updates)
                    if (failed.has(lowerLogin)) {
                        console.warn(`[Cleanup] Keeping failed user in tracker (Penalty Box): ${t.login}`);
                        return true;
                    }

                    // They were scanned but didn't make the cut. Prune from tracker.
                    console.log(`[Cleanup] Pruning orphaned user (scanned but low value): ${t.login}`);
                    return false;
                }
            }

            return true;
        });

        // 4. Sort Data
        // Users: Total Contributions DESC
        users.sort((a, b) => (b.tc || 0) - (a.tc || 0));

        // Tracker: Login ASC (Canonical order)
        tracker.sort((a, b) => a.login.localeCompare(b.login));

        // Blocklist/Allowlist/Visited: Convert to Array, Sort ASC
        const sortedBlocklist = Array.from(blocklist).sort();
        const sortedAllowlist = Array.from(allowlist).sort();
        const sortedVisited   = Array.from(visited).sort();

        // 5. Save Changes
        // We use lower-level writeJson to enforce the sorted arrays for simple lists
        await Storage.writeJson(config.paths.users, users);

        const trackerMap = {};
        tracker.forEach(t => trackerMap[t.login] = t.lastUpdate);
        await Storage.writeJson(config.paths.tracker, trackerMap);

        await Storage.writeJson(config.paths.blocklist, sortedBlocklist);
        await Storage.writeJson(config.paths.allowlist, sortedAllowlist);
        await Storage.writeJson(config.paths.visited, sortedVisited);
        await Storage.saveFailed(failed); // Persist map (migrates legacy array & removes expired)

        if (expiredLogins.length > 0) {
            console.log(`[Cleanup] Removed ${expiredLogins.length} expired users from Penalty Box.`);
        }

        console.log(`[Cleanup] Complete.`);
        console.log(`  Users: ${initialUserCount} -> ${users.length} (-${initialUserCount - users.length})`);
        console.log(`  Tracker: ${initialTrackerCount} -> ${tracker.length} (-${initialTrackerCount - tracker.length})`);
    }
}

export default Neo.setupClass(Cleanup);
