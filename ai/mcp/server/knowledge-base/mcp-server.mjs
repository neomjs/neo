import {Command}       from 'commander';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import aiConfig        from './config.mjs';
import logger          from './logger.mjs';
import Server          from './Server.mjs';
import {sanitizeInput} from '../../../../buildScripts/util/Sanitizer.mjs';

const program = new Command();

program
    .name('neo-knowledge-base-mcp')
    .description('Neo.mjs Knowledge Base MCP Server')
    .option('-c, --config <path>', 'Path to the configuration file', sanitizeInput)
    .option('-d, --debug', 'Enable debug logging')
    .parse(process.argv);

const options = program.opts();

// Apply debug flag immediately
if (options.debug) {
    aiConfig.data.debug = true;
}

try {
    await Neo.create(Server, {
        configFile: options.config
    }).ready();
} catch (error) {
    logger.error('Fatal error during server initialization:', error);
    process.exit(1);
}
