import 'dotenv/config';
import {Command}       from 'commander';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import aiConfig        from './config.mjs';
import logger          from './logger.mjs';
import Server          from './Server.mjs';
import {sanitizeInput} from '../../../../buildScripts/util/sanitizer.mjs';

const program = new Command();

program
    .name('neo-gitlab-workflow-mcp')
    .description('Neo.mjs GitLab Workflow MCP Server')
    .option('-c, --config <path>', 'Path to the configuration file', sanitizeInput)
    .option('-d, --debug', 'Enable debug logging')
    .parse(process.argv);

const options = program.opts();

if (options.debug) {
    aiConfig.debug = true;
}

try {
    await Neo.create(Server, {
        configFile: options.config
    }).ready();
} catch (error) {
    logger.error('Fatal error during server initialization:', error);
    process.exit(1);
}
