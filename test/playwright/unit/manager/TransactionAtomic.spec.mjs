import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'TransactionAtomicTest'}});

import {expect, test} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

/**
 * @summary Failure controls for one Group's complete semantic write, through the real manager.
 */
test.describe.serial('Neo.manager.Transaction atomic participant writes', () => {
    let manager;

    test.beforeAll(async () => {
        manager = (await import('../../../../src/manager/Transaction.mjs')).default
    });

    test.beforeEach(() => {
        [...manager.items].forEach(group => manager.retireGroup(group.id));
        manager.historyDepth = 0
    });

    test.afterEach(() => {
        [...manager.items].forEach(group => manager.retireGroup(group.id))
    });

    /**
     * @summary Registers a versioned, effect-free participant with observable protocol steps.
     * @param {String} groupId
     * @param {String} key
     * @param {Array} log
     * @param {Object} options
     * @returns {Object}
     */
    function participant(groupId, key, log, options = {}) {
        const state = {value: {count: 0}, revision: 0, generation: 1};
        const entry = {
            domain : options.domain || 'dock',
            capture: () => ({...state, value: structuredClone(state.value)}),
            prepare: async (input, captured) => {
                log.push(`prepare:${key}:${captured.value.count}`);
                return options.prepare ? options.prepare(input, captured) : input
            },
            adopt: value => {
                log.push(`adopt:${key}`);
                state.value = structuredClone(value);
                state.revision++;
                if (options.failAdopt) throw new Error(`adopt:${key}:refused`)
            },
            compensate: captured => {
                log.push(`compensate:${key}`);
                Object.assign(state, captured, {value: structuredClone(captured.value)})
            },
            project: () => log.push(`project:${key}`)
        };

        manager.registerParticipant({groupId, workspaceKey: key, participant: entry});
        return {entry, state}
    }

    /** @summary Creates a Group with enabled bounded history. @returns {String} */
    function group() {
        const {groupId} = manager.bind({windowId: 'atomic-root', workspaceKey: 'main'});
        manager.setHistoryDepth({groupId, depth: 5});
        return groupId
    }

    /** @summary Supplies explicit cause/provenance for a semantic write. @param {Object} data @returns {Promise<Object>} */
    const write = data => manager.write({cause: 'test-operation', provenance: {origin: 'unit'}, ...data});

    test('a second adopter that mutates then throws compensates both in reverse order and publishes nothing', async () => {
        const groupId = group(), log = [];
        const a       = participant(groupId, 'a', log);
        const b       = participant(groupId, 'b', log, {failAdopt: true});
        const events  = [], listener = event => events.push(event);
        manager.on('commit', listener);
        try {
            await expect(write({groupId, changes: [
                {workspaceKey: 'b', input: {count: 2}},
                {workspaceKey: 'a', input: {count: 1}}
            ]})).rejects.toThrow('adopt:b:refused');
            expect(a.state).toEqual({value: {count: 0}, revision: 0, generation: 1});
            expect(b.state).toEqual({value: {count: 0}, revision: 0, generation: 1});
            expect(log).toEqual(['prepare:a:0', 'prepare:b:0', 'adopt:a', 'adopt:b', 'compensate:b', 'compensate:a']);
            expect(manager.get(groupId).history?.count ?? 0).toBe(0);
            expect(manager.get(groupId).snapshot ?? null).toBeNull();
            expect(events).toEqual([])
        } finally {
            manager.un('commit', listener)
        }
    });

    test('a prepare refusal touches no participant and the next queued write captures the current value', async () => {
        const groupId = group(), log = [];
        const a       = participant(groupId, 'a', log, {
            prepare: (input, captured) => {
                if (input.fail) throw new Error('prepare refused');
                return {count: captured.value.count + input.increment}
            }
        });
        const failed = write({groupId, changes: [{workspaceKey: 'a', input: {fail: true}}]});
        const next   = write({groupId, changes: [{workspaceKey: 'a', input: {increment: 1}}]});
        await expect(failed).rejects.toThrow('prepare refused');
        const result = await next;
        expect(a.state.value.count).toBe(1);
        expect(result.row.participants[0].before).toEqual({count: 0});
        expect(manager.get(groupId).history.count).toBe(1)
    });

    test('a queued write captures at its own head, and generation drift refuses before adoption', async () => {
        const groupId = group(), log = [];
        let release, started;
        const entered = new Promise(resolve => started = resolve);
        const gate    = new Promise(resolve => release = resolve);
        const a       = participant(groupId, 'a', log, {
            prepare: async (input, captured) => {
                if (input.wait) { started(); await gate }
                return {count: captured.value.count + 1}
            }
        });
        const first  = write({groupId, changes: [{workspaceKey: 'a', input: {wait: true}}]});
        const second = write({groupId, changes: [{workspaceKey: 'a', input: {}}]});
        await entered;
        release();
        const results = await Promise.all([first, second]);
        expect(results.map(result => result.row.participants[0].before.count)).toEqual([0, 1]);
        expect(a.state.value.count).toBe(2);

        a.entry.prepare = async () => { a.state.generation++; return {count: 9} };
        await expect(write({groupId, changes: [{workspaceKey: 'a', input: {}}]})).rejects.toThrow(/changed/);
        expect(a.state.value.count).toBe(2);
        expect(manager.get(groupId).history.count).toBe(2)
    });

    test('history failure after adoption restores history, participant revisions and the previous snapshot', async () => {
        const groupId = group(), log = [];
        const a       = participant(groupId, 'a', log);
        await write({groupId, changes: [{workspaceKey: 'a', input: {count: 1}}]});
        const record   = manager.get(groupId), history = record.history;
        const snapshot = record.snapshot, before = JSON.stringify(history.toJSON());
        const append   = history.append;
        history.append = function(descriptor) { append.call(this, descriptor); throw new Error('append failed after mutation') };
        try {
            await expect(write({groupId, changes: [{workspaceKey: 'a', input: {count: 2}}]})).rejects.toThrow('append failed');
            expect(a.state.value.count).toBe(1);
            expect(a.state.revision).toBe(1);
            expect(JSON.stringify(history.toJSON())).toBe(before);
            expect(record.snapshot).toBe(snapshot)
        } finally { history.append = append }
        await write({groupId, changes: [{workspaceKey: 'a', input: {count: 3}}]});
        expect(a.state.value.count).toBe(3)
    });

    test('a falsy thrown refusal still rolls back and never publishes a commit', async () => {
        const groupId = group(), log = [];
        const a       = participant(groupId, 'a', log), adopt = a.entry.adopt;
        const events  = [], listener = event => events.push(event);
        manager.on('commit', listener);
        try {
            for (const refusal of [null, false, 0, '']) {
                a.entry.adopt = value => { adopt(value); throw refusal };
                await expect(write({groupId, changes: [{workspaceKey: 'a', input: {count: 1}}]})).rejects.toBe(refusal);
                expect(a.state.value.count).toBe(0);
                expect(manager.get(groupId).snapshot ?? null).toBeNull();
                expect(events).toEqual([])
            }
            a.entry.adopt = adopt;
            await write({groupId, changes: [{workspaceKey: 'a', input: {count: 2}}]});
            expect(a.state.value.count).toBe(2)
        } finally { manager.un('commit', listener) }
    });

    test('mixed participant domains refuse before prepare and adoption', async () => {
        const groupId = group(), log = [];
        participant(groupId, 'dock', log);
        participant(groupId, 'command', log, {domain: 'command'});
        await expect(write({groupId, changes: [
            {workspaceKey: 'dock', input: {count: 1}},
            {workspaceKey: 'command', input: {count: 1}}
        ]})).rejects.toThrow(/mixed/);
        expect(log).toEqual([])
    });

    test('cold preserve, append, undo and redo share adoption while retaining their row-count rules', async () => {
        const groupId = group(), log = [];
        const a       = participant(groupId, 'a', log);
        const cold    = await write({groupId, cursorAction: 'preserve', changes: [{workspaceKey: 'a', input: {count: 4}}]});
        expect(cold.row).toBeNull();
        expect(manager.get(groupId).history).toBeNull();
        expect(a.state.value.count).toBe(4);
        await write({groupId, cause: 'user-restore', changes: [{workspaceKey: 'a', input: {count: 7}}]});
        const history = manager.get(groupId).history;
        const row     = history.current;
        expect((await manager.undo({groupId})).row).toBe(row);
        expect(a.state.value.count).toBe(4);
        expect(history.cursor).toBe(-1);
        expect(history.count).toBe(1);
        expect((await manager.redo({groupId})).row).toBe(row);
        expect(a.state.value.count).toBe(7);
        expect(history.cursor).toBe(0);
        expect(history.count).toBe(1)
    });

    test('a cursor update throwing after it moved rolls back participant, cursor and snapshot', async () => {
        const groupId = group(), log = [];
        const a       = participant(groupId, 'a', log);
        await write({groupId, changes: [{workspaceKey: 'a', input: {count: 1}}]});
        const record = manager.get(groupId), history = record.history, snapshot = record.snapshot;
        const before = JSON.stringify(history.toJSON()), undo = history.undo;
        history.undo = function() { undo.call(this); throw new Error('cursor failed after mutation') };
        try {
            await expect(manager.undo({groupId})).rejects.toThrow('cursor failed');
            expect(a.state.value.count).toBe(1);
            expect(a.state.revision).toBe(1);
            expect(JSON.stringify(history.toJSON())).toBe(before);
            expect(record.snapshot).toBe(snapshot)
        } finally { history.undo = undo }
    });

    test('a synchronous observer sees complete frozen truth, can enqueue, and cannot reject the committed write', async () => {
        const groupId = group(), log = [];
        const a       = participant(groupId, 'a', log), provider = manager.getProvider(groupId);
        let next;
        const listener = ({snapshot, row}) => {
            expect(Object.isFrozen(snapshot)).toBe(true);
            expect(Object.isFrozen(snapshot.participants.a)).toBe(true);
            expect(Object.isFrozen(row.participants[0].after)).toBe(true);
            expect(a.state.value).toEqual(snapshot.participants.a);
            expect(provider.getData('historyLength')).toBe(manager.get(groupId).history.count);
            if (snapshot.version === 1) {
                next = write({groupId, changes: [{workspaceKey: 'a', input: {count: 2}}]});
                throw new Error('observer failed')
            }
        };
        manager.on('commit', listener);
        try {
            const first = await write({groupId, changes: [{workspaceKey: 'a', input: {count: 1}}]});
            expect(first.notificationErrors).toEqual(['observer failed']);
            expect(first.snapshot.participants.a.count).toBe(1);
            await next;
            expect(a.state.value.count).toBe(2);
            expect(manager.get(groupId).history.count).toBe(2)
        } finally { manager.un('commit', listener) }
    });

    test('pending native work and rejected projection cannot block or undo a later semantic write', async () => {
        const groupId = group(), log = [], receipts = [];
        const a       = participant(groupId, 'a', log);
        a.entry.project = () => Promise.reject(new Error('projection failed'));
        let rejectEffect, effectStarted;
        const started  = new Promise(resolve => effectStarted = resolve);
        const held     = new Promise((resolve, reject) => rejectEffect = reject);
        const listener = ({receipt}) => receipts.push(receipt);
        manager.on('effectReceipt', listener);
        try {
            const first = await write({groupId, changes: [{workspaceKey: 'a', input: {count: 1}}], effects: [
                {effectId: 'native-close', run: () => { effectStarted(); return held }}
            ]});
            await started;
            const second = await write({groupId, changes: [{workspaceKey: 'a', input: {count: 2}}]});
            expect(second.snapshot.participants.a.count).toBe(2);
            rejectEffect(new Error('native refused'));
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(receipts.some(receipt => receipt.transactionId === first.transactionId && receipt.error === 'native refused')).toBe(true);
            expect(receipts.some(receipt => receipt.error === 'projection failed')).toBe(true);
            expect(a.state.value.count).toBe(2);
            expect(manager.get(groupId).history.count).toBe(2)
        } finally { manager.un('effectReceipt', listener) }
    })
});
