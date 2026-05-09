import {test, expect} from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
    DEFAULT_KB_SYNC_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS,
    DEFAULT_SUMMARY_SWEEP_INTERVAL_MS,
    buildTaskDefinitions,
    parseInterval,
    shouldRunIntervalTask
} from '../../../../../ai/scripts/orchestrator-daemon.mjs';

test.describe('ai/scripts/orchestrator-daemon.mjs (#11006)', () => {
    test('parses interval env values while preserving zero as disabled', () => {
        expect(parseInterval(undefined, DEFAULT_POLL_INTERVAL_MS)).toBe(DEFAULT_POLL_INTERVAL_MS);
        expect(parseInterval('', DEFAULT_SUMMARY_SWEEP_INTERVAL_MS)).toBe(DEFAULT_SUMMARY_SWEEP_INTERVAL_MS);
        expect(parseInterval('0', DEFAULT_KB_SYNC_INTERVAL_MS)).toBe(0);
        expect(parseInterval('-10', DEFAULT_KB_SYNC_INTERVAL_MS)).toBe(0);
        expect(parseInterval('900000', DEFAULT_KB_SYNC_INTERVAL_MS)).toBe(900000);
        expect(parseInterval('not-a-number', DEFAULT_KB_SYNC_INTERVAL_MS)).toBe(DEFAULT_KB_SYNC_INTERVAL_MS);
    });

    test('does not schedule disabled or not-yet-due interval tasks', () => {
        expect(shouldRunIntervalTask({
            now       : 1000,
            lastRunAt : 0,
            intervalMs: 0
        })).toBe(false);

        expect(shouldRunIntervalTask({
            now       : 599999,
            lastRunAt : 0,
            intervalMs: 600000
        })).toBe(false);

        expect(shouldRunIntervalTask({
            now       : 600000,
            lastRunAt : 0,
            intervalMs: 600000
        })).toBe(true);
    });

    test('builds task commands around existing manual maintenance scripts', () => {
        const scriptDir = path.resolve(process.cwd(), 'ai/scripts');
        const tasks     = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});

        expect(tasks.summary.command).toBe('/test/node');
        expect(tasks.summary.args).toEqual([path.join(scriptDir, 'summarize-sessions.mjs')]);
        expect(tasks.summary.expectedCommand).toBe('summarize-sessions.mjs');

        expect(tasks.kbSync.command).toBe('/test/node');
        expect(tasks.kbSync.args).toEqual([path.resolve(scriptDir, '../../buildScripts/ai/syncKnowledgeBase.mjs')]);
        expect(tasks.kbSync.expectedCommand).toBe('syncKnowledgeBase.mjs');
    });

    test('keeps bridge-daemon wake-only and routes maintenance ownership to orchestrator', () => {
        const bridgeSource       = fs.readFileSync(path.resolve(process.cwd(), 'ai/scripts/bridge-daemon.mjs'), 'utf8');
        const orchestratorSource = fs.readFileSync(path.resolve(process.cwd(), 'ai/scripts/orchestrator-daemon.mjs'), 'utf8');

        expect(bridgeSource).not.toContain('summarize-sessions.mjs');
        expect(bridgeSource).not.toContain('Piece C periodic summarization sweep');
        expect(bridgeSource).not.toContain('checkSummarizationLifecycle');

        expect(orchestratorSource).toContain('summarize-sessions.mjs');
        expect(orchestratorSource).toContain('syncKnowledgeBase.mjs');
    });
});
