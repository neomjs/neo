import {setup} from '../../../../../setup.mjs';

const appName = 'SharedMcpLoggerTest';

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
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';
import {createLogger}  from '../../../../../../../ai/mcp/server/shared/logger.mjs';

/**
 * @summary Shared MCP logger primitive coverage for #11878.
 *
 * The shared logger is intentionally not `Neo.util.Logger`: MCP servers must keep
 * stdout protocol-clean, log errors without throwing, and preserve per-server sink
 * differences as config. These tests exercise the behavior matrix directly against
 * `createLogger()` so the five server wrappers can stay thin.
 */
test.describe('Neo.ai.mcp.server.shared.Logger', () => {
    let originalConsoleError;
    let originalStdoutWrite;
    let originalStderrWrite;

    test.beforeEach(() => {
        originalConsoleError = console.error;
        originalStdoutWrite  = process.stdout.write;
        originalStderrWrite  = process.stderr.write;
    });

    test.afterEach(() => {
        console.error        = originalConsoleError;
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
    });

    test('keeps stdout clean and priority-filters workflow stderr', () => {
        const stderrCalls = [];
        const stdoutCalls = [];

        console.error = (...args) => stderrCalls.push(args);
        process.stdout.write = (...args) => {
            stdoutCalls.push(args);
            return true;
        };

        const aiConfig = {
            debug   : false,
            logLevel: 'warn',
            logger  : {
                defaultLevel: 'warn',
                fileSink    : false,
                stderrMode  : 'threshold'
            }
        };

        const logger = createLogger(aiConfig);

        logger.debug('debug-muted');
        logger.info('info-muted');
        logger.log('log-muted');
        logger.warn('warn-visible');
        expect(() => logger.error('error-visible')).not.toThrow();

        expect(stdoutCalls).toHaveLength(0);
        expect(stderrCalls).toHaveLength(2);
        expect(stderrCalls[0]).toEqual(['[WARN]', 'warn-visible']);
        expect(stderrCalls[1]).toEqual(['[ERROR]', 'error-visible']);

        aiConfig.debug = true;
        logger.debug('debug-visible');

        expect(stderrCalls.at(-1)).toEqual(['[DEBUG]', 'debug-visible']);
    });

    test('preserves Neural Link tier-gated stderr semantics', () => {
        const stderrWrites = [];
        const stdoutCalls  = [];

        process.stderr.write = value => {
            stderrWrites.push(String(value));
            return true;
        };
        process.stdout.write = (...args) => {
            stdoutCalls.push(args);
            return true;
        };

        const logger = createLogger({
            debug : false,
            logger: {
                fileSink      : false,
                stderrMode    : 'tiered',
                timestampStyle: 'bracketed'
            }
        });

        logger.debug('nl-debug-muted');
        logger.info('nl-info-visible');
        logger.warn('nl-warn-visible');
        logger.error('nl-error-visible');

        expect(stdoutCalls).toHaveLength(0);
        expect(stderrWrites.join('')).not.toContain('nl-debug-muted');
        expect(stderrWrites.join('')).toContain('[INFO] nl-info-visible');
        expect(stderrWrites.join('')).toContain('[WARN] nl-warn-visible');
        expect(stderrWrites.join('')).toContain('[ERROR] nl-error-visible');
    });

    test('writes durable file logs, preserves Error details, and flushes when enabled', async () => {
        const tmpLogDir = path.resolve(os.tmpdir(), `shared-logger-test-${process.pid}-${Date.now()}`);

        try {
            const logger = createLogger({
                debug  : false,
                logPath: tmpLogDir,
                logger : {
                    filePrefix    : 'shared-test',
                    fileSink      : true,
                    flush         : true,
                    stderrMode    : 'debug',
                    timestampStyle: 'plain'
                }
            });

            expect(typeof logger.flush).toBe('function');

            const today    = new Date().toISOString().slice(0, 10);
            const expected = path.join(tmpLogDir, `shared-test-${today}.log`);
            const err      = new Error('shared logger failure');
            const circular = {};
            circular.self  = circular;

            logger.error('file-error', err);
            logger.warn('circular sample', circular);
            await logger.flush();

            const content = fs.readFileSync(expected, 'utf8');

            expect(content).toContain('[ERROR] file-error Error: shared logger failure');
            expect(content).toContain('at ');
            expect(content).toContain('[WARN] circular sample [object Object]');
            expect(content.split('\n')[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[ERROR\]/);
        } finally {
            if (fs.existsSync(tmpLogDir)) {
                fs.rmSync(tmpLogDir, {recursive: true, force: true});
            }
        }
    });
});
