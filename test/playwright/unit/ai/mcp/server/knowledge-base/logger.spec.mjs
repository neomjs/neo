import {setup} from '../../../../../setup.mjs';

const appName = 'KBLoggerTest';

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
 * Always-on file-sink coverage for KB MCP server `logger.mjs` (#10576).
 *
 * Verifies the diagnostic substrate that #10573's gate refusal message points
 * operators at: every `logger.log/info/warn/error/debug` call lands in a
 * tail-able daily-rotated file under `aiConfig.logPath`, regardless of
 * `aiConfig.debug`. Stderr-tee remains debug-flag-gated (existing behavior;
 * out of scope here — verified manually since spying on `console.error`
 * mid-process is brittle in the Playwright runner).
 *
 * Test uses a per-process temp `logPath` to avoid polluting the canonical
 * `.neo-ai-data/logs/` directory; override is applied BEFORE the logger module
 * is imported (logger reads `aiConfig.logPath` at module-load time for the
 * `mkdirSync` call).
 */
test.describe('KB MCP server logger — always-on file sink (#10576)', () => {
    let logger;
    let aiConfig;
    let tmpLogDir;
    let originalLogPath;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../../ai/mcp/server/knowledge-base/config.mjs')).default;

        tmpLogDir       = path.resolve(os.tmpdir(), `kb-logger-test-${process.pid}-${Date.now()}`);
        originalLogPath = aiConfig.data.logPath;
        aiConfig.data.logPath = tmpLogDir;

        // Logger reads `aiConfig.logPath` lazily (per-write), so import order doesn't
        // matter — the override applied above takes effect on the next stream open.
        logger = (await import('../../../../../../../ai/mcp/server/knowledge-base/logger.mjs')).default;
    });

    test.afterAll(() => {
        aiConfig.data.logPath = originalLogPath;
        if (tmpLogDir && fs.existsSync(tmpLogDir)) {
            fs.rmSync(tmpLogDir, {recursive: true, force: true});
        }
    });

    test('preserves Error stack/message in the durable log (#10580 RA2)', async () => {
        const wasDebug = aiConfig.data.debug;
        aiConfig.data.debug = false;

        try {
            const today    = new Date().toISOString().slice(0, 10);
            const expected = path.join(tmpLogDir, `kb-server-${today}.log`);

            const err = new Error('chroma upsert failed at chunk 42');
            logger.error('embedding batch failed', err);

            // Also exercise circular-reference fallback so unhandled JSON throws can't
            // crash the logger itself (defensive — see stringifyArg in logger.mjs).
            const circular = {};
            circular.self = circular;
            logger.warn('circular sample', circular);

            await new Promise(resolve => setTimeout(resolve, 100));

            const content = fs.readFileSync(expected, 'utf8');

            // Error message + stack must both land in the file. JSON.stringify on an
            // Error returns `{}`; without the special-case, the post-mortem log would
            // be useless for the exact use case the file sink exists for.
            expect(content).toContain('chroma upsert failed at chunk 42');
            expect(content).toContain('at '); // stack frame marker (Node V8)

            // Circular ref must not throw inside the logger — falls back to String().
            expect(content).toContain('circular sample');
        } finally {
            aiConfig.data.debug = wasDebug;
        }
    });

    test('writes log entries to daily-rotated file regardless of debug flag', async () => {
        const wasDebug = aiConfig.data.debug;
        aiConfig.data.debug = false; // explicit: file sink must run with debug OFF.

        try {
            const today    = new Date().toISOString().slice(0, 10);
            const expected = path.join(tmpLogDir, `kb-server-${today}.log`);

            logger.log('hello-world');
            logger.info('info-line');
            logger.warn('warn-line');
            logger.error('error-line');

            // Streams are async — wait for buffered writes to flush.
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(fs.existsSync(expected)).toBe(true);

            const content = fs.readFileSync(expected, 'utf8');
            expect(content).toContain('[LOG] hello-world');
            expect(content).toContain('[INFO] info-line');
            expect(content).toContain('[WARN] warn-line');
            expect(content).toContain('[ERROR] error-line');

            // Each line carries an ISO 8601 timestamp prefix.
            const logLine = content.split('\n').find(line => line.includes('[LOG] hello-world'));
            expect(logLine).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[LOG\] hello-world/);
        } finally {
            aiConfig.data.debug = wasDebug;
        }
    });

});
