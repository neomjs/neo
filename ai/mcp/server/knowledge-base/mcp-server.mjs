import 'dotenv/config';
import {Command}           from 'commander';
import Neo                 from '../../../../src/Neo.mjs';
import * as core           from '../../../../src/core/_export.mjs';
import InstanceManager     from '../../../../src/manager/Instance.mjs';
import aiConfig            from './config.mjs';
import logger              from './logger.mjs';
import Server              from './Server.mjs';
import {sanitizeInput}     from '../../../../buildScripts/util/sanitizer.mjs';
import {fileURLToPath}     from 'node:url';
import {assertConfigFresh} from '../../../scripts/setup/initServerConfigs.mjs';

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
    aiConfig.debug = true;
}

try {
    // Boot guard: read this server's required-env findings at the use site (the entrypoint reads the
    // SSOT; assertConfigFresh is a non-entrypoint that never does), then fail fast on a
    // stale overlay or a missing required leaf instead of crashing cryptically on an undefined leaf.
    const {findings} = aiConfig.validateRequiredEnv({entrypoint: 'knowledge-base-mcp'});
    await assertConfigFresh({requiredFindings: findings, serverPath: fileURLToPath(new URL('.', import.meta.url))});

    await Neo.create(Server, {
        configFile: options.config
    }).ready();
} catch (error) {
    logger.fatalStartup('Fatal error during server initialization:', error);
    process.exit(1);
}
