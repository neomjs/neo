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
 * `bind`, then `write` / `undo` / `redo` — with `adopt` and `apply` as observed slots standing in for the
 * participant protocol a later leaf fills.
 */
test.describe.serial('Neo.manager.Transaction — history admission, the queue and the Group provider', () => {
    let Transaction, importHistory, imports, log;

    const noop = () => {};

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

    test('a Group at depth zero admits writes without the history module: adopt runs once, no row, no import', async () => {
        const {groupId} = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              seen      = [],
              outcome   = await Transaction.write({
                  groupId,
                  descriptor: {kind: 'move'},
                  adopt     : descriptor => { seen.push(descriptor); return 'adopted' }
              });

        expect(seen).toHaveLength(1);
        expect(seen[0]).toEqual({kind: 'move'});
        expect(outcome).toEqual({result: 'adopted', row: null});
        expect(imports).toBe(0);
        expect(Transaction.get(groupId).history).toBeNull();
        expect(Transaction.get(groupId).historyReady).toBeNull();
        expect(await Transaction.undo({groupId, apply: noop}), 'nothing to undo without history').toBeNull();
        expect(await Transaction.redo({groupId, apply: noop})).toBeNull();
        expect(Transaction.getProvider(groupId).getData('canUndo')).toBe(false);
        expect(Transaction.getProvider(groupId).getData('historyDepth')).toBe(0);
        expect(imports, 'still nothing loaded').toBe(0)
    });

    test('the first write of a Group that keeps history awaits one import before adopt; later writes queue behind it, each descriptor once', async () => {
        Transaction.historyDepth = 5;

        const {groupId} = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              adopt     = descriptor => { log.push(`adopt:${descriptor.kind}`); return descriptor.kind },
              outcomes  = await Promise.all([
                  Transaction.write({groupId, descriptor: {kind: 'a'}, adopt}),
                  Transaction.write({groupId, descriptor: {kind: 'b'}, adopt}),
                  Transaction.write({groupId, descriptor: {kind: 'c'}, adopt})
              ]);

        expect(imports).toBe(1);
        expect(log, 'the barrier resolves before the first adopt; the writes run in call order').toEqual(['import:start', 'import:done', 'adopt:a', 'adopt:b', 'adopt:c']);
        expect(outcomes.map(outcome => outcome.result)).toEqual(['a', 'b', 'c']);
        expect(outcomes.map(outcome => outcome.row.sequence)).toEqual([1, 2, 3]);
        expect(outcomes.every(outcome => Object.isFrozen(outcome.row))).toBe(true);

        const {history} = Transaction.get(groupId);

        expect(history.className).toBe('Neo.manager.transaction.History');
        expect(history.depth).toBe(5);
        expect(history.count).toBe(3);
        expect(history.cursor).toBe(2);

        await Transaction.write({groupId, descriptor: {kind: 'd'}, adopt});

        expect(imports, 'a loaded Group imports nothing more').toBe(1);
        expect(history.count).toBe(4)
    });

    test('depth is a Group\'s own choice: two roots in one worker keep their own policy, whichever was admitted first', async () => {
        const first  = Transaction.bind({windowId: 'a1', workspaceKey: 'main'}),
              second = Transaction.bind({windowId: 'b1', workspaceKey: 'main'});

        expect(Transaction.setHistoryDepth({groupId: second.groupId, depth: 50})).toBe(true);
        expect(Transaction.getProvider(second.groupId).getData('historyDepth')).toBe(50);
        expect(Transaction.getProvider(first.groupId).getData('historyDepth'), 'A was born at zero and stays there').toBe(0);

        await Transaction.write({groupId: first.groupId,  descriptor: {kind: 'a'}});
        await Transaction.write({groupId: second.groupId, descriptor: {kind: 'b'}});

        expect(Transaction.get(first.groupId).history, 'A loads no history').toBeNull();
        expect(Transaction.get(second.groupId).history.depth).toBe(50);
        expect(imports).toBe(1);

        // The other admission order: B's policy set before A exists changes nothing for A.
        reset();

        const late = Transaction.bind({windowId: 'b2', workspaceKey: 'main'});

        Transaction.setHistoryDepth({groupId: late.groupId, depth: 2});

        const early = Transaction.bind({windowId: 'a2', workspaceKey: 'main'});

        await Transaction.write({groupId: early.groupId, descriptor: {kind: 'a'}});
        await Transaction.write({groupId: late.groupId,  descriptor: {kind: 'b'}});

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

        await Transaction.write({groupId: before.groupId, descriptor: {kind: 'a'}});
        await Transaction.write({groupId: after.groupId,  descriptor: {kind: 'a'}});

        expect(Transaction.get(before.groupId).history, 'born at zero, stays at zero').toBeNull();
        expect(Transaction.get(after.groupId).history.depth).toBe(2);
        expect(imports).toBe(1)
    });

    test('a rejected adopt appends nothing, keeps the cursor, and releases the queue for the next write', async () => {
        Transaction.historyDepth = 5;

        const {groupId} = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              provider  = Transaction.getProvider(groupId);

        await Transaction.write({groupId, descriptor: {kind: 'a'}, adopt: () => 'ok'});

        expect(provider.getData('canUndo')).toBe(true);
        expect(provider.getData('historyLength')).toBe(1);

        const failing = Transaction.write({groupId, descriptor: {kind: 'b'}, adopt: () => { throw new Error('second participant refused') }}),
              next    = Transaction.write({groupId, descriptor: {kind: 'c'}, adopt: () => 'ok'});

        await expect(failing).rejects.toThrow('second participant refused');

        const {history} = Transaction.get(groupId);

        expect((await next).row.kind, 'the queue survived the failure').toBe('c');
        expect(history.rows.map(row => row.kind)).toEqual(['a', 'c']);
        expect(history.cursor).toBe(1);
        expect(provider.getData('historyLength')).toBe(2)
    });

    test('a descriptor the history would refuse is refused before adopt runs: no participant change without a row', async () => {
        Transaction.historyDepth = 5;

        const {groupId} = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              adopted   = [];

        await expect(Transaction.write({groupId, descriptor: {kind: 'a', apply: () => {}}, adopt: descriptor => adopted.push(descriptor)})).rejects.toThrow(TypeError);

        expect(adopted).toHaveLength(0);
        expect(Transaction.get(groupId).history.count).toBe(0);
        expect(Transaction.getProvider(groupId).getData('canUndo')).toBe(false)
    });

    test('undo and redo apply first and move the cursor after; the provider follows; an append after undo drops the tail', async () => {
        Transaction.historyDepth = 5;

        const {groupId} = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              provider  = Transaction.getProvider(groupId),
              applied   = [],
              apply     = row => { applied.push([row.kind, Transaction.get(groupId).history.cursor]) },
              rows      = [];

        for (const kind of ['a', 'b', 'c']) {
            rows.push((await Transaction.write({groupId, descriptor: {kind}})).row)
        }

        expect(provider.getData('canUndo')).toBe(true);
        expect(provider.getData('canRedo')).toBe(false);
        expect(provider.getData('historyCursor')).toBe(2);

        expect(await Transaction.undo({groupId, apply})).toBe(rows[2]);
        expect(await Transaction.undo({groupId, apply})).toBe(rows[1]);
        expect(applied, 'apply sees the cursor still on the row it reverses').toEqual([['c', 2], ['b', 1]]);
        expect(provider.getData('canRedo')).toBe(true);
        expect(provider.getData('historyCursor')).toBe(0);
        expect(await Transaction.redo({groupId, apply})).toBe(rows[1]);
        expect(applied.at(-1), 'redo applies before the cursor moves onto the row').toEqual(['b', 0]);
        expect(provider.getData('historyCursor')).toBe(1);

        const {row} = await Transaction.write({groupId, descriptor: {kind: 'd'}});

        expect(Transaction.get(groupId).history.rows.map(item => item.kind)).toEqual(['a', 'b', 'd']);
        expect(row.sequence).toBe(4);
        expect(provider.getData('canRedo')).toBe(false);
        expect(provider.getData('historyLength')).toBe(3);
        expect(await Transaction.redo({groupId, apply})).toBeNull()
    });

    test('a rejected application moves nothing: cursor and provider stay, and the next move still works; undo without apply is refused', async () => {
        Transaction.historyDepth = 5;

        const {groupId} = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              provider  = Transaction.getProvider(groupId);

        await Transaction.write({groupId, descriptor: {kind: 'a'}});
        await Transaction.write({groupId, descriptor: {kind: 'b'}});

        await expect(Transaction.undo({groupId, apply: async () => { throw new Error('reverse refused by a participant') }})).rejects.toThrow('reverse refused');

        expect(Transaction.get(groupId).history.cursor, 'the cursor did not move').toBe(1);
        expect(provider.getData('historyCursor')).toBe(1);
        expect(provider.getData('canRedo')).toBe(false);

        expect((await Transaction.undo({groupId, apply: noop})).kind, 'the queue is free for the next move').toBe('b');
        expect(provider.getData('historyCursor')).toBe(0);

        await expect(Transaction.undo({groupId})).rejects.toThrow('apply(row) is required');
        await expect(Transaction.redo({groupId, apply: 'later'})).rejects.toThrow('apply(row) is required');
        expect(Transaction.get(groupId).history.cursor).toBe(0)
    });

    test('an undo issued while the first write is still loading waits for it and moves the cursor off the row that write admitted', async () => {
        Transaction.historyDepth = 5;

        const {groupId}       = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              [{row}, undone] = await Promise.all([
                  Transaction.write({groupId, descriptor: {kind: 'a'}}),
                  Transaction.undo({groupId, apply: noop})
              ]);

        expect(undone).toBe(row);
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

        await Transaction.write({groupId: a.groupId, descriptor: {kind: 'a'}});

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

        await Transaction.write({groupId: kept.groupId, descriptor: {kind: 'a'}});

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
        await expect(Transaction.write({groupId: 'nowhere', descriptor: {kind: 'a'}})).rejects.toThrow('unknown Group');
        await expect(Transaction.undo({groupId: 'nowhere', apply: noop})).rejects.toThrow('unknown Group');
        await expect(Transaction.redo({groupId: 'nowhere', apply: noop})).rejects.toThrow('unknown Group')
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
        await Transaction.write({groupId: born.groupId, descriptor: {kind: 'a'}});
        expect(Transaction.get(born.groupId).history, 'depth zero loads nothing').toBeNull();

        Transaction.historyDepth = 2;

        const {groupId} = Transaction.bind({windowId: 'w1', workspaceKey: 'main'});

        for (const kind of ['a', 'b', 'c']) {
            await Transaction.write({groupId, descriptor: {kind}})
        }

        const {history} = Transaction.get(groupId);

        expect(history.depth).toBe(2);
        expect(history.rows.map(row => row.kind), 'a valid bound evicts exactly').toEqual(['b', 'c'])
    });

    test('a Group retired while its history module is still loading gets no History: the write rejects, nothing is adopted, and no orphan is registered', async () => {
        Transaction.historyDepth = 5;

        const {groupId} = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              record    = Transaction.get(groupId),
              adopted   = [],
              instances = () => InstanceManager.find('className', 'Neo.manager.transaction.History').length;

        let resolveImport, started = false;

        Transaction.importHistory = () => {
            started = true;
            return new Promise(resolve => { resolveImport = resolve })
        };

        const write  = Transaction.write({groupId, descriptor: {kind: 'a'}, adopt: descriptor => adopted.push(descriptor)}),
              before = instances();

        while (!started) {
            await new Promise(resolve => setTimeout(resolve, 0))
        }

        expect(Transaction.retireGroup(groupId), 'retired while the import is pending').toBe(true);

        resolveImport(await importHistory.call(Transaction));

        await expect(write).rejects.toThrow('retired while queued');
        expect(adopted).toHaveLength(0);
        expect(record.history, 'the retired record never received a History').toBeNull();
        expect(instances(), 'no History was registered for the dead Group').toBe(before);

        // Control: the same pending import with the Group alive creates exactly one History.
        Transaction.importHistory = importHistory;

        const live = Transaction.bind({windowId: 'w2', workspaceKey: 'main'});

        await Transaction.write({groupId: live.groupId, descriptor: {kind: 'a'}});

        expect(instances()).toBe(before + 1);
        expect(Transaction.retireGroup(live.groupId)).toBe(true);
        expect(instances(), 'ordinary retirement releases it').toBe(before)
    });

    test('a write queued behind the barrier when its Group is retired rejects instead of touching what the retirement released', async () => {
        Transaction.historyDepth = 5;

        const {groupId} = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              adopted   = [],
              queued    = Transaction.write({groupId, descriptor: {kind: 'a'}, adopt: descriptor => adopted.push(descriptor)});

        expect(Transaction.retireGroup(groupId)).toBe(true);

        await expect(queued).rejects.toThrow('retired while queued');
        expect(adopted, 'no participant mutation for a Group that is gone').toHaveLength(0);
        expect(imports, 'the barrier had already started loading; the module is simply not used').toBeLessThanOrEqual(1)
    });

    test('the manager never imports the history module statically: the lazy boundary is mechanical', () => {
        const source  = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../src/manager/Transaction.mjs'), 'utf8'),
              statics = [...source.matchAll(/(?:^|\n)\s*(?:import|export)\s+[^'";]*?\s*from\s*['"]([^'"]+)['"]/g)].map(match => match[1]),
              dynamic = [...source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map(match => match[1]);

        expect(statics.some(specifier => specifier.includes('transaction/History')), 'a static import would put the module into every consumer\'s closure').toBe(false);
        expect(dynamic).toEqual(['./transaction/History.mjs'])
    })
});
