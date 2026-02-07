import fs from 'fs/promises';
import Base from '../../../src/core/Base.mjs';
import config from './config.mjs';

/**
 * @summary Storage Service for DevRank.
 *
 * Handles all file I/O operations for the DevRank backend.
 * Manages the persistence of:
 * - Rich Data (data.json)
 * - User Index (users.json)
 * - Visited Nodes (visited.json)
 * - Blacklist (blacklist.json)
 *
 * @class DevRank.services.Storage
 * @extends Neo.core.Base
 * @singleton
 */
class Storage extends Base {
    static config = {
        /**
         * @member {String} className='DevRank.services.Storage'
         * @protected
         */
        className: 'DevRank.services.Storage',
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
     * Updates the tracker index.
     * Merges new entries or updates existing ones.
     * @param {Array<{login: String, lastUpdate: String}>} updates
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
     * Updates the rich users data store.
     * Performs a deep merge or replacement of records based on login.
     * @param {Array<Object>} newRecords
     * @returns {Promise<void>}
     */
    async updateUsers(newRecords) {
        const current = await this.getUsers();
        const map = new Map(current.map(r => [r.login, r]));
        let changed = false;

        for (const record of newRecords) {
            // For rich data, we generally assume 'record' is the latest full snapshot
            map.set(record.login, record);
            changed = true;
        }

        if (changed) {
            // Convert back to array
            let result = Array.from(map.values());
            
            // Sort by total contributions (descending)
            result.sort((a, b) => (b.total_contributions || 0) - (a.total_contributions || 0));
            
            await this.writeJson(config.paths.users, result);
        }
    }

    // --- Low Level Helpers ---

    /**
     * Reads a JSON file.
     * @param {String} path
     * @param {*} defaultValue
     * @returns {Promise<*>}
     * @private
     */
    async readJson(path, defaultValue) {
        try {
            const content = await fs.readFile(path, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return defaultValue;
            }
            throw error;
        }
    }

    /**
     * Writes data to a JSON file.
     * @param {String} path
     * @param {*} data
     * @returns {Promise<void>}
     * @private
     */
    async writeJson(path, data) {
        await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
    }
}

export default Neo.setupClass(Storage);
