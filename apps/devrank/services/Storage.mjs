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
            { path: config.paths.data,      default: [] },
            { path: config.paths.users,     default: [] },
            { path: config.paths.visited,   default: [] },
            { path: config.paths.blacklist, default: [] }
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
        // Normalize to lowercase for case-insensitive matching
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
     * Reads the lightweight user index.
     * @returns {Promise<Array<{login: String, lastUpdate: String}>>}
     */
    async getUsersIndex() {
        return this.readJson(config.paths.users, []);
    }

    /**
     * Updates the user index.
     * Merges new entries or updates existing ones.
     * @param {Array<{login: String, lastUpdate: String}>} updates
     * @returns {Promise<void>}
     */
    async updateUsersIndex(updates) {
        const current = await this.getUsersIndex();
        const map = new Map(current.map(u => [u.login, u]));
        let changed = false;

        for (const update of updates) {
            const existing = map.get(update.login);
            
            // Update if new or if timestamp is newer (lexicographical string comparison works for ISO dates)
            if (!existing || (update.lastUpdate && (!existing.lastUpdate || update.lastUpdate > existing.lastUpdate))) {
                map.set(update.login, {
                    login: update.login,
                    lastUpdate: update.lastUpdate || existing?.lastUpdate || null
                });
                changed = true;
            }
        }

        if (changed) {
            const sorted = Array.from(map.values());
            // Sort logic can be handled here or by the consumer. 
            // Saving it sorted by login might be nice for stability, 
            // but the Updater will sort by date anyway.
            await this.writeJson(config.paths.users, sorted);
        }
    }

    /**
     * Reads the rich data.
     * @returns {Promise<Array<Object>>}
     */
    async getData() {
        return this.readJson(config.paths.data, []);
    }

    /**
     * Updates the rich data store.
     * Performs a deep merge or replacement of records based on login.
     * @param {Array<Object>} newRecords
     * @returns {Promise<void>}
     */
    async updateData(newRecords) {
        const current = await this.getData();
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
            
            // Sort by total contributions (descending) as per requirement
            result.sort((a, b) => (b.total_contributions || 0) - (a.total_contributions || 0));
            
            await this.writeJson(config.paths.data, result);
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
