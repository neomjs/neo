import {test, expect} from '@playwright/test';
import fs             from 'node:fs/promises';
import os             from 'node:os';
import path           from 'node:path';

import {
    getWakeRecordKey,
    WakeReceiverState
} from '../../../../../../ai/daemons/wake/receiverState.mjs';

test.describe('ai/daemons/wake/receiverState', () => {
    let state, stateDir;

    test.beforeEach(async () => {
        stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-wake-receiver-state-'));
        state    = new WakeReceiverState({stateDir});
        await state.init();
    });

    test.afterEach(async () => {
        await fs.rm(stateDir, {recursive: true, force: true});
    });

    const accept = (overrides = {}) => state.accept({
        subscriptionId: 'WAKE_SUB:test',
        eventId       : 'wake-digest:event-1',
        sourceEventIds: ['MESSAGE:1'],
        envelope      : {eventId: 'wake-digest:event-1'},
        route         : {agentIdentity: '@neo-gpt', harnessTargetMetadata: {adapter: 'test'}},
        ...overrides
    });

    test('stable source ids determine the retry-safe record key independent of order/event id', () => {
        const first = getWakeRecordKey({
            subscriptionId: 'WAKE_SUB:test',
            eventId       : 'event-a',
            sourceEventIds: ['MESSAGE:2', 'MESSAGE:1']
        });
        const second = getWakeRecordKey({
            subscriptionId: 'WAKE_SUB:test',
            eventId       : 'event-b',
            sourceEventIds: ['MESSAGE:1', 'MESSAGE:2']
        });

        expect(first).toBe(second);
        expect(first).toMatch(/^[a-f0-9]{64}$/);
    });

    test('accepts once, fsyncs a 0600 pending record, and dedupes retries', async () => {
        const first  = await accept();
        const second = await accept({eventId: 'wake-digest:retry'});
        const stat   = await fs.stat(state.getRecordPath(first.record.recordKey));

        expect(first.status).toBe('accepted');
        expect(second.status).toBe('duplicate');
        expect(second.record.recordKey).toBe(first.record.recordKey);
        expect(first.record.state).toBe('pending');
        expect(stat.mode & 0o777).toBe(0o600);
        expect(await state.list()).toHaveLength(1);
    });

    test('restart preserves pending records but terminalizes interrupted dispatch as unknown', async () => {
        const pending     = await accept();
        const interrupted = await accept({
            eventId       : 'wake-digest:event-2',
            sourceEventIds: ['MESSAGE:2']
        });

        await state.transition(interrupted.record.recordKey, 'pending', 'dispatching');
        expect(await state.recoverInterrupted()).toBe(1);

        expect((await state.read(pending.record.recordKey)).state).toBe('pending');
        expect((await state.read(interrupted.record.recordKey))).toMatchObject({
            state        : 'unknown',
            outcomeReason: 'receiver-restarted-during-non-idempotent-dispatch'
        });
    });

    test('a stale expected state cannot regress a terminal record', async () => {
        const accepted = await accept();
        await state.transition(accepted.record.recordKey, 'pending', 'dispatching');
        await state.transition(accepted.record.recordKey, 'dispatching', 'delivered');

        expect(await state.transition(accepted.record.recordKey, 'pending', 'dispatching')).toBeNull();
        expect((await state.read(accepted.record.recordKey)).state).toBe('delivered');
    });

    test('dispatching returns to pending on a context-gate deferral (#16682), keeping the wake replayable', async () => {
        const accepted = await accept();
        await state.transition(accepted.record.recordKey, 'pending', 'dispatching');

        const deferred = await state.transition(accepted.record.recordKey, 'dispatching', 'pending', {
            deferCount         : 1,
            deferReason        : 'context-gate:700000>250000',
            probedContextTokens: 700_000
        });

        expect(deferred).toMatchObject({
            state              : 'pending',
            deferCount         : 1,
            deferReason        : 'context-gate:700000>250000',
            probedContextTokens: 700_000
        });

        // The deferred record stays in the only replayable state: the next drain picks it up…
        expect(await state.list('pending')).toHaveLength(1);
        // …a boot recovery does NOT terminalize it (only crash-interrupted dispatches are)…
        expect(await state.recoverInterrupted()).toBe(0);
        // …and it can re-enter dispatch cleanly when the session shrinks or rotates.
        expect(await state.transition(accepted.record.recordKey, 'pending', 'dispatching')).not.toBeNull();
    });
});
