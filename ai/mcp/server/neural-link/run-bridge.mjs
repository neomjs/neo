import {Command}           from 'commander';
import Neo                 from '../../../../src/Neo.mjs';
import * as core           from '../../../../src/core/_export.mjs';
import Bridge              from './Bridge.mjs';
import aiConfig            from './config.mjs';
import logger              from './logger.mjs';
import {sanitizeInput}     from '../../../../buildScripts/util/sanitizer.mjs';
import {fileURLToPath}     from 'node:url';
import {assertConfigFresh} from '../../../scripts/setup/initServerConfigs.mjs';

const program = new Command();

program
    .name('neo-neural-bridge')
    .description('Neo.mjs Neural Link Bridge Server')
    .option('-c, --config <path>', 'Path to the configuration file', sanitizeInput)
    .option('-d, --debug', 'Enable debug logging')
    .parse(process.argv);

const options = program.opts();

if (options.debug) {
    aiConfig.debug = true;
}

(async () => {
    try {
        // Boot guard: fail fast with an actionable message if a materialized config overlay is missing
        // leaves its template added, rather than crashing cryptically on an undefined config leaf later.
        await assertConfigFresh({serverPath: fileURLToPath(new URL('.', import.meta.url))});

        if (options.config) {
            await aiConfig.load(options.config);
        }

        logger.info('Starting Neural Link Bridge...');

        await Bridge.ready();

        // Keep process alive
        process.on('SIGINT', async () => {
            logger.info('Received SIGINT. Shutting down...');
            await Bridge.stopServer();
            process.exit(0);
        });

    } catch (error) {
        console.error('Fatal error starting Bridge:', error);
        process.exit(1);
    }
})();
