import { Command } from 'commander';
import Base from '../../../src/core/Base.mjs';
import config from './config.mjs';
import Storage from './Storage.mjs';
import Updater from './Updater.mjs';
import Spider from './Spider.mjs';

/**
 * @summary DevRank Backend Orchestrator.
 *
 * The main entry point for the CLI. Parses arguments and delegates to
 * specific services (Updater, Spider).
 *
 * @class DevRank.services.Manager
 * @extends Neo.core.Base
 */
class Manager extends Base {
    static config = {
        /**
         * @member {String} className='DevRank.services.Manager'
         * @protected
         */
        className: 'DevRank.services.Manager'
    }

    /**
     * Entry point for the application.
     * @returns {Promise<void>}
     */
    async main() {
        const program = new Command();

        program
            .name('devrank-cli')
            .description('DevRank Backend Services CLI')
            .version('1.0.0');

        program
            .command('update')
            .description('Update existing users with stale data')
            .option('-l, --limit <number>', 'Number of users to update', parseInt, config.spider.batchSize)
            .action(async (options) => {
                await this.runUpdate(options.limit);
            });

        program
            .command('add <username>')
            .description('Add or update a specific user')
            .action(async (username) => {
                await this.runAdd(username);
            });

        program
            .command('spider')
            .description('Run the discovery spider to find new users')
            .action(async () => {
                await Spider.run();
            });

        // Initialize Services
        await Storage.initAsync();

        await program.parseAsync(process.argv);
    }

    /**
     * Logic for the 'update' command.
     * @param {Number} limit
     */
    async runUpdate(limit) {
        console.log(`[Manager] Running Update Mode (Limit: ${limit})...`);
        const users = await Storage.getUsersIndex();

        // Sort: Oldest updates first. Null/undefined comes first.
        // We use a simple string comparison for ISO dates.
        const sorted = users.sort((a, b) => {
            if (!a.lastUpdate) return -1;
            if (!b.lastUpdate) return 1;
            return a.lastUpdate.localeCompare(b.lastUpdate);
        });

        const candidates = sorted.slice(0, limit).map(u => u.login);

        if (candidates.length === 0) {
            console.log('[Manager] No users found to update.');
            return;
        }

        await Updater.processBatch(candidates);
    }

    /**
     * Logic for the 'add' command.
     * @param {String} username
     */
    async runAdd(username) {
        console.log(`[Manager] Adding/Updating user: ${username}`);
        await Updater.processBatch([username]);
    }
}

export default Neo.setupClass(Manager);
