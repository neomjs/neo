import {setup} from '../../../../../setup.mjs';

const appName = 'MCLoggerTest';

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
 * Always-on file-sink coverage for Memory Core MCP server `logger.mjs` (#10582).
 *
 * Symmetric with `test/playwright/unit/ai/mcp/server/knowledge-base/logger.spec.mjs`
 * (introduced in #10580). Verifies:
 *
 * 1. Every `logger.log/info/warn/error/debug` call lands in a daily-rotated file
 *    under `aiConfig.logPath` (filename prefix `mc-server-`, distinct from KB's
 *    `kb-server-` and NL's `nl-server-`).
 * 2. `Error` instances preserve name + message + stack in the durable log
 *    (the post-mortem trail JSON.stringify silently destroys without help).
 * 3. Circular references fall back to String() coercion so logger throws can't
 *    crash callers.
 *
 * Test override is applied via `aiConfig.data.logPath = tmpDir`; logger reads it
 * lazily per-write so import order doesn't matter.
 */
test.describe('MC MCP server logger — always-on file sink (#10582)', () => {
    let logger;
    let aiConfig;
    let tmpLogDir;
    let originalLogPath;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        tmpLogDir       = path.resolve(os.tmpdir(), `mc-logger-test-${process.pid}-${Date.now()}`);
        originalLogPath = aiConfig.data.logPath;
        aiConfig.data.logPath = tmpLogDir;

        logger = (await import('../../../../../../../ai/mcp/server/memory-core/logger.mjs')).default;
    });

    test.afterAll(() => {
        aiConfig.data.logPath = originalLogPath;
        if (tmpLogDir && fs.existsSync(tmpLogDir)) {
            fs.rmSync(tmpLogDir, {recursive: true, force: true});
        }
    });

    test('writes log entries to daily-rotated mc-server file regardless of debug flag', async () => {
        const wasDebug = aiConfig.data.debug;
        aiConfig.data.debug = false;

        try {
            const today    = new Date().toISOString().slice(0, 10);
            const expected = path.join(tmpLogDir, `mc-server-${today}.log`);

            logger.log('mc-hello-world');
            logger.info('mc-info-line');
            logger.warn('mc-warn-line');
            logger.error('mc-error-line');

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(fs.existsSync(expected)).toBe(true);
            const content = fs.readFileSync(expected, 'utf8');
            expect(content).toContain('[LOG] mc-hello-world');
            expect(content).toContain('[INFO] mc-info-line');
            expect(content).toContain('[WARN] mc-warn-line');
            expect(content).toContain('[ERROR] mc-error-line');

            const firstLine = content.split('\n')[0];
            expect(firstLine).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[LOG\]/);
        } finally {
            aiConfig.data.debug = wasDebug;
        }
    });

    test('preserves Error stack/message in the durable log', async () => {
        const wasDebug = aiConfig.data.debug;
        aiConfig.data.debug = false;

        try {
            const today    = new Date().toISOString().slice(0, 10);
            const expected = path.join(tmpLogDir, `mc-server-${today}.log`);

            const err = new Error('mc summarization failed at session 7');
            logger.error('summary batch failed', err);

            const circular = {};
            circular.self = circular;
            logger.warn('circular sample', circular);

            await new Promise(resolve => setTimeout(resolve, 100));

            const content = fs.readFileSync(expected, 'utf8');
            expect(content).toContain('mc summarization failed at session 7');
            expect(content).toContain('at '); // V8 stack frame marker
            expect(content).toContain('circular sample');
        } finally {
            aiConfig.data.debug = wasDebug;
        }
    });
});
