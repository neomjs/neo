import {Command} from 'commander';
import inquirer  from 'inquirer';
import Base      from '../../../src/core/Base.mjs';
import config    from './config.mjs';
import Storage   from './Storage.mjs';
import Updater   from './Updater.mjs';
import Spider    from './Spider.mjs';
import Cleanup   from './Cleanup.mjs';
import OptOut    from './OptOut.mjs';
import OptIn     from './OptIn.mjs';

/**
 * @summary DevIndex Backend Orchestrator & CLI Entry Point.
 *
 * This singleton acts as the **Controller** for the DevIndex data pipeline. It utilizes `commander` to parse
 * CLI arguments and `inquirer` to provide interactive prompts, offering a robust Developer Experience (DX).
 *
 * **Key Responsibilities:**
 * 1.  **Command Routing:** Delegates high-level commands (`spider`, `update`, `add`) to the appropriate micro-services.
 * 2.  **Lifecycle Orchestration:** Enforces data hygiene by automatically triggering `Cleanup.run()` *before* any
 *     operation that reads or modifies the data index. This "Pre-Run Cleanup" pattern ensures the pipeline always
 *     operates on valid, sorted, and pruned data.
 * 3.  **Smart Scheduling:** In the `update` command, it implements logic to skip users who have already been
 *     processed in the current calendar day, optimizing API quota usage.
 *
 * @class DevIndex.services.Manager
 * @extends Neo.core.Base
 * @singleton
 */
class Manager extends Base {
    static config = {
        /**
         * @member {String} className='DevIndex.services.Manager'
         * @protected
         */
        className: 'DevIndex.services.Manager',
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
    async initAsync() {
        await super.initAsync();

        const program = new Command();

        program
            .name('devindex-cli')
            .description('DevIndex Backend Services CLI')
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
            .command('add [username]')
            .description('Add or update a specific user')
            .action(async (username) => {
                if (!username) {
                    const answers = await inquirer.prompt([
                        {
                            type    : 'input',
                            name    : 'username',
                            message : 'Enter GitHub username to add:',
                            validate: input => input.trim() !== '' ? true : 'Username is required'
                        }
                    ]);
                    username = answers.username;
                }
                await this.runAdd(username);
            });

        program
            .command('spider')
            .description('Run the discovery spider to find new users')
            .option('-s, --strategy <type>', 'Force specific strategy (random, community, keyword, temporal, stargazer, search)')
            .action(async (options) => {
                let strategy = options.strategy;

                if (!strategy) {
                    const answers = await inquirer.prompt([{
                        type   : 'select',
                        name   : 'strategy',
                        message: 'Select Discovery Strategy:',
                        choices: [
                            {name: '🎲 Random (Default)',              value: null},
                            {name: '🕸️ Network Walker (Social Graph)', value: 'network_walker'},
                            {name: '👩‍💻 Community Scan (Diversity)',    value: 'community'},
                            {name: '🔑 Keyword Search',                value: 'keyword'},
                            {name: '⏳ Temporal Slicing',              value: 'temporal'},
                            {name: '🌟 Stargazer Leap',                value: 'stargazer'},
                            {name: '🔍 Core High Stars',               value: 'search'}
                        ]
                    }]);
                    strategy = answers.strategy;
                }

                await Cleanup.run(); // Pre-run hygiene
                await Spider.run(strategy);
            });

        program
            .command('cleanup')
            .description('Run data hygiene checks (purge, sort, filter)')
            .action(async () => {
                await Cleanup.run();
            });

        program
            .command('optout')
            .description('Process star-based opt-outs')
            .action(async () => {
                await OptOut.run();
            });

        program
            .command('optin')
            .description('Process star-based opt-ins')
            .action(async () => {
                await OptIn.run();
            });

        // Initialize Services
        await Storage.ready();

        await program.parseAsync(process.argv);
    }

    /**
     * Executes the Batch Update Workflow.
     *
     * 1.  **Filter:** Loads the Tracker and filters out users who have already been updated *today*.
     * 2.  **Prioritize:** Sorts the remaining users by `lastUpdate` timestamp (ascending), so that `null` (new)
     *     and oldest records are processed first.
     * 3.  **Batch:** Slices the list to the requested `limit`.
     * 4.  **Execute:** Delegates the actual processing to `Updater.processBatch`.
     *
     * @param {Number} limit The maximum number of users to update in this run.
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
