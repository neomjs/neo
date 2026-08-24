import {test, expect} from '@playwright/test';

import {dispatchLocalWake}                   from '../../../../../../ai/daemons/wake/localWakeAdapters.mjs';
import {createWakeReceiver}                  from '../../../../../../ai/daemons/wake/receiver.mjs';
import {WakeReceiverState, getWakeRecordKey} from '../../../../../../ai/daemons/wake/receiverState.mjs';
import fs                                    from 'node:fs/promises';
import os                                    from 'node:os';
import path                                  from 'node:path';

/**
 * A wake arriving while the target seat holds a pending interactive prompt must not be
 * typed into that prompt. Red-capable pair: pre-fix, the delivery argv executed and the envelope
 * became the dialog's answer; post-fix, the adapter classifies the dialog-pending state as a
 * DEFERRED outcome and the receiver parks-and-reschedules it under a bounded count.
 */

const DIALOG_PENDING_MESSAGE = 'interactive dialog pending at phase before input';

const baseRecord = subscriptionId => ({
    subscriptionId,
    envelope: {
        payload : {totalEvents: 1, latestMessage: {subject: 'probe', priority: 'normal'}},
        identity: '@neo-preview'
    },
    route: {
        agentIdentity        : '@neo-preview',
        harnessTargetMetadata: {
            adapter        : 'osascript',
            appName        : 'Claude',
            addressType    : 'pid',
            instanceAddress: '/Users/tobiasuhlig/Library/Application Support/Claude'
        },
        adapterConfig: {attemptTimeoutMs: 10_000}
    }
});

const baseEffects = overrides => ({
    platform             : 'darwin',
    log                  : {log() {}, warn() {}, error() {}},
    homedir              : os.homedir,
    fs,
    fetch                : globalThis.fetch,
    getDefaultTarget     : async () => ({status: 'ok', pid: 4242}),
    resolveGuiInstancePid: async () => 4242,
    spawnAsync           : async () => '',
    ...overrides
});

test.describe('#17629 — wake vs pending interactive dialog', () => {

    test('adapter DEFERS instead of typing when the accessibility probe reports a prompt structure', async () => {
        const seen   = [];
        const result = await dispatchLocalWake(baseRecord('WAKE_SUB:dialog-defer-a'), baseEffects({
            spawnAsync: async (command, args) => {
                seen.push({command, args});
                // The final phase executes the paste+submit keystroke block; its presence proves
                // typing happened. Pre-fix this line IS reached; post-fix it must never be.
                if (args.some(a => String(a).includes('keystroke "v"'))) {
                    return '';
                }
                if (args.some(a => String(a).includes('interactiveDialogProbe'))) {
                    throw new Error(DIALOG_PENDING_MESSAGE);
                }
                return '';
            }
        }));

        expect(result).toEqual({
            outcome      : 'deferred',
            outcomeReason: 'interactive-dialog-pending'
        });
        const typed = seen.filter(s => s.args.some(a => String(a).includes('keystroke "v"')));
        expect(typed).toHaveLength(0);
    });

    test('a composer-state probe passes through and delivery proceeds unchanged', async () => {
        let   pasteReached = false;
        const result       = await dispatchLocalWake(baseRecord('WAKE_SUB:dialog-defer-b'), baseEffects({
            spawnAsync: async (command, args) => {
                if (args.some(a => String(a).includes('interactiveDialogProbe'))) return 'composer';
                if (args.some(a => String(a).includes('keystroke "v"'))) pasteReached = true;
                return '';
            }
        }));

        expect(result).toBe('delivered');
        expect(pasteReached).toBe(true);
    });

    test('probe failure fails open (delivers) rather than withholding coordination', async () => {
        let   pasteReached = false;
        const result       = await dispatchLocalWake(baseRecord('WAKE_SUB:dialog-defer-c'), baseEffects({
            spawnAsync: async (command, args) => {
                if (args.some(a => String(a).includes('interactiveDialogProbe'))) {
                    throw new Error('AX probe unavailable');
                }
                if (args.some(a => String(a).includes('keystroke "v"'))) pasteReached = true;
                return '';
            }
        }));

        expect(result).toBe('delivered');
        expect(pasteReached).toBe(true);
    });
});

test.describe('#17629 — receiver parks and bounds deferred wakes', () => {

    const buildReceiver = async dispatchImpl => {
        const dir      = await fs.mkdtemp(path.join(os.tmpdir(), 'wake-dialog-gate-'));
        const state    = new WakeReceiverState({stateDir: dir});
        const manifest = {
            schemaVersion: 1,
            routes       : {
                'WAKE_SUB:dialog-defer-r': {
                    agentIdentity        : '@neo-preview',
                    signingKey           : 'k'.repeat(64),
                    harnessTargetMetadata: {adapter: 'test'},
                    adapterConfig        : {attemptTimeoutMs: 1000}
                }
            }
        };
        const lines    = [];
        const receiver = createWakeReceiver({
            manifest,
            state,
            dispatch: dispatchImpl,
            logger  : {warn: m => lines.push(m), error: m => lines.push(m), log: () => {}}
        });
        await state.init();
        return {state, receiver, lines};
    };

    test('deferred outcome returns the record to pending with named defer metadata', async () => {
        const {state, receiver} = await buildReceiver(async () => ({
            outcome      : 'deferred',
            outcomeReason: 'interactive-dialog-pending'
        }));

        await state.accept({
            subscriptionId: 'WAKE_SUB:dialog-defer-r',
            eventId       : 'evt-defer-a',
            envelope      : {payload: {totalEvents: 1}}
        });

        await receiver.drain();
        const record = await state.read(getWakeRecordKey({subscriptionId: 'WAKE_SUB:dialog-defer-r', eventId: 'evt-defer-a'}));

        expect(record.state).toBe('pending');
        expect(record.deferCount).toBe(1);
        expect(record.deferReason).toContain('interactive-dialog-pending');
    });

    test('the defer bound exhausts into an observable failure, never silent parking', async () => {
        const {state, receiver, lines} = await buildReceiver(async () => ({
            outcome      : 'deferred',
            outcomeReason: 'interactive-dialog-pending'
        }));

        await state.accept({
            subscriptionId: 'WAKE_SUB:dialog-defer-r',
            eventId       : 'evt-defer-b',
            envelope      : {payload: {totalEvents: 1}}
        });

        let record;
        for (let i = 0; i < 20; i++) {
            await receiver.drain();
            record = await state.read(getWakeRecordKey({subscriptionId: 'WAKE_SUB:dialog-defer-r', eventId: 'evt-defer-b'}));
            expect(record.state).toBe('pending');
        }
        expect(record.deferCount).toBe(20);

        await receiver.drain();
        record = await state.read(getWakeRecordKey({subscriptionId: 'WAKE_SUB:dialog-defer-r', eventId: 'evt-defer-b'}));
        expect(record.state).toBe('failed');
        expect(record.outcomeReason).toContain('dialog-defer-bound-exhausted');
        expect(lines.some(l => l.includes('WAKE_SUB:dialog-defer-r'))).toBe(true);
    });

    test('envelope identity survives the defer round-trip byte-for-byte', async () => {
        let captured;
        let   calls             = 0;
        const {state, receiver} = await buildReceiver(async record => {
            calls += 1;
            if (calls === 1) return {outcome: 'deferred', outcomeReason: 'interactive-dialog-pending'};
            captured = record;
            return 'delivered';
        });

        const envelope = {payload: {totalEvents: 3, latestMessage: {subject: 'identity-probe'}}, signature: 'sig'};
        await state.accept({
            subscriptionId: 'WAKE_SUB:dialog-defer-r',
            eventId       : 'evt-defer-c',
            envelope
        });

        await receiver.drain();
        await receiver.drain();

        expect(captured?.envelope).toEqual(envelope);
    });
});
