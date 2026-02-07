import { Command } from 'commander';
import Base from '../../../src/core/Base.mjs';
import config from './config.mjs';
import Storage from './Storage.mjs';
import Updater from './Updater.mjs';
import Spider from './Spider.mjs';
import Cleanup from './Cleanup.mjs';

/**
 * @summary DevRank Backend Orchestrator.
 *
 * The main entry point for the CLI. Parses arguments and delegates to
 * specific services (Updater, Spider).
 *
 * @class DevRank.services.Manager
 * @extends Neo.core.Base
 * @singleton
 */
class Manager extends Base {
    static config = {
        /**
         * @member {String} className='DevRank.services.Manager'
         * @protected
         */
        className: 'DevRank.services.Manager',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
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
            .option('-l, --limit <number>', 'Number of users to update', (val) => parseInt(val, 10), config.spider.batchSize)
            .action(async (options) => {
                console.log('[Manager] Options:', options);
                await Cleanup.run(); // Pre-run hygiene
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
                await Cleanup.run(); // Pre-run hygiene
                await Spider.run();
            });

        program
            .command('cleanup')
            .description('Run data hygiene checks (purge, sort, filter)')
            .action(async () => {
                await Cleanup.run();
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
        const users = await Storage.getTracker();
        const today = new Date().toISOString().split('T')[0];

        // Filter out users already updated today
        const staleUsers = users.filter(u => {
            if (!u.lastUpdate) return true;
            return !u.lastUpdate.startsWith(today);
        });
        
        const backlogSize = staleUsers.length;
        console.log(`[Manager] Backlog size: ${backlogSize} users (pending update today).`);

        if (backlogSize === 0) {
            console.log('[Manager] All users are up to date.');
            return;
        }

        // Sort: Oldest updates first. Null/undefined comes first.
        const sorted = staleUsers.sort((a, b) => {
            if (!a.lastUpdate) return -1;
            if (!b.lastUpdate) return 1;
            return a.lastUpdate.localeCompare(b.lastUpdate);
        });

        const candidates = sorted.slice(0, limit).map(u => u.login);

        await Updater.processBatch(candidates, backlogSize);
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
