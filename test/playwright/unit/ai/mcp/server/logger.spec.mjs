import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {createLogger} from '../../../../../../ai/mcp/server/shared/logger.mjs';

/**
 * @summary Contract specs for the shared MCP logger's log-path resolution.
 *
 * The canonical-path fallback (`<rootDir>/.neo-ai-data/logs`) was removed deliberately:
 * a file-sink logger resolves its dir from the declared `logPath` leaf (or an explicit
 * `loggerConfig.logPath`) and FAILS LOUD at construction otherwise — the construction
 * stack names the defective caller. Runtime sink failures degrade to stderr instead of
 * killing a serving process; path validity belongs to the plane-coherence boot assertion.
 */
const makeTmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'neo-logger-spec-'));

test.describe('Neo.ai.mcp.server.shared.logger — log-path resolution contract (#15875)', () => {
    test('file sink with NO resolvable path throws a named error at construction', () => {
        expect(() => createLogger({data: {}}, {fileSink: true, filePrefix: 'spec-noPath'}))
            .toThrow(/no log path resolves/);
    });

    test('empty-config construction with a file sink throws — the silent canonical fallback is gone', () => {
        expect(() => createLogger(undefined, {fileSink: true, filePrefix: 'spec-emptyConfig'}))
            .toThrow(/no log path resolves/);
    });

    test('the declared logPath leaf is consulted — a bound path receives the file writes', async () => {
        const dir    = makeTmpDir();
        const logger = createLogger({data: {logPath: dir}}, {fileSink: true, filePrefix: 'spec-bound', flush: true});

        logger.info('bound-path-write');
        await logger.flush();

        const today   = new Date().toISOString().slice(0, 10);
        const content = fs.readFileSync(path.join(dir, `spec-bound-${today}.log`), 'utf8');

        expect(content).toContain('bound-path-write');
    });

    test('loggerConfig.logPath overrides the config leaf', async () => {
        const leafDir     = makeTmpDir();
        const overrideDir = makeTmpDir();
        const logger      = createLogger({data: {logPath: leafDir}}, {fileSink: true, filePrefix: 'spec-override', logPath: overrideDir, flush: true});

        logger.info('override-write');
        await logger.flush();

        const today = new Date().toISOString().slice(0, 10);

        expect(fs.existsSync(path.join(overrideDir, `spec-override-${today}.log`))).toBe(true);
        expect(fs.existsSync(path.join(leafDir, `spec-override-${today}.log`))).toBe(false);
    });

    test('stderr-only loggers construct and log without any path', () => {
        const logger = createLogger({data: {}}, {fileSink: false, stderrMode: 'threshold', filePrefix: 'spec-stderrOnly'});

        expect(() => logger.error('stderr-only-write')).not.toThrow();
    });

    test('a runtime-unusable sink path degrades to stderr instead of throwing', () => {
        const dir      = makeTmpDir();
        const filePath = path.join(dir, 'occupied');

        fs.writeFileSync(filePath, 'a file where a dir must go');

        const logger  = createLogger({data: {logPath: path.join(filePath, 'child')}}, {fileSink: true, filePrefix: 'spec-degrade'});
        const written = [];
        const orig    = process.stderr.write;

        process.stderr.write = chunk => { written.push(String(chunk)); return true; };

        try {
            expect(() => logger.info('degraded-write')).not.toThrow();
        } finally {
            process.stderr.write = orig;
        }

        expect(written.join('')).toContain('file sink unavailable');
        expect(written.join('')).toContain('degraded-write');
    });
});
