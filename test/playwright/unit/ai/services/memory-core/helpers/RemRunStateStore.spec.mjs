import {test, expect} from '@playwright/test';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';
import {mkdtemp, rm}   from 'fs/promises';
import os              from 'os';
import path            from 'path';

import {
    appendRemRunState,
    createRemPhaseState,
    createRemRunStateEntry,
    getRemRunStateFileName,
    readRecentRemRunStates
} from '../../../../../../../ai/services/memory-core/helpers/RemRunStateStore.mjs';

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
});
