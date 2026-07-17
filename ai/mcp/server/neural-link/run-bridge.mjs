import {Command}           from 'commander';
import Neo                 from '../../../../src/Neo.mjs';
import * as core           from '../../../../src/core/_export.mjs';
import Bridge              from './Bridge.mjs';
import aiConfig            from './config.mjs';
import logger              from './logger.mjs';
import {sanitizeInput}     from '../../../../buildScripts/util/sanitizer.mjs';
import {fileURLToPath}     from 'node:url';
import {assertConfigFresh} from '../../../scripts/setup/initServerConfigs.mjs';
import {
    GENESIS_DIAGNOSTIC_ATTESTATION_ENV,
    attestDiagnosticPaths
} from './diagnosticPathAttestation.mjs';

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
        // Boot guard: read this bridge's required-env findings at the use site (the entrypoint reads the
        // SSOT; assertConfigFresh is a non-entrypoint that never does), then fail fast on
        // a stale overlay or a missing required leaf instead of crashing cryptically on an undefined leaf.
        const {findings} = aiConfig.validateRequiredEnv({entrypoint: 'neural-link-bridge'});
        await assertConfigFresh({requiredFindings: findings, serverPath: fileURLToPath(new URL('.', import.meta.url))});

        if (options.config) {
            await aiConfig.load(options.config);
        }

        const diagnosticMarker = attestDiagnosticPaths({
            expectedCommitment: process.env[GENESIS_DIAGNOSTIC_ATTESTATION_ENV],
            role              : 'bridge',
            sinks             : {logs: aiConfig.logPath}
        });

        if (diagnosticMarker) {
            process.stderr.write(`${diagnosticMarker}\n`)
        }

        logger.info('Starting Neural Link Bridge...');

        await Bridge.ready();
        await Bridge.startServer({host: '127.0.0.1', port: aiConfig.port});

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
