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
import {
    GENESIS_DIAGNOSTIC_ATTESTATION_ENV,
    GENESIS_DIAGNOSTIC_PATH_MISMATCH
} from './diagnosticPathAttestation.mjs';

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
    // Boot guard: read this server's required-env findings at the use site (the entrypoint reads the
    // SSOT; assertConfigFresh is a non-entrypoint that never does), then fail fast on a
    // stale overlay or a missing required leaf instead of crashing cryptically on an undefined leaf.
    const {findings} = aiConfig.validateRequiredEnv({entrypoint: 'neural-link-mcp'});
    await assertConfigFresh({requiredFindings: findings, serverPath: fileURLToPath(new URL('.', import.meta.url))});

    await Neo.create(Server, {
        configFile               : options.config,
        bridgeCwd                : options.cwd,
        diagnosticPathAttestation: process.env[GENESIS_DIAGNOSTIC_ATTESTATION_ENV],
        toolProjectionMode       : resolveToolProjectionMode(options.toolProjectionMode)
    }).ready();
} catch (error) {
    if (error.code === GENESIS_DIAGNOSTIC_PATH_MISMATCH) {
        process.stderr.write(`Fatal error during server initialization: ${error.code}\n`)
    } else {
        logger.fatalStartup('Fatal error during server initialization:', error)
    }
    process.exit(1);
}
