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
 * - **`users.json` (Rich Data Store):** Contains the full, enriched profile data for all users who met the threshold.
 *   This is the source of truth for the Frontend UI.
 * - **`tracker.json` (The Index):** A lightweight map (`login` -> `lastUpdate`) used by the Backend to schedule updates.
 *   It includes "Pending" users (`lastUpdate: null`) discovered by the Spider but not yet processed.
 * - **`visited.json` (Cache):** A Set of keys (e.g., `repo:owner/name`) to prevent the Spider from re-scanning the same sources.
 * - **`blacklist.json` / `whitelist.json`:** Configuration files for manual overrides.
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
            { path: config.paths.blacklist, default: [] },
            { path: config.paths.whitelist, default: [] }
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
     * Reads the blacklist.
     * @returns {Promise<Set<String>>} Set of blacklisted logins.
     */
    async getBlacklist() {
        const list = await this.readJson(config.paths.blacklist, []);
        return new Set(list.map(item => item.toLowerCase()));
    }

    /**
     * Reads the whitelist.
     * @returns {Promise<Set<String>>} Set of whitelisted logins.
     */
    async getWhitelist() {
        const list = await this.readJson(config.paths.whitelist, []);
        return new Set(list.map(item => item.toLowerCase()));
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
        const current = await this.readJson(config.paths.visited, []);
        const currentSet = new Set(current);
        let changed = false;

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
     * @param {Array<{login: String, lastUpdate: String, delete?: Boolean}>} updates List of update operations.
     * @returns {Promise<void>}
     */
    async updateTracker(updates) {
        const current = await this.readJson(config.paths.tracker, {});
        // Normalize keys to lowercase to prevent duplicates
        const map = {};
        Object.entries(current).forEach(([k, v]) => map[k.toLowerCase()] = { originalKey: k, val: v });

        let changed = false;

        for (const update of updates) {
            const key = update.login.toLowerCase();
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
        const map = new Map(current.map(r => [r.l, r])); // 'l' is login
        let changed = false;

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
            
            await this.writeJson(config.paths.users, result);
        }
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
