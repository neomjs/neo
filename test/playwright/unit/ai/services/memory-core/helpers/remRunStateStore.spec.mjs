import {test, expect}                            from '@playwright/test';
import Neo                                       from '../../../../../../../src/Neo.mjs';
import * as core                                 from '../../../../../../../src/core/_export.mjs';
import {mkdtemp, rm, readdir, utimes, writeFile} from 'fs/promises';
import os                                        from 'os';
import path                                      from 'path';

import {
    appendRemRunState,
    clearActiveRemCallState,
    createRemPhaseState,
    createRemRunStateEntry,
    getActiveRemCallStateFilePath,
    getRemRunStateFileName,
    pruneRemRunStates,
    readActiveRemCallState,
    writeActiveRemCallState,
    readRecentRemRunStates
} from '../../../../../../../ai/services/memory-core/helpers/remRunStateStore.mjs';

test.describe('RemRunStateStore', () => {
    let tmpDir;

    test.beforeEach(async () => {
        tmpDir = await mkdtemp(path.join(os.tmpdir(), 'neo-rem-run-state-'));
    });

    test.afterEach(async () => {
        await rm(tmpDir, {recursive: true, force: true});
    });

    test('sanitizes run ids into portable JSONL file names', () => {
        expect(getRemRunStateFileName('rem-2026-05-28T03:00:00.000Z')).toBe('rem-2026-05-28T03_00_00.000Z.jsonl');
    });

    test('creates phase entries with derived wall-clock timing', () => {
        expect(createRemPhaseState({
            phase      : 'triVector',
            startedAt  : 1000,
            completedAt: 1250,
            status     : 'completed',
            details    : {sessionId: 's1'}
        })).toEqual({
            phase      : 'triVector',
            startedAt  : 1000,
            completedAt: 1250,
            wallClockMs: 250,
            status     : 'completed',
            details    : {sessionId: 's1'}
        });
    });

    test('creates cycle entries with cadence-overflow fields', () => {
        const entry = createRemRunStateEntry({
            runId              : 'rem-test',
            reason             : 'periodic-dream:100',
            startedAt          : 1000,
            completedAt        : 1090,
            configuredCadenceMs: 100,
            overflowThreshold  : 0.8,
            outcome            : 'completed',
            reasonCode         : 'ok',
            perPhaseStates     : [
                createRemPhaseState({phase: 'providerReady', startedAt: 1000, completedAt: 1010, status: 'completed'}),
                createRemPhaseState({phase: 'triVector', startedAt: 1010, completedAt: 1090, status: 'completed'})
            ],
            perSessionStates: [{sessionId: 's1'}]
        });

        expect(entry.wallClockMs).toBe(90);
        expect(entry.cycleOverflowRatio).toBe(0.9);
        expect(entry.cycleOverflowSignal).toBe(true);
        expect(entry.lastSuccessfulPhase).toBe('triVector');
        expect(entry.cycleScopePhases).toEqual(['providerReady', 'triVector']);
    });

    test('appends and reads recent run entries newest first', async () => {
        const older = createRemRunStateEntry({
            runId              : 'rem-old',
            reason             : 'manual',
            startedAt          : 1000,
            completedAt        : 1100,
            configuredCadenceMs: 1000,
            overflowThreshold  : 0.8,
            outcome            : 'completed',
            reasonCode         : 'ok'
        });

        const newer = createRemRunStateEntry({
            runId              : 'rem-new',
            reason             : 'manual',
            startedAt          : 2000,
            completedAt        : 2100,
            configuredCadenceMs: 1000,
            overflowThreshold  : 0.8,
            outcome            : 'skipped',
            reasonCode         : 'no-undigested-sessions'
        });

        await appendRemRunState(older, {dir: tmpDir});
        await appendRemRunState(newer, {dir: tmpDir});

        const recent = await readRecentRemRunStates({dir: tmpDir, limit: 1});

        expect(recent.map(entry => entry.runId)).toEqual(['rem-new']);
    });

    test('writes, reads, and clears the active REM provider-call marker', async () => {
        const state = {
            phase                    : 'triVector',
            sessionId                : '2d993feb-ea2f-4468-8fbd-c53e62365f4d',
            assetRef                 : '2d993feb-ea2f-4468-8fbd-c53e62365f4d:chunk:1',
            chunkIndex               : 1,
            chunkCount               : 2,
            turnIndices              : [96, 191],
            chunkTokens              : 70549,
            attempt                  : 1,
            maxRetries               : 3,
            provider                 : 'openAiCompatible',
            model                    : 'google/gemma-4-26b-a4b',
            promptTokensEstimate     : 70549,
            outputLimitTokens        : 8192,
            contextLimitTokens       : 131072,
            safeProcessingLimitTokens: 100000,
            promptPlusOutputTokens   : 78741,
            startedAt                : '2026-06-24T23:27:55.880Z'
        };

        const filePath = await writeActiveRemCallState(state, {dir: tmpDir});

        expect(filePath).toBe(getActiveRemCallStateFilePath(tmpDir));
        expect(await readActiveRemCallState({dir: tmpDir})).toEqual(state);

        await clearActiveRemCallState({dir: tmpDir});

        expect(await readActiveRemCallState({dir: tmpDir})).toBeNull();
    });

    test('readActiveRemCallState returns null for missing or corrupt active markers', async () => {
        expect(await readActiveRemCallState({dir: tmpDir})).toBeNull();

        await writeFile(getActiveRemCallStateFilePath(tmpDir), '{broken-json', 'utf8');

        expect(await readActiveRemCallState({dir: tmpDir})).toBeNull();
    });

    const makeEntry = (runId, completedAt) => createRemRunStateEntry({
        runId,
        reason             : 'manual',
        startedAt          : completedAt - 100,
        completedAt,
        configuredCadenceMs: 1000,
        overflowThreshold  : 0.8,
        outcome            : 'completed',
        reasonCode         : 'ok'
    });

    const jsonlCount = async dir => (await readdir(dir)).filter(name => name.endsWith('.jsonl')).length;

    test('appendRemRunState without retentionLimit keeps every artifact (backward compatible)', async () => {
        for (let i = 0; i < 8; i++) {
            await appendRemRunState(makeEntry(`rem-${i}`, 1000 + i), {dir: tmpDir});
        }
        expect(await jsonlCount(tmpDir)).toBe(8);
    });

    test('appendRemRunState applies the write-side retention cap (AC2)', async () => {
        for (let i = 0; i < 12; i++) {
            await appendRemRunState(makeEntry(`rem-${String(i).padStart(2, '0')}`, 1000 + i), {dir: tmpDir, retentionLimit: 5});
        }
        expect(await jsonlCount(tmpDir)).toBe(5);
    });

    test('read fan-out is bounded by retention, not by lifetime cycle count (AC1/AC4)', async () => {
        // 30 lifetime cycles, retentionLimit 5: the on-disk set — exactly what readRecentRemRunStates
        // readdir/stats — stays at 5, independent of the 30 cycles run. The read no longer scales with age.
        for (let i = 0; i < 30; i++) {
            await appendRemRunState(makeEntry(`rem-${String(i).padStart(2, '0')}`, 1000 + i), {dir: tmpDir, retentionLimit: 5});
        }
        expect(await jsonlCount(tmpDir)).toBe(5);

        const recent = await readRecentRemRunStates({dir: tmpDir, limit: 5});
        expect(recent.length).toBe(5);
    });

    test('retention removes the oldest and never the recent window (AC6)', async () => {
        for (let i = 0; i < 10; i++) {
            const runId = `rem-${String(i).padStart(2, '0')}`;
            await appendRemRunState(makeEntry(runId, 1000 + i), {dir: tmpDir});
            // Deterministic age ordering: explicit mtime per artifact (oldest -> newest).
            const filePath = path.join(tmpDir, getRemRunStateFileName(runId));
            await utimes(filePath, new Date(1000 + i), new Date(1000 + i));
        }

        const removed = await pruneRemRunStates({dir: tmpDir, retentionLimit: 3});
        expect(removed).toBe(7);

        const survivors = (await readdir(tmpDir)).filter(name => name.endsWith('.jsonl')).sort();
        expect(survivors).toEqual(['rem-07', 'rem-08', 'rem-09'].map(getRemRunStateFileName));

        const recent = await readRecentRemRunStates({dir: tmpDir, limit: 3});
        expect(recent.map(entry => entry.runId)).toEqual(['rem-09', 'rem-08', 'rem-07']);
    });

    test('pruneRemRunStates is a no-op below the bound or when disabled', async () => {
        for (let i = 0; i < 3; i++) {
            await appendRemRunState(makeEntry(`rem-${i}`, 1000 + i), {dir: tmpDir});
        }
        expect(await pruneRemRunStates({dir: tmpDir, retentionLimit: 5})).toBe(0);
        expect(await pruneRemRunStates({dir: tmpDir, retentionLimit: 0})).toBe(0);
        expect(await jsonlCount(tmpDir)).toBe(3);
    });
});
