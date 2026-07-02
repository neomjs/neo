import 'dotenv/config';
import {Command}                           from 'commander';
import Neo                                 from '../../../../src/Neo.mjs';
import * as core                           from '../../../../src/core/_export.mjs';
import InstanceManager                     from '../../../../src/manager/Instance.mjs';
import aiConfig                            from './config.mjs';
import logger                              from './logger.mjs';
import Server, {resolveToolProjectionMode} from './Server.mjs';
import {sanitizeInput}                     from '../../../../buildScripts/util/sanitizer.mjs';
import {fileURLToPath}                     from 'node:url';
import {assertConfigFresh}                 from '../../../scripts/setup/initServerConfigs.mjs';

const program = new Command();

program
    .name('neo-neural-link-mcp')
    .description('Neo.mjs Neural Link MCP Server')
    .option('-c, --config <path>', 'Path to the configuration file', sanitizeInput)
    .option('-w, --cwd <path>', 'Working directory for the bridge process')
    .option('-d, --debug', 'Enable debug logging')
    .option('--tool-projection-mode <mode>', 'Pin this server instance to a forced tool-projection ceiling (e.g. harness-embedded) a client cannot widen past. Falls back to the NEO_NL_TOOL_PROJECTION_MODE env var (the Fleet Manager spawn-injection channel); CLI flag wins. Unset = full developer/operator surface.')
    .parse(process.argv);

const options = program.opts();

// Apply debug flag immediately
if (options.debug) {
    aiConfig.debug = true;
}

try {
    // Boot guard: fail fast with an actionable message if a materialized config overlay is missing
    // leaves its template added, rather than crashing cryptically on an undefined config leaf later.
    await assertConfigFresh({aiConfig, entrypoint: 'neural-link-mcp', serverPath: fileURLToPath(new URL('.', import.meta.url))});

    await Neo.create(Server, {
        configFile        : options.config,
        bridgeCwd         : options.cwd,
        toolProjectionMode: resolveToolProjectionMode(options.toolProjectionMode)
    }).ready();
} catch (error) {
    logger.fatalStartup('Fatal error during server initialization:', error);
    process.exit(1);
}
