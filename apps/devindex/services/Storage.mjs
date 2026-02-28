import fs from 'fs/promises';
import Base from '../../../src/core/Base.mjs';
import config from './config.mjs';

/**
 * @summary DevIndex Persistence Layer (JSON File System).
 *
 * This service manages all file I/O operations, acting as a simple, flat-file database abstraction.
 * It ensures atomic-ish writes (by overwriting files completely) and handles the normalization of data.
 *
 * **Managed Resources:**
 * - **`users.jsonl` (Rich Data Store):** Contains the full, enriched profile data for all users who met the threshold.
 *   This is the source of truth for the Frontend UI.
 *   **The `maxUsers` Cap:** To ensure the application remains highly responsive, the size of this file is
 *   strictly capped (e.g., 50,000 users). While the data is gzipped and streamed to the client, an unbounded
 *   file (e.g., 100k users / 40MB) would eventually cause client-side parsing and memory bottlenecks.
 *   When the cap is reached, `Storage` automatically prunes the bottom performers and raises the entry
 *   bar via `threshold.json`.
 * - **`tracker.json` (The Index):** A lightweight map (`login` -> `lastUpdate`) used by the Backend to schedule updates.
 *   It includes "Pending" users (`lastUpdate: null`) discovered by the Spider but not yet processed.
 * - **`visited.json` (Cache):** A Set of keys (e.g., `repo:owner/name`) to prevent the Spider from re-scanning the same sources.
 * - **`blocklist.json` / `allowlist.json`:** Configuration files for manual overrides.
 *
 * **Key Features:**
 * - **Case Insensitivity:** Automatically normalizes login keys to lowercase to prevent duplicates.
 * - **Deletion Support:** The `updateTracker` method supports a `delete: true` flag for active pruning.
 *
 * @class DevIndex.services.Storage
 * @extends Neo.core.Base
 * @singleton
 */
class Storage extends Base {
    static config = {
        /**
         * @member {String} className='DevIndex.services.Storage'
         * @protected
         */
        className: 'DevIndex.services.Storage',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Initializes the storage service.
     * Ensures all required data files exist.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await this.ensureFiles();
    }

    /**
     * Checks if data files exist and creates them with defaults if missing.
     * @returns {Promise<void>}
     */
    async ensureFiles() {
        const files = [
            { path: config.paths.users,     default: [] },
            { path: config.paths.tracker,   default: {} },
            { path: config.paths.visited,   default: [] },
            { path: config.paths.blocklist, default: [] },
            { path: config.paths.allowlist, default: [] },
            { path: config.paths.failed,    default: {} },
            { path: config.paths.threshold, default: { tc: config.github.minTotalContributions } },
            { path: config.paths.optoutSync, default: { lastCheck: null } },
            { path: config.paths.optinSync, default: { lastCheck: null } }
        ];

        for (const file of files) {
            try {
                await fs.access(file.path);
            } catch {
                await this.writeJson(file.path, file.default);
                console.log(`[Storage] Created missing file: ${file.path}`);
            }
        }
    }

    /**
     * Reads the blocklist.
     * @returns {Promise<Set<String>>} Set of blocklisted logins.
     */
    async getBlocklist() {
        const list = await this.readJson(config.paths.blocklist, []);
        return new Set(list.map(item => item.toLowerCase()));
    }

    /**
     * Adds users to the blocklist.
     * @param {Array<String>} logins
     * @returns {Promise<void>}
     */
    async addToBlocklist(logins) {
        const current = await this.readJson(config.paths.blocklist, []);
        const currentSet = new Set(current.map(item => item.toLowerCase()));
        let changed = false;

        for (const login of logins) {
            if (!currentSet.has(login.toLowerCase())) {
                current.push(login);
                currentSet.add(login.toLowerCase());
                changed = true;
            }
        }

        if (changed) {
            current.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
            await this.writeJson(config.paths.blocklist, current);
        }
    }

    /**
     * Removes users from the blocklist.
     * @param {Array<String>} logins
     * @returns {Promise<void>}
     */
    async removeFromBlocklist(logins) {
        const current = await this.readJson(config.paths.blocklist, []);
        const targetSet = new Set(logins.map(l => l.toLowerCase()));
        
        const initialLen = current.length;
        const filtered = current.filter(item => !targetSet.has(item.toLowerCase()));

        if (filtered.length !== initialLen) {
            await this.writeJson(config.paths.blocklist, filtered);
        }
    }

    /**
     * Reads the opt-out sync state.
     * @returns {Promise<Object>}
     */
    async getOptOutSync() {
        return this.readJson(config.paths.optoutSync, { lastCheck: null });
    }

    /**
     * Saves the opt-out sync state.
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async saveOptOutSync(data) {
        await this.writeJson(config.paths.optoutSync, data);
    }

    /**
     * Reads the opt-in sync state.
     * @returns {Promise<Object>}
     */
    async getOptInSync() {
        return this.readJson(config.paths.optinSync, { lastCheck: null });
    }

    /**
     * Saves the opt-in sync state.
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async saveOptInSync(data) {
        await this.writeJson(config.paths.optinSync, data);
    }

    /**
     * Reads the allowlist.
     * @returns {Promise<Set<String>>} Set of allowlisted logins.
     */
    async getAllowlist() {
        const list = await this.readJson(config.paths.allowlist, []);
        return new Set(list.map(item => item.toLowerCase()));
    }

    /**
     * Reads the minimum required total contributions from the threshold file.
     * @returns {Promise<Number>}
     */
    async getLowestContributionThreshold() {
        const data = await this.readJson(config.paths.threshold, { tc: config.github.minTotalContributions });
        return data.tc;
    }

    /**
     * Reads the failed list (Penalty Box).
     * Handles legacy Array format by migrating to Map with current timestamp.
     * @returns {Promise<Map<String, String>>} Map of login -> timestamp.
     */
    async getFailed() {
        const raw = await this.readJson(config.paths.failed, {});
        const map = new Map();

        if (Array.isArray(raw)) {
            // Migration: Convert legacy array to Object with current timestamp
            const now = new Date().toISOString();
            raw.forEach(login => map.set(login.toLowerCase(), now));
        } else {
            Object.entries(raw).forEach(([login, ts]) => map.set(login.toLowerCase(), ts));
        }

        return map;
    }

    /**
     * Updates the failed list (Penalty Box).
     * @param {Array<String>} logins List of logins to add or remove.
     * @param {Boolean} [add=true] True to add, False to remove.
     * @returns {Promise<void>}
     */
    async updateFailed(logins, add=true) {
        const current = await this.getFailed();
        let changed = false;

        logins.forEach(login => {
            const key = login.toLowerCase();
            if (add) {
                if (!current.has(key)) {
                    current.set(key, new Date().toISOString());
                    changed = true;
                }
            } else {
                if (current.has(key)) {
                    current.delete(key);
                    changed = true;
                }
            }
        });

        if (changed) {
            await this.saveFailed(current);
        }
    }

    /**
     * Persists the failed map to disk.
     * @param {Map<String, String>} map
     * @returns {Promise<void>}
     */
    async saveFailed(map) {
        const sorted = {};
        Array.from(map.keys()).sort().forEach(key => {
            sorted[key] = map.get(key);
        });
        await this.writeJson(config.paths.failed, sorted);
    }

    /**
     * Reads the visited log.
     * @returns {Promise<Set<String>>} Set of visited keys (e.g. "repo:owner/name", "user:login").
     */
    async getVisited() {
        const list = await this.readJson(config.paths.visited, []);
        return new Set(list);
    }

    /**
     * Saves new items to the visited log.
     * @param {Set<String>|Array<String>} newItems
     * @returns {Promise<void>}
     */
    async updateVisited(newItems) {
        const current    = await this.readJson(config.paths.visited, []);
        const currentSet = new Set(current);
        let changed      = false;

        const items = Array.isArray(newItems) ? newItems : Array.from(newItems);

        for (const item of items) {
            if (!currentSet.has(item)) {
                currentSet.add(item);
                changed = true;
            }
        }

        if (changed) {
            await this.writeJson(config.paths.visited, Array.from(currentSet));
        }
    }

    /**
     * Reads the tracker index (formerly users.json).
     * @returns {Promise<Array<{login: String, lastUpdate: String}>>}
     */
    async getTracker() {
        const raw = await this.readJson(config.paths.tracker, {});

        // Return as Array for Consumers
        return Object.entries(raw).map(([login, lastUpdate]) => ({ login, lastUpdate }));
    }

    /**
     * Updates the Tracker Index with new states or timestamps.
     *
     * Handles three types of operations based on the input:
     * 1.  **Insert (Discovery):** Adds a new user with `lastUpdate: null`.
     * 2.  **Update (Success):** Updates an existing user with a new `lastUpdate` timestamp.
     * 3.  **Delete (Pruning):** Removes a user if `delete: true` is present in the update object.
     *
     * Performs a case-insensitive lookup to prevent duplicate entries for the same user.
     *
     * @param {Object[]} updates List of update operations.
     * @param {String} updates[].login The user's login.
     * @param {String} [updates[].lastUpdate] The last update timestamp.
     * @param {Boolean} [updates[].delete] True to delete the user.
     * @returns {Promise<void>}
     */
    async updateTracker(updates) {
        const current = await this.readJson(config.paths.tracker, {});
        // Normalize keys to lowercase to prevent duplicates
        const map = {};
        Object.entries(current).forEach(([k, v]) => map[k.toLowerCase()] = { originalKey: k, val: v });

        let changed = false;

        for (const update of updates) {
            const key      = update.login.toLowerCase();
            const existing = map[key];

            // Update if new or if timestamp is newer
            // Note: We might be updating the key casing if the new login has different casing,
            // but for the map we stick to the original unless it's new.
            // Actually, we want to canonicalize to the most recent login casing?
            // Let's just use the update.login as the key if we write it back.

            const existingTime = existing ? existing.val : undefined;

            if (update.delete) {
                if (existing) {
                    delete map[key];
                    changed = true;
                }
            } else if (existingTime == null || (update.lastUpdate && update.lastUpdate > existingTime)) {
                // If it exists, update the entry. If not, create new.
                if (existing) {
                    existing.val = update.lastUpdate || existingTime || null;
                    // Optionally update originalKey if we want to prefer the new casing
                    existing.originalKey = update.login;
                } else {
                    map[key] = { originalKey: update.login, val: update.lastUpdate || null };
                }
                changed = true;
            }
        }

        if (changed) {
            // Reconstruct object with original keys
            const out = {};
            Object.values(map).forEach(item => {
                out[item.originalKey] = item.val;
            });
            await this.writeJson(config.paths.tracker, out);
        }
    }

    /**
     * Reads the rich users data (formerly data.json).
     * @returns {Promise<Array<Object>>}
     */
    async getUsers() {
        return this.readJson(config.paths.users, []);
    }

    /**
     * Persists enriched user profiles to the Rich Data Store (`users.json`).
     *
     * Performs a **Merge & Sort** operation:
     * 1.  Loads existing data.
     * 2.  Overwrites or adds new records based on the `login` key.
     * 3.  **Sorts** the entire dataset by `total_contributions` (descending) to ensure the file is always ready for UI consumption.
     * 4.  Writes the result back to disk atomically.
     *
     * @param {Array<Object>} newRecords Array of user objects to upsert.
     * @returns {Promise<void>}
     */
    async updateUsers(newRecords) {
        const current = await this.getUsers();
        const map     = new Map(current.map(r => [r.l, r])); // 'l' is login
        let changed   = false;

        for (const record of newRecords) {
            // For rich data, we generally assume 'record' is the latest full snapshot
            map.set(record.l, record);
            changed = true;
        }

        if (changed) {
            // Convert back to array
            let result = Array.from(map.values());

            // Sort by total contributions (descending). 'tc' is total_contributions
            result.sort((a, b) => (b.tc || 0) - (a.tc || 0));

            const maxUsers   = config.github.maxUsers;
            const allowlist  = await this.getAllowlist();

            // We calculate `effectiveMax` as `maxUsers + allowlist.size` to protect the Meritocracy.
            // If we simply sliced at `maxUsers`, manually allowlisted users (e.g., conference speakers)
            // would unfairly consume slots that belong to organic, high-performing developers.
            // By adding the allowlist size to the cap, we guarantee 50,000 organic slots remain open.
            const effectiveMax = maxUsers ? maxUsers + allowlist.size : null;
            let prunedLogins = [];

            if (effectiveMax && result.length > effectiveMax) {
                const pruned = result.slice(effectiveMax);
                prunedLogins = pruned.map(u => u.l);
                result       = result.slice(0, effectiveMax);

                // Update threshold
                const lowestTc = result[result.length - 1].tc || config.github.minTotalContributions;
                await this.writeJson(config.paths.threshold, { tc: lowestTc });
            }

            await this.writeJson(config.paths.users, result);

            // Clean up tracker and penalty box if we pruned
            if (prunedLogins.length > 0) {
                const trackerUpdates = prunedLogins.map(login => ({ login, delete: true }));
                await this.updateTracker(trackerUpdates);
                await this.updateFailed(prunedLogins, false);
            }
        }
    }

    /**
     * Removes users from the Rich Data Store (`users.jsonl`).
     * @param {Array<String>} logins The list of logins to remove.
     * @returns {Promise<Boolean>} True if any were removed.
     */
    async deleteUsers(logins) {
        const current    = await this.getUsers();
        const targets    = new Set(logins.map(l => l.toLowerCase()));
        const initialLen = current.length;
        const filtered   = current.filter(u => !targets.has(u.l.toLowerCase()));

        if (filtered.length !== initialLen) {
            await this.writeJson(config.paths.users, filtered);
            return true;
        }
        return false;
    }

    // --- Low Level Helpers ---

    /**
     * Reads a JSON or JSONL file.
     * @param {String} path
     * @param {*} defaultValue
     * @returns {Promise<*>}
     * @private
     */
    async readJson(path, defaultValue) {
        try {
            const content = await fs.readFile(path, 'utf-8');

            if (path.endsWith('.jsonl')) {
                if (!content.trim()) return [];
                return content
                    .split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));
            }

            return JSON.parse(content);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return defaultValue;
            }
            throw error;
        }
    }

    /**
     * Writes data to a JSON or JSONL file.
     * @param {String} path
     * @param {*} data
     * @returns {Promise<void>}
     * @private
     */
    async writeJson(path, data) {
        let content;

        if (path.endsWith('.jsonl')) {
            if (Array.isArray(data)) {
                content = data.map(item => JSON.stringify(item)).join('\n');
            } else {
                throw new Error('JSONL writer expects an Array');
            }
        } else if (path === config.paths.users && Array.isArray(data)) {
            // Legacy/Fallback formatter for users.json
            const lines = data.map(item => JSON.stringify(item));
            content = `[\n${lines.join(',\n')}\n]`;
        } else {
            content = JSON.stringify(data, null, 2);
        }

        const tempPath = `${path}.tmp`;
        await fs.writeFile(tempPath, content, 'utf-8');
        await fs.rename(tempPath, path);
    }
}

export default Neo.setupClass(Storage);
