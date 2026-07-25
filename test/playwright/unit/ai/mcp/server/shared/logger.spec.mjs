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

import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    createLogger,
    pruneLoggerRetention,
    resolveLoggerRetention,
    selectPrunableLogFiles
} from '../../../../../../../ai/mcp/server/shared/logger.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

const dayStamp = daysAgo => new Date(Date.now() - (daysAgo * DAY_MS)).toISOString().slice(0, 10);

/**
 * @summary Shared MCP logger primitive coverage.
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

    test('fatalStartup forces stderr while keeping stdout protocol-clean (#13877)', () => {
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
                stderrMode    : 'debug',
                timestampStyle: 'plain'
            }
        });

        logger.error('debug-muted-error', new Error('hidden'));
        logger.fatalStartup('Fatal error during server initialization:', new Error('stale config overlay'));

        expect(stdoutCalls).toHaveLength(0);
        expect(stderrWrites.join('')).not.toContain('debug-muted-error');
        expect(stderrWrites.join('')).toContain('[ERROR] Fatal error during server initialization: Error: stale config overlay');
        expect(stderrWrites.join('')).toContain('at ');
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

            const today = new Date().toISOString().slice(0, 10);
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

    test('writes file-only diagnostics without touching console or stderr (#13995)', async () => {
        const tmpLogDir    = path.resolve(os.tmpdir(), `shared-logger-file-debug-${process.pid}-${Date.now()}`);
        const stderrCalls  = [];
        const stderrWrites = [];
        const stdoutCalls  = [];

        console.error = (...args) => stderrCalls.push(args);
        process.stderr.write = value => {
            stderrWrites.push(String(value));
            return true;
        };
        process.stdout.write = (...args) => {
            stdoutCalls.push(args);
            return true;
        };

        try {
            const logger = createLogger({
                debug  : true,
                logPath: tmpLogDir,
                logger : {
                    filePrefix    : 'shared-test',
                    fileSink      : true,
                    flush         : true,
                    stderrMode    : 'debug',
                    timestampStyle: 'plain'
                }
            });

            logger.fileDebug('file-only-diagnostic');
            await logger.flush();

            const today = new Date().toISOString().slice(0, 10);
            const expected = path.join(tmpLogDir, `shared-test-${today}.log`);
            const content = fs.readFileSync(expected, 'utf8');

            expect(content).toContain('[DEBUG] file-only-diagnostic');
            expect(stderrCalls).toHaveLength(0);
            expect(stderrWrites).toHaveLength(0);
            expect(stdoutCalls).toHaveLength(0);
        } finally {
            if (fs.existsSync(tmpLogDir)) {
                fs.rmSync(tmpLogDir, {recursive: true, force: true});
            }
        }
    });

    test('prunes old matching file logs while preserving active and unrelated files', async () => {
        const tmpLogDir = path.resolve(os.tmpdir(), `shared-logger-retention-${process.pid}-${Date.now()}`);
        const today    = dayStamp(0);
        const keepDay  = dayStamp(1);
        const oldDay   = dayStamp(2);
        const olderDay = dayStamp(3);

        try {
            fs.ensureDirSync(tmpLogDir);

            const activePath    = path.join(tmpLogDir, `shared-test-${today}.log`);
            const keepPath      = path.join(tmpLogDir, `shared-test-${keepDay}.log`);
            const oldPath       = path.join(tmpLogDir, `shared-test-${oldDay}.log`);
            const olderPath     = path.join(tmpLogDir, `shared-test-${olderDay}.log`);
            const unrelatedPath = path.join(tmpLogDir, `other-test-${olderDay}.log`);
            const malformedPath = path.join(tmpLogDir, 'shared-test-not-a-date.log');

            fs.writeFileSync(activePath, 'active-before\n');
            fs.writeFileSync(keepPath, 'keep\n');
            fs.writeFileSync(oldPath, 'old\n');
            fs.writeFileSync(olderPath, 'older\n');
            fs.writeFileSync(unrelatedPath, 'unrelated\n');
            fs.writeFileSync(malformedPath, 'malformed\n');

            const logger = createLogger({
                debug          : false,
                logPath        : tmpLogDir,
                loggerRetention: {
                    enabled   : true,
                    maxAgeDays: 1,
                    maxFiles  : 1
                },
                logger: {
                    filePrefix    : 'shared-test',
                    fileSink      : true,
                    flush         : true,
                    stderrMode    : 'debug',
                    timestampStyle: 'plain'
                }
            });

            logger.info('after-retention');
            await logger.flush();

            expect(fs.existsSync(activePath)).toBe(true);
            expect(fs.readFileSync(activePath, 'utf8')).toContain('active-before');
            expect(fs.readFileSync(activePath, 'utf8')).toContain('after-retention');
            expect(fs.existsSync(keepPath)).toBe(true);
            expect(fs.existsSync(oldPath)).toBe(false);
            expect(fs.existsSync(olderPath)).toBe(false);
            expect(fs.existsSync(unrelatedPath)).toBe(true);
            expect(fs.existsSync(malformedPath)).toBe(true);
        } finally {
            if (fs.existsSync(tmpLogDir)) {
                fs.rmSync(tmpLogDir, {recursive: true, force: true});
            }
        }
    });

    test('treats disabled or invalid retention config as preserve-all', () => {
        const today = '2026-06-18';
        const files = [{
            filePath: '/tmp/shared-test-2026-06-17.log',
            date    : '2026-06-17',
            time    : Date.parse('2026-06-17T00:00:00.000Z')
        }];

        expect(resolveLoggerRetention({
            loggerRetention: {
                enabled      : false,
                maxAgeDays   : 0,
                maxFiles     : 0,
                maxTotalBytes: 1
            }
        })).toEqual({
            enabled      : false,
            maxAgeDays   : null,
            maxFiles     : null,
            maxTotalBytes: null
        });

        const invalid = resolveLoggerRetention({
            loggerRetention: {
                maxAgeDays   : -1,
                maxFiles     : 'many',
                maxTotalBytes: 0
            }
        });

        expect(invalid).toEqual({
            enabled      : true,
            maxAgeDays   : null,
            maxFiles     : null,
            maxTotalBytes: null
        });
        expect(selectPrunableLogFiles({files, retention: invalid, today})).toEqual([]);
    });

    test('prunes oldest historical files until the byte budget is satisfied', () => {
        const today = '2026-06-18';
        const files = [{
            filePath: '/tmp/shared-test-2026-06-17.log',
            date    : '2026-06-17',
            time    : Date.parse('2026-06-17T00:00:00.000Z'),
            size    : 40
        }, {
            filePath: '/tmp/shared-test-2026-06-16.log',
            date    : '2026-06-16',
            time    : Date.parse('2026-06-16T00:00:00.000Z'),
            size    : 50
        }, {
            filePath: '/tmp/shared-test-2026-06-15.log',
            date    : '2026-06-15',
            time    : Date.parse('2026-06-15T00:00:00.000Z'),
            size    : 60
        }];

        expect(selectPrunableLogFiles({
            files,
            today,
            retention: {
                enabled      : true,
                maxAgeDays   : null,
                maxFiles     : null,
                maxTotalBytes: 90
            }
        }).map(file => file.filePath)).toEqual([
            '/tmp/shared-test-2026-06-15.log'
        ]);
    });

    test('applies byte-budget retention to matching historical files only', () => {
        const unlinked = [];

        const count = pruneLoggerRetention({
            logDir      : '/tmp',
            filePrefix  : 'shared-test',
            today       : '2026-06-18',
            retention   : {enabled: true, maxAgeDays: null, maxFiles: null, maxTotalBytes: 90},
            loggerConfig: {filePrefix: 'shared-test', timestampStyle: 'plain'},
            readDir     : () => [{
                isFile: () => true,
                name  : 'shared-test-2026-06-18.log'
            }, {
                isFile: () => true,
                name  : 'shared-test-2026-06-17.log'
            }, {
                isFile: () => true,
                name  : 'shared-test-2026-06-16.log'
            }, {
                isFile: () => true,
                name  : 'other-test-2026-06-15.log'
            }],
            statFile: filePath => ({
                size: filePath.includes('2026-06-17') ? 70 : 60
            }),
            unlinkFile: filePath => unlinked.push(filePath)
        });

        expect(count).toBe(1);
        expect(unlinked).toEqual(['/tmp/shared-test-2026-06-16.log']);
    });

    test('turns retention prune failures into bounded warnings', () => {
        const warnings = [];
        const count    = pruneLoggerRetention({
            logDir      : '/tmp',
            filePrefix  : 'shared-test',
            today       : '2026-06-18',
            retention   : {enabled: true, maxAgeDays: 0, maxFiles: null, maxTotalBytes: null},
            loggerConfig: {filePrefix: 'shared-test', timestampStyle: 'plain'},
            readDir     : () => [{
                isFile: () => true,
                name  : 'shared-test-2026-06-17.log'
            }],
            statFile: () => {
                throw new Error('stat should not run without byte-budget retention');
            },
            unlinkFile: () => {
                throw new Error('blocked unlink');
            },
            warn: (error, loggerConfig) => warnings.push({error, loggerConfig})
        });

        expect(count).toBe(0);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].error.message).toBe('blocked unlink');
        expect(warnings[0].loggerConfig.filePrefix).toBe('shared-test');
    });
});

/**
 * @summary Log-path resolution + failure-containment contract.
 *
 * The canonical-path fallback (`<rootDir>/.neo-ai-data/logs`) was removed deliberately:
 * a file-sink logger resolves its dir from the declared `logPath` leaf (or an explicit
 * `loggerConfig.logPath`) and FAILS LOUD at construction otherwise — the construction
 * stack names the defective caller. Sink failures — synchronous AND asynchronous stream
 * events — degrade to stderr instead of killing a serving process, and a not-yet-ready
 * Neo config provider routes file writes to stderr so anchor defaults can never leak a
 * write into the canonical plane (one-reality guard).
 */
test.describe('Neo.ai.mcp.server.shared.Logger — log-path resolution contract', () => {
    let originalStderrWrite;

    const tmpDirs    = [];
    const makeTmpDir = () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-logger-contract-'));

        tmpDirs.push(dir);
        return dir;
    };
    const dayName = prefix => `${prefix}-${new Date().toISOString().slice(0, 10)}.log`;

    test.beforeEach(() => {
        originalStderrWrite = process.stderr.write;
    });

    test.afterEach(() => {
        process.stderr.write = originalStderrWrite;

        tmpDirs.splice(0).forEach(dir => fs.rmSync(dir, {force: true, recursive: true}));
    });

    test('file sink with NO resolvable path throws a named error at construction', () => {
        expect(() => createLogger({data: {}}, {fileSink: true, filePrefix: 'contract-noPath'}))
            .toThrow(/no log path resolves/);
    });

    test('empty-config construction with a file sink throws — the silent canonical fallback is gone', () => {
        expect(() => createLogger(undefined, {fileSink: true, filePrefix: 'contract-emptyConfig'}))
            .toThrow(/no log path resolves/);
    });

    test('the declared logPath leaf is consulted — a bound path receives the file writes', async () => {
        const dir    = makeTmpDir();
        const logger = createLogger({data: {logPath: dir}}, {fileSink: true, filePrefix: 'contract-bound', flush: true});

        logger.info('bound-path-write');
        await logger.flush();

        expect(fs.readFileSync(path.join(dir, dayName('contract-bound')), 'utf8')).toContain('bound-path-write');
    });

    test('loggerConfig.logPath overrides the config leaf', async () => {
        const leafDir     = makeTmpDir();
        const overrideDir = makeTmpDir();
        const logger      = createLogger({data: {logPath: leafDir}}, {fileSink: true, filePrefix: 'contract-override', logPath: overrideDir, flush: true});

        logger.info('override-write');
        await logger.flush();

        expect(fs.existsSync(path.join(overrideDir, dayName('contract-override')))).toBe(true);
        expect(fs.existsSync(path.join(leafDir, dayName('contract-override')))).toBe(false);
    });

    test('stderr-only loggers construct and log without any path', () => {
        const logger = createLogger({data: {}}, {fileSink: false, stderrMode: 'threshold', filePrefix: 'contract-stderrOnly'});

        expect(() => logger.error('stderr-only-write')).not.toThrow();
    });

    test('a synchronously-unusable sink path degrades to stderr instead of throwing', () => {
        const dir      = makeTmpDir();
        const filePath = path.join(dir, 'occupied');

        fs.writeFileSync(filePath, 'a file where a dir must go');

        const logger  = createLogger({data: {logPath: path.join(filePath, 'child')}}, {fileSink: true, filePrefix: 'contract-syncDegrade'});
        const written = [];

        process.stderr.write = chunk => { written.push(String(chunk)); return true; };

        expect(() => logger.info('degraded-write')).not.toThrow();
        expect(written.join('')).toContain('file sink unavailable');
        expect(written.join('')).toContain('degraded-write');
    });

    test('an ASYNC stream error (EISDIR on a directory-shaped filename) is contained, never uncaught', async () => {
        const dir    = makeTmpDir();
        const prefix = 'contract-asyncDegrade';

        // The daily log FILENAME exists as a directory: createWriteStream() returns
        // normally and emits 'error' later — the uncontained shape kills the process.
        fs.mkdirSync(path.join(dir, dayName(prefix)), {recursive: true});

        const escaped = [];
        const trap    = e => escaped.push(e);

        process.on('uncaughtException', trap);

        const written = [];

        process.stderr.write = chunk => { written.push(String(chunk)); return true; };

        try {
            const logger = createLogger({data: {logPath: dir}}, {fileSink: true, filePrefix: prefix, flush: true});

            logger.info('first-write-arms-the-stream');
            await new Promise(resolve => setTimeout(resolve, 100));

            logger.info('post-failure-write');

            expect(escaped).toHaveLength(0);
            expect(written.join('')).toContain('file sink unavailable');
            expect(written.join('')).toContain('post-failure-write');

            // flush() must SETTLE on a dead sink — the error handler nulls currentStream, so
            // the fast-resolve branch fires; a hang here is a shutdown-path regression (the
            // test timeout is the falsifier).
            await logger.flush();
        } finally {
            process.removeListener('uncaughtException', trap);
        }
    });

    test('a not-ready provider routes file writes to stderr — zero filesystem writes before the overlay resolves', async () => {
        const anchorDefaultDir = makeTmpDir();
        const overlayDir       = makeTmpDir();
        const prefix           = 'contract-oneReality';
        const config           = {data: {logPath: anchorDefaultDir}, isReady: false};
        const logger           = createLogger(config, {fileSink: true, filePrefix: prefix, flush: true});
        const written          = [];

        process.stderr.write = chunk => { written.push(String(chunk)); return true; };

        logger.info('pre-ready-line');

        expect(fs.readdirSync(anchorDefaultDir)).toHaveLength(0);
        expect(written.join('')).toContain('pre-ready-line');

        config.isReady      = true;
        config.data.logPath = overlayDir;

        logger.info('post-ready-line');
        await logger.flush();

        expect(fs.readFileSync(path.join(overlayDir, dayName(prefix)), 'utf8')).toContain('post-ready-line');
        expect(fs.readdirSync(anchorDefaultDir)).toHaveLength(0);
    });
});
