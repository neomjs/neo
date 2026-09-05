import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'ManagerTransactionWriteTest'
    }
});

import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import StateProvider   from '../../../../src/state/Provider.mjs';

/**
 * The write side of a Group: the serialized queue, the admission barrier that loads the history module once
 * and only for a Group that keeps history, the cursor moves that wait for their application, the Group-local
 * depth, and the Group provider every bound window reads. The manager is driven the way a host does —
 * `bind`, then `write` / `undo` / `redo` — with registered, versioned participants applying their own
 * prepared values and the history's retained endpoints.
 */
test.describe.serial('Neo.manager.Transaction — history admission, the queue and the Group provider', () => {
    let Transaction, importHistory, imports, log;

    /** @summary Supplies write metadata while retaining explicit participant changes. @param {Object} data @returns {Promise<Object>} */
    const write = data => Transaction.write({cause: 'test-write', provenance: {origin: 'unit'}, changes: [], ...data});
    /** @summary Reverses retained participant endpoints through the queued command. @param {Object} data @returns {Promise<Object>} */
    const undo = data => Transaction.undo({cause: 'undo', provenance: {origin: 'unit'}, ...data});
    /** @summary Reapplies retained participant endpoints through the queued command. @param {Object} data @returns {Promise<Object>} */
    const redo = data => Transaction.redo({cause: 'redo', provenance: {origin: 'unit'}, ...data});

    /** @summary Writes one prepared value through the registered main participant. @param {String} groupId @param {String} kind @returns {Promise<Object>} */
    const writeValue = (groupId, kind) => write({
        groupId,
        descriptor: {kind},
        changes   : [{workspaceKey: 'main', input: {kind}}]
    });

    /**
     * @summary Registers a versioned value owner whose adoption can be observed or refused.
     * @param {String} groupId
     * @param {Function} [onAdopt]
     * @returns {Object} The participant's mutable source state.
     */
    const registerValue = (groupId, onAdopt = () => {}) => {
        const state = {value: {kind: 'initial'}, generation: 1, revision: 0};

        expect(Transaction.registerParticipant({groupId, workspaceKey: 'main', participant: {
            domain : 'dock',
            capture: () => ({...state, value: structuredClone(state.value)}),
            prepare: input => input,
            adopt  : (value, context) => {
                onAdopt(value, context);
                state.value = structuredClone(value);
                state.revision++
            },
            compensate: captured => Object.assign(state, captured, {value: structuredClone(captured.value)})
        }})).toBe(true);

        return state
    };

    const reset = () => {
        [...Transaction.items].forEach(group => Transaction.retireGroup(group.id));
        Transaction.historyDepth     = 0;
        Transaction.reconnectLeaseMs = 20000;
        Transaction.importHistory    = importHistory;
        imports = 0;
        log     = []
    };

    test.beforeAll(async () => {
        Transaction   = (await import('../../../../src/manager/Transaction.mjs')).default;
        importHistory = Transaction.importHistory
    });

    test.beforeEach(() => {
        reset();

        // Observe the one dynamic import without replacing it: the real module loads, the count is ours.
        Transaction.importHistory = function() {
            imports++;
            log.push('import:start');

            return importHistory.call(this).then(module => {
                log.push('import:done');

                return module
            })
        }
    });

    test.afterEach(reset);

    test('a Group at depth zero admits participant writes without the history module: one adoption, no row, no import', async () => {
        const {groupId} = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              seen      = [],
              state     = registerValue(groupId, value => seen.push(value)),
              outcome   = await writeValue(groupId, 'move');

        expect(seen).toEqual([{kind: 'move'}]);
        expect(state.value).toEqual({kind: 'move'});
        expect(outcome).toMatchObject({
            row               : null,
            snapshot          : {version: 1, participants: {main: {kind: 'move'}}},
            transactionId     : expect.any(String),
            notificationErrors: []
        });
        expect(outcome).not.toHaveProperty('result');
        expect(imports).toBe(0);
        expect(Transaction.get(groupId).history).toBeNull();
        expect(Transaction.get(groupId).historyReady).toBeNull();
        expect((await undo({groupId})).row, 'nothing to undo without history').toBeNull();
        expect((await redo({groupId})).row).toBeNull();
        expect(Transaction.getProvider(groupId).getData('canUndo')).toBe(false);
        expect(Transaction.getProvider(groupId).getData('historyDepth')).toBe(0);
        expect(imports, 'still nothing loaded').toBe(0)
    });

    test('the first write of a Group that keeps history awaits one import before adoption; queued descriptors are applied once in order', async () => {
        Transaction.historyDepth = 5;

        const {groupId} = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              state     = registerValue(groupId, value => log.push(`adopt:${value.kind}`)),
              outcomes  = await Promise.all(['a', 'b', 'c'].map(kind => writeValue(groupId, kind)));

        expect(imports).toBe(1);
        expect(log, 'the barrier resolves before the first adoption; writes keep call order').toEqual(['import:start', 'import:done', 'adopt:a', 'adopt:b', 'adopt:c']);
        expect(outcomes.map(outcome => outcome.row.kind)).toEqual(['a', 'b', 'c']);
        expect(outcomes.map(outcome => outcome.snapshot.participants.main.kind)).toEqual(['a', 'b', 'c']);
        expect(outcomes.map(outcome => outcome.row.sequence)).toEqual([1, 2, 3]);
        expect(outcomes.every(outcome => Object.isFrozen(outcome.row))).toBe(true);
        expect(state.value.kind).toBe('c');

        const {history} = Transaction.get(groupId);

        expect(history.className).toBe('Neo.manager.transaction.History');
        expect(history.depth).toBe(5);
        expect(history.count).toBe(3);
        expect(history.cursor).toBe(2);

        await writeValue(groupId, 'd');

        expect(imports, 'a loaded Group imports nothing more').toBe(1);
        expect(history.count).toBe(4);
        expect(state.value.kind).toBe('d')
    });

    test('depth is a Group\'s own choice: two roots in one worker keep their own policy, whichever was admitted first', async () => {
        const first  = Transaction.bind({windowId: 'a1', workspaceKey: 'main'}),
              second = Transaction.bind({windowId: 'b1', workspaceKey: 'main'});

        expect(Transaction.setHistoryDepth({groupId: second.groupId, depth: 50})).toBe(true);
        expect(Transaction.getProvider(second.groupId).getData('historyDepth')).toBe(50);
        expect(Transaction.getProvider(first.groupId).getData('historyDepth'), 'A was born at zero and stays there').toBe(0);

        await write({groupId: first.groupId,  descriptor: {kind: 'a'}});
        await write({groupId: second.groupId, descriptor: {kind: 'b'}});

        expect(Transaction.get(first.groupId).history, 'A loads no history').toBeNull();
        expect(Transaction.get(second.groupId).history.depth).toBe(50);
        expect(imports).toBe(1);

        // The other admission order: B's policy set before A exists changes nothing for A.
        reset();

        const late = Transaction.bind({windowId: 'b2', workspaceKey: 'main'});

        Transaction.setHistoryDepth({groupId: late.groupId, depth: 2});

        const early = Transaction.bind({windowId: 'a2', workspaceKey: 'main'});

        await write({groupId: early.groupId, descriptor: {kind: 'a'}});
        await write({groupId: late.groupId,  descriptor: {kind: 'b'}});

        expect(Transaction.get(early.groupId).history).toBeNull();
        expect(Transaction.get(late.groupId).history.depth).toBe(2);

        // Refusals: unknown Group, a bound that is not a non-negative integer, a Group whose history loaded.
        expect(Transaction.setHistoryDepth({groupId: 'nowhere', depth: 3})).toBe(false);
        expect(Transaction.setHistoryDepth({groupId: early.groupId, depth: -1})).toBe(false);
        expect(Transaction.setHistoryDepth({groupId: early.groupId, depth: 1.5})).toBe(false);
        expect(Transaction.setHistoryDepth({groupId: late.groupId, depth: 9}), 'fixed at the first write').toBe(false);
        expect(Transaction.get(late.groupId).historyDepth).toBe(2);
        expect(Transaction.setHistoryDepth({groupId: early.groupId, depth: 4}), 'A never loaded, so A may still choose').toBe(true)
    });

    test('the worker-wide default is what a Group is born with; a Group created before the default changed keeps its own', async () => {
        const before = Transaction.bind({windowId: 'w1', workspaceKey: 'main'});

        Transaction.historyDepth = 2;

        const after = Transaction.bind({windowId: 'w2', workspaceKey: 'main'});

        await write({groupId: before.groupId, descriptor: {kind: 'a'}});
        await write({groupId: after.groupId,  descriptor: {kind: 'a'}});

        expect(Transaction.get(before.groupId).history, 'born at zero, stays at zero').toBeNull();
        expect(Transaction.get(after.groupId).history.depth).toBe(2);
        expect(imports).toBe(1)
    });

    test('a rejected participant adoption appends nothing, keeps the cursor, and releases the queue for the next write', async () => {
        Transaction.historyDepth = 5;

        const {groupId} = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              provider  = Transaction.getProvider(groupId),
              state     = registerValue(groupId, value => {
                  if (value.kind === 'b') throw new Error('participant refused')
              });

        await writeValue(groupId, 'a');

        expect(provider.getData('canUndo')).toBe(true);
        expect(provider.getData('historyLength')).toBe(1);

        const failing = writeValue(groupId, 'b'),
              next    = writeValue(groupId, 'c');

        await expect(failing).rejects.toThrow('participant refused');

        const {history} = Transaction.get(groupId);

        expect((await next).row.kind, 'the queue survived the failure').toBe('c');
        expect(history.rows.map(row => row.kind)).toEqual(['a', 'c']);
        expect(history.cursor).toBe(1);
        expect(state.value.kind).toBe('c');
        expect(state.revision).toBe(2);
        expect(provider.getData('historyLength')).toBe(2)
    });

    test('a descriptor that cannot become immutable data is refused before participant adoption', async () => {
        Transaction.historyDepth = 5;

        const {groupId} = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              adopted   = [],
              state     = registerValue(groupId, value => adopted.push(value));

        await expect(write({
            groupId,
            descriptor: {kind: 'a', apply: () => {}},
            changes   : [{workspaceKey: 'main', input: {kind: 'a'}}]
        })).rejects.toThrow(/clon|plain|JSON/i);

        expect(adopted).toHaveLength(0);
        expect(state.value.kind).toBe('initial');
        expect(Transaction.get(groupId).history?.count ?? 0).toBe(0);
        expect(Transaction.getProvider(groupId).getData('canUndo')).toBe(false)
    });

    test('undo and redo adopt stored participant endpoints before moving the cursor; the provider follows and append drops the redo tail', async () => {
        Transaction.historyDepth = 5;

        const {groupId} = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              provider  = Transaction.getProvider(groupId),
              applied   = [],
              state     = registerValue(groupId, (value, context) => {
                  if (context.cursorAction !== 'append') {
                      applied.push([context.cursorAction, value.kind, Transaction.get(groupId).history.cursor])
                  }
              }),
              rows      = [];

        for (const kind of ['a', 'b', 'c']) {
            rows.push((await writeValue(groupId, kind)).row)
        }

        expect(provider.getData('canUndo')).toBe(true);
        expect(provider.getData('canRedo')).toBe(false);
        expect(provider.getData('historyCursor')).toBe(2);

        expect((await undo({groupId})).row).toBe(rows[2]);
        expect((await undo({groupId})).row).toBe(rows[1]);
        expect(applied, 'adoption sees the cursor before the move').toEqual([['undo', 'b', 2], ['undo', 'a', 1]]);
        expect(state.value.kind).toBe('a');
        expect(provider.getData('canRedo')).toBe(true);
        expect(provider.getData('historyCursor')).toBe(0);
        expect((await redo({groupId})).row).toBe(rows[1]);
        expect(applied.at(-1), 'redo adopts before moving onto its row').toEqual(['redo', 'b', 0]);
        expect(state.value.kind).toBe('b');
        expect(provider.getData('historyCursor')).toBe(1);

        const {row} = await writeValue(groupId, 'd');

        expect(Transaction.get(groupId).history.rows.map(item => item.kind)).toEqual(['a', 'b', 'd']);
        expect(row.sequence).toBe(4);
        expect(provider.getData('canRedo')).toBe(false);
        expect(provider.getData('historyLength')).toBe(3);
        expect((await redo({groupId})).row).toBeNull()
    });

    test('a rejected endpoint adoption leaves participant, cursor and provider unchanged, and the next move still works', async () => {
        Transaction.historyDepth = 5;
        let refuseUndo = true;

        const {groupId} = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              provider  = Transaction.getProvider(groupId),
              state     = registerValue(groupId, (value, context) => {
                  if (context.cursorAction === 'undo' && refuseUndo) throw new Error('reverse refused by a participant')
              });

        await writeValue(groupId, 'a');
        await writeValue(groupId, 'b');

        await expect(undo({groupId})).rejects.toThrow('reverse refused');

        expect(Transaction.get(groupId).history.cursor, 'the cursor did not move').toBe(1);
        expect(state.value.kind).toBe('b');
        expect(state.revision).toBe(2);
        expect(provider.getData('historyCursor')).toBe(1);
        expect(provider.getData('canRedo')).toBe(false);

        refuseUndo = false;
        expect((await undo({groupId})).row.kind, 'the queue is free for the next move').toBe('b');
        expect(state.value.kind).toBe('a');
        expect(provider.getData('historyCursor')).toBe(0);
        expect(Transaction.get(groupId).history.cursor).toBe(0)
    });

    test('an undo issued while the first write is loading waits for its stored participant endpoints', async () => {
        Transaction.historyDepth = 5;

        const {groupId}         = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              state             = registerValue(groupId),
              [written, undone] = await Promise.all([
                  writeValue(groupId, 'a'),
                  undo({groupId})
              ]);

        expect(undone.row).toBe(written.row);
        expect(state.value.kind).toBe('initial');
        expect(Transaction.get(groupId).history.cursor).toBe(-1);
        expect(Transaction.getProvider(groupId).getData('canRedo')).toBe(true)
    });

    test('one provider per Group whatever window asks: the opener and a popped-out slot read the same instance, a host provider chains to it, and it goes with the Group', async () => {
        Transaction.historyDepth = 2;

        const a           = Transaction.bind({windowId: 'a1', workspaceKey: 'main'}),
              reservation = Transaction.reserve({groupId: a.groupId, workspaceKey: 'popup:notes'}),
              popup       = Transaction.bind({...reservation, windowId: 'a2'}),
              provider    = Transaction.getProvider(a.groupId),
              host        = Neo.create(StateProvider, {parent: provider});

        expect(popup.groupId, 'the reserved slot binds into the opener\'s Group').toBe(a.groupId);
        expect(provider.className).toBe('Neo.state.Provider');
        expect(Transaction.getProvider(Transaction.findByWindow('a2').groupId), 'the popup resolves the same instance').toBe(provider);
        expect(Transaction.getProvider('unknown')).toBeNull();
        expect(provider.getData('historyDepth')).toBe(2);
        expect(provider.getData('historyLength')).toBe(0);
        expect(provider.getData('canUndo')).toBe(false);
        expect(host.getData('canUndo'), 'read through the explicit parent, no component tree involved').toBe(false);

        await write({groupId: a.groupId, descriptor: {kind: 'a'}});

        expect(provider.getData('canUndo')).toBe(true);
        expect(host.getData('canUndo')).toBe(true);
        expect(host.getData('historyLength')).toBe(1);

        host.destroy();
        Transaction.retireGroup(a.groupId);

        expect(provider.isDestroyed).toBe(true);
        expect(Transaction.getProvider(a.groupId)).toBeNull()
    });

    test('a Group holding history rows survives its last lease; one holding none is let go', async () => {
        Transaction.historyDepth     = 2;
        Transaction.reconnectLeaseMs = 20;

        const kept      = Transaction.bind({windowId: 'k1', workspaceKey: 'main'}),
              empty     = Transaction.bind({windowId: 'e1', workspaceKey: 'main'}),
              retired   = [],
              onRetired = ({groupId}) => retired.push(groupId);

        Transaction.on('groupRetired', onRetired);

        await write({groupId: kept.groupId, descriptor: {kind: 'a'}});

        const emptyProvider = Transaction.getProvider(empty.groupId);

        Transaction.release('k1');
        Transaction.release('e1');

        await new Promise(resolve => setTimeout(resolve, 60));

        Transaction.un('groupRetired', onRetired);

        expect(Transaction.get(kept.groupId), 'the rows are the truth of what its documents did').toBeTruthy();
        expect(Transaction.get(kept.groupId).history.count).toBe(1);
        expect(Transaction.get(empty.groupId), 'nothing retained, nothing kept').toBeNull();
        expect(emptyProvider.isDestroyed, 'a provider alone keeps nothing, and goes with the Group').toBe(true);
        expect(retired).toEqual([empty.groupId])
    });

    test('a write, undo or redo against an unknown Group rejects', async () => {
        await expect(write({groupId: 'nowhere', descriptor: {kind: 'a'}})).rejects.toThrow('unknown Group');
        await expect(undo({groupId: 'nowhere'})).rejects.toThrow('unknown Group');
        await expect(redo({groupId: 'nowhere'})).rejects.toThrow('unknown Group')
    });

    test('the worker-wide default and the Group-local bound refuse anything but a non-negative integer, so no Group is born with an unbounded log', async () => {
        const logged   = [],
              logError = Neo.logError;

        Neo.logError = (...args) => logged.push(args.join(' '));

        try {
            for (const bad of [Infinity, NaN, 1.5, -1, '2', null]) {
                Transaction.historyDepth = bad;
                expect(Transaction.historyDepth, `default ${String(bad)} refused, the one in force stays`).toBe(0)
            }
        } finally {
            Neo.logError = logError
        }

        expect(logged).toHaveLength(6);
        expect(logged[0]).toMatch(/historyDepth must be a non-negative integer, got Infinity — keeping 0/);

        // A Group born under a refused default carries the bound in force, never the refused one.
        const born = Transaction.bind({windowId: 'w0', workspaceKey: 'main'});

        expect(Transaction.get(born.groupId).historyDepth).toBe(0);
        await write({groupId: born.groupId, descriptor: {kind: 'a'}});
        expect(Transaction.get(born.groupId).history, 'depth zero loads nothing').toBeNull();

        Transaction.historyDepth = 2;

        const {groupId} = Transaction.bind({windowId: 'w1', workspaceKey: 'main'});

        for (const kind of ['a', 'b', 'c']) {
            await write({groupId, descriptor: {kind}})
        }

        const {history} = Transaction.get(groupId);

        expect(history.depth).toBe(2);
        expect(history.rows.map(row => row.kind), 'a valid bound evicts exactly').toEqual(['b', 'c'])
    });

    test('a Group retired while its history module loads gets no History, no adoption and no registered orphan', async () => {
        Transaction.historyDepth = 5;

        const {groupId} = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              record    = Transaction.get(groupId),
              adopted   = [],
              state     = registerValue(groupId, value => adopted.push(value)),
              instances = () => InstanceManager.find('className', 'Neo.manager.transaction.History').length;

        let resolveImport, started = false;

        Transaction.importHistory = () => {
            started = true;
            return new Promise(resolve => { resolveImport = resolve })
        };

        const pendingWrite = writeValue(groupId, 'a'),
              before       = instances();

        await expect.poll(() => started).toBe(true);
        expect(Transaction.retireGroup(groupId), 'retired while the import is pending').toBe(true);
        resolveImport(await importHistory.call(Transaction));

        await expect(pendingWrite).rejects.toThrow('retired while queued');
        expect(adopted).toHaveLength(0);
        expect(state.value.kind).toBe('initial');
        expect(record.history, 'the retired record never received a History').toBeNull();
        expect(instances(), 'no History was registered for the dead Group').toBe(before);

        // The same import with a live Group creates one History and ordinary retirement releases it.
        Transaction.importHistory = importHistory;
        const live = Transaction.bind({windowId: 'w2', workspaceKey: 'main'});

        await write({groupId: live.groupId, descriptor: {kind: 'a'}});

        expect(instances()).toBe(before + 1);
        expect(Transaction.retireGroup(live.groupId)).toBe(true);
        expect(instances()).toBe(before)
    });

    test('a write queued behind the barrier rejects after Group retirement without mutating a participant', async () => {
        Transaction.historyDepth = 5;

        const {groupId} = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              adopted   = [],
              state     = registerValue(groupId, value => adopted.push(value)),
              queued    = writeValue(groupId, 'a');

        expect(Transaction.retireGroup(groupId)).toBe(true);

        await expect(queued).rejects.toThrow('retired while queued');
        expect(adopted).toHaveLength(0);
        expect(state.value.kind).toBe('initial');
        expect(imports, 'at most the one barrier import could have started').toBeLessThanOrEqual(1)
    });

    test('the manager never imports the history module statically: the lazy boundary is mechanical', () => {
        const source  = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../src/manager/Transaction.mjs'), 'utf8'),
              statics = [...source.matchAll(/(?:^|\n)\s*(?:import|export)\s+[^'";]*?\s*from\s*['"]([^'"]+)['"]/g)].map(match => match[1]),
              dynamic = [...source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map(match => match[1]);

        expect(statics.some(specifier => specifier.includes('transaction/History')), 'a static import would put the module into every consumer\'s closure').toBe(false);
        expect(dynamic.filter(specifier => specifier.includes('transaction/History'))).toEqual(['./transaction/History.mjs'])
    })
});
