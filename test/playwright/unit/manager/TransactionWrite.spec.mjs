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
import StateProvider   from '../../../../src/state/Provider.mjs';

/**
 * The write side of a Group: the serialized queue, the admission barrier that loads the history module once
 * and only for a Group that keeps history, the cursor moves, and the Group provider every bound window
 * reads. The manager is driven the way a host does — `bind`, then `write` / `undo` / `redo` — with `adopt`
 * as an observed slot standing in for the participant protocol a later leaf fills.
 */
test.describe.serial('Neo.manager.Transaction — history admission, the queue and the Group provider', () => {
    let Transaction, importHistory, imports, log;

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
        expect(await Transaction.undo({groupId}), 'nothing to undo without history').toBeNull();
        expect(await Transaction.redo({groupId})).toBeNull();
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

    test('the depth is the Group\'s at birth: a Group created before the bound changed keeps its own', async () => {
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
        expect(history.getRange(0, history.count).map(row => row.kind)).toEqual(['a', 'c']);
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

    test('undo and redo move the cursor on the queue and the provider follows; an append after undo drops the tail', async () => {
        Transaction.historyDepth = 5;

        const {groupId} = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              provider  = Transaction.getProvider(groupId),
              rows      = [];

        for (const kind of ['a', 'b', 'c']) {
            rows.push((await Transaction.write({groupId, descriptor: {kind}})).row)
        }

        expect(provider.getData('canUndo')).toBe(true);
        expect(provider.getData('canRedo')).toBe(false);
        expect(provider.getData('historyCursor')).toBe(2);

        expect(await Transaction.undo({groupId})).toBe(rows[2]);
        expect(await Transaction.undo({groupId})).toBe(rows[1]);
        expect(provider.getData('canRedo')).toBe(true);
        expect(provider.getData('historyCursor')).toBe(0);
        expect(await Transaction.redo({groupId})).toBe(rows[1]);
        expect(provider.getData('historyCursor')).toBe(1);

        const {row} = await Transaction.write({groupId, descriptor: {kind: 'd'}});

        expect(Transaction.get(groupId).history.getRange(0, 3).map(item => item.kind)).toEqual(['a', 'b', 'd']);
        expect(row.sequence).toBe(4);
        expect(provider.getData('canRedo')).toBe(false);
        expect(provider.getData('historyLength')).toBe(3);
        expect(await Transaction.redo({groupId})).toBeNull()
    });

    test('an undo issued while the first write is still loading waits for it and moves the cursor off the row that write admitted', async () => {
        Transaction.historyDepth = 5;

        const {groupId}       = Transaction.bind({windowId: 'w1', workspaceKey: 'main'}),
              [{row}, undone] = await Promise.all([
                  Transaction.write({groupId, descriptor: {kind: 'a'}}),
                  Transaction.undo({groupId})
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
        await expect(Transaction.undo({groupId: 'nowhere'})).rejects.toThrow('unknown Group');
        await expect(Transaction.redo({groupId: 'nowhere'})).rejects.toThrow('unknown Group')
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
