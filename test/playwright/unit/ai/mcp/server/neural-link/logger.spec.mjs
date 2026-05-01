import {setup} from '../../../../../setup.mjs';

const appName = 'NLLoggerTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import fs              from 'fs-extra';
import os              from 'os';
import path            from 'path';
import {fileURLToPath} from 'url';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * Always-on file-sink coverage for Neural Link MCP server `logger.mjs` (#10582).
 *
 * Symmetric with KB and Memory Core logger specs (#10580 / #10582). NL differs from
 * KB/MC in stderr semantics — NL writes `info`/`warn`/`error` to stderr always,
 * `debug` only when `aiConfig.debug === true`. The new file sink runs ALWAYS
 * regardless of level (different from stderr), so the test forces `debug: false`
 * and verifies all 4 levels still land in the file.
 *
 * The pre-#10582 NL logger interpolated `JSON.stringify(args)` directly, which
 * silently destroyed Error.message and Error.stack. The replacement `stringifyArg`
 * helper unpacks Error instances and falls back gracefully on circular references
 * — symmetric with the #10580 RA2 fix on the KB side.
 */
test.describe('NL MCP server logger — always-on file sink (#10582)', () => {
    let logger;
    let aiConfig;
    let tmpLogDir;
    let originalLogPath;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../../ai/mcp/server/neural-link/config.mjs')).default;

        tmpLogDir       = path.resolve(os.tmpdir(), `nl-logger-test-${process.pid}-${Date.now()}`);
        originalLogPath = aiConfig.data.logPath;
        aiConfig.data.logPath = tmpLogDir;

        logger = (await import('../../../../../../../ai/mcp/server/neural-link/logger.mjs')).default;
    });

    test.afterAll(() => {
        aiConfig.data.logPath = originalLogPath;
        if (tmpLogDir && fs.existsSync(tmpLogDir)) {
            fs.rmSync(tmpLogDir, {recursive: true, force: true});
        }
    });

    test('writes log entries to daily-rotated nl-server file regardless of debug flag', async () => {
        const wasDebug = aiConfig.data.debug;
        aiConfig.data.debug = false;

        try {
            const today    = new Date().toISOString().slice(0, 10);
            const expected = path.join(tmpLogDir, `nl-server-${today}.log`);

            logger.debug('nl-debug-line');
            logger.info('nl-info-line');
            logger.warn('nl-warn-line');
            logger.error('nl-error-line');

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(fs.existsSync(expected)).toBe(true);
            const content = fs.readFileSync(expected, 'utf8');

            // All four levels — including debug — must land in the file even with
            // aiConfig.debug=false. The file sink is the diagnostic substrate; only
            // the stderr sink remains tier-gated.
            expect(content).toContain('[DEBUG] nl-debug-line');
            expect(content).toContain('[INFO] nl-info-line');
            expect(content).toContain('[WARN] nl-warn-line');
            expect(content).toContain('[ERROR] nl-error-line');

            const firstLine = content.split('\n').find(l => l.length > 0);
            expect(firstLine).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[DEBUG\]/);
        } finally {
            aiConfig.data.debug = wasDebug;
        }
    });

    test('preserves Error stack/message in the durable log (was lost via naked JSON.stringify pre-#10582)', async () => {
        const wasDebug = aiConfig.data.debug;
        aiConfig.data.debug = false;

        try {
            const today    = new Date().toISOString().slice(0, 10);
            const expected = path.join(tmpLogDir, `nl-server-${today}.log`);

            const err = new Error('nl introspect failed for ref_42');
            logger.error('inspect chain failed', err);

            const circular = {};
            circular.self = circular;
            logger.warn('circular sample', circular);

            await new Promise(resolve => setTimeout(resolve, 100));

            const content = fs.readFileSync(expected, 'utf8');
            expect(content).toContain('nl introspect failed for ref_42');
            expect(content).toContain('at '); // V8 stack frame marker
            expect(content).toContain('circular sample');
        } finally {
            aiConfig.data.debug = wasDebug;
        }
    });
});
