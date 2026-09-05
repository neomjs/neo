import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'ManagerTransactionHistoryTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Collection     from '../../../../../src/collection/Base.mjs';
import History        from '../../../../../src/manager/transaction/History.mjs';

/**
 * A Group's history is an append-only authority over frozen plain rows with one cursor. These arms drive the
 * class alone — no manager, no participants: what is admitted, what a retained row refuses, how the cursor
 * moves, what eviction and the redo tail drop, what the serialized bytes are, and that the surface a
 * consumer can reach never mutates a row.
 */
test.describe('Neo.manager.transaction.History — frozen rows and the cursor', () => {
    let history;

    test.beforeEach(() => {
        history = Neo.create(History, {depth: 3})
    });

    test.afterEach(() => {
        history.destroy();
        history = null
    });

    test('append copies, stamps and freezes the descriptor to every depth; the cursor moves onto the row', () => {
        const descriptor = {kind: 'move', payload: {items: ['a', 'b'], nested: {x: 1}}},
              row        = history.append(descriptor);

        expect(row).not.toBe(descriptor);
        expect(row.kind).toBe('move');
        expect(row.payload).toEqual(descriptor.payload);
        expect(typeof row.id).toBe('string');
        expect(row.sequence).toBe(1);
        expect(typeof row.recordedAt).toBe('number');
        expect(Object.isFrozen(row)).toBe(true);
        expect(Object.isFrozen(row.payload)).toBe(true);
        expect(Object.isFrozen(row.payload.items)).toBe(true);
        expect(Object.isFrozen(row.payload.nested)).toBe(true);
        expect(Object.isFrozen(descriptor), 'the writer keeps a mutable descriptor of its own').toBe(false);
        expect(history.count).toBe(1);
        expect(history.cursor).toBe(0);
        expect(history.current).toBe(row);
        expect(history.canUndo).toBe(true);
        expect(history.canRedo).toBe(false);
        expect(history.has(row.id)).toBe(true);
        expect(history.get(row.id), 'keyed by the id the row carried in; the collection wrote nothing onto it').toBe(row);
        expect(history.getAt(0)).toBe(row)
    });

    test('a retained row refuses nested mutation and whole-field replacement; its bytes do not move', () => {
        const row   = history.append({kind: 'split', payload: {size: 0.5, items: ['a']}}),
              bytes = JSON.stringify(row);

        expect(() => { row.kind = 'tab' }).toThrow(TypeError);
        expect(() => { row.payload = {} }).toThrow(TypeError);
        expect(() => { row.payload.size = 1 }).toThrow(TypeError);
        expect(() => { row.payload.items.push('b') }).toThrow(TypeError);
        expect(() => { delete row.payload.size }).toThrow(TypeError);
        expect(() => { row.extra = true }).toThrow(TypeError);
        expect(JSON.stringify(row)).toBe(bytes);
        expect(history.getAt(0)).toBe(row);
        expect(history.cursor).toBe(0)
    });

    test('the reachable surface is read-only: rows is a fresh array, and the authority has no remove, insert, splice or sort', () => {
        const a    = history.append({kind: 'a'}),
              rows = history.rows;

        expect(rows).toEqual([a]);
        expect(history.rows, 'a new array on every read').not.toBe(rows);

        rows.length = 0;
        rows.push({kind: 'forged'});

        expect(history.rows, 'a consumer mutating its copy touches no row').toEqual([a]);
        expect(history.count).toBe(1);

        for (const method of ['remove', 'removeAt', 'insert', 'splice', 'add', 'push', 'pop', 'shift', 'unshift', 'move', 'reverse', 'clear', 'doSort']) {
            expect(typeof history[method], `${method} is not on the authority`).toBe('undefined')
        }
    });

    test('a descriptor that is not plain data, or an id already retained, is refused and nothing changes', () => {
        class Live {}

        const first  = history.append({id: 'row-1', kind: 'a'}),
              cyclic = {kind: 'a'};

        cyclic.self = cyclic;

        for (const bad of [
            null, undefined, 'row', 42, ['a'],
            {kind: 'a', apply: () => {}},
            {kind: 'a', at: new Date()},
            {kind: 'a', live: new Live()},
            {kind: 'a', big: 1n},
            {kind: 'a', map: new Map()},
            {kind: 'a', nested: {deep: {sym: Symbol('s')}}},
            cyclic
        ]) {
            expect(() => history.append(bad), `refused: ${bad && typeof bad === 'object' ? Object.keys(bad).join(',') : String(bad)}`).toThrow(TypeError)
        }

        expect(() => history.append({id: 'row-1', kind: 'again'})).toThrow(/already retained/);
        expect(history.count).toBe(1);
        expect(history.cursor).toBe(0);
        expect(history.sequence, 'a refused row consumes no sequence').toBe(1);
        expect(history.current).toBe(first)
    });

    test('a shared reference is plain data — it serializes twice, as JSON does', () => {
        const shared = {size: 0.5},
              row    = history.append({kind: 'a', left: shared, right: shared});

        expect(row.left).toEqual({size: 0.5});
        expect(row.right).toEqual({size: 0.5});
        expect(JSON.parse(JSON.stringify(row)).right.size).toBe(0.5)
    });

    test('a checkpoint restores a partially admitted append and its redo tail without mutation events, then normal notifications resume', () => {
        const originalAdd = Collection.prototype.add;
        let collection, first;

        try {
            Collection.prototype.add = function(item) {
                collection = this;
                return originalAdd.call(this, item)
            };
            first = history.append({id: 'a', payload: {value: 1}})
        } finally {
            Collection.prototype.add = originalAdd
        }

        const
            rows          = [first, history.append({id: 'b'}), history.append({id: 'c'})],
            notifications = [],
            scope         = {id: 'history-checkpoint-observer'};

        history.undo();
        history.undo();

        const checkpoint = history.captureState(),
              bytes      = JSON.stringify(history);

        collection.on('mutate', event => {
            notifications.push(event);
            if (event.addedItems?.some(row => row.id === 'failed')) {
                throw new Error('failure after Collection admission')
            }
        }, scope);

        expect(() => history.append({id: 'failed'})).toThrow('failure after Collection admission');
        expect(history.rows.map(row => row.id)).toEqual(['a', 'failed']);
        notifications.length = 0;

        history.restoreState(checkpoint);

        expect(JSON.stringify(history)).toBe(bytes);
        history.rows.forEach((row, index) => expect(row).toBe(rows[index]));
        expect(history.get('failed')).toBeNull();
        expect(history.canRedo).toBe(true);
        expect(notifications).toEqual([]);

        // A restore error must release its silent bracket and leave the checkpoint retryable.
        const retry  = history.captureState(),
              splice = collection.splice;

        history.redo();
        collection.splice = () => { throw new Error('restore fault') };

        try {
            expect(() => history.restoreState(retry)).toThrow('restore fault')
        } finally {
            collection.splice = splice
        }

        history.restoreState(retry);
        expect(JSON.stringify(history)).toBe(bytes);
        expect(notifications).toEqual([]);

        history.append({id: 'next'});
        expect(notifications.some(event => event.addedItems?.some(row => row.id === 'next'))).toBe(true)
    });

    test('checkpoints restore evicted row identities, cursor moves and an empty initial history', () => {
        const empty = history.captureState(),
              rows  = ['a', 'b', 'c'].map(id => history.append({id, payload: {id}}));

        history.undo();

        const checkpoint = history.captureState(),
              bytes      = JSON.stringify(history);

        expect(Object.isFrozen(checkpoint)).toBe(true);
        expect(() => { checkpoint.rows = [] }).toThrow(TypeError);

        history.redo();
        history.append({id: 'd'});
        history.append({id: 'e'});
        history.undo();
        expect(history.has('a')).toBe(false);

        history.restoreState(checkpoint);

        expect(JSON.stringify(history)).toBe(bytes);
        rows.forEach((row, index) => expect(history.getAt(index)).toBe(row));
        expect(history.peek('redo')).toBe(rows[2]);

        history.restoreState(empty);

        expect(history.rows).toEqual([]);
        expect(history.count).toBe(0);
        expect(history.cursor).toBe(-1);
        expect(history.sequence).toBe(0);
        expect(history.canUndo).toBe(false);
        expect(history.canRedo).toBe(false);
        expect(history.append({id: 'first-again'}).sequence).toBe(1)
    });

    test('foreign, forged, consumed and retired checkpoints cannot mutate a History', () => {
        const other = Neo.create(History, {depth: 3});

        try {
            history.append({id: 'owned'});
            const checkpoint = history.captureState(),
                  bytes      = JSON.stringify(history);

            for (const invalid of [null, {}, {...checkpoint}, other.captureState()]) {
                expect(() => history.restoreState(invalid)).toThrow(/belong to this live history/);
                expect(JSON.stringify(history)).toBe(bytes)
            }

            history.restoreState(checkpoint);
            expect(() => history.restoreState(checkpoint)).toThrow(/belong to this live history/);

            const retired = other.captureState();

            other.destroy();
            expect(() => other.restoreState(retired)).toThrow(/belong to this live history/);
            expect(() => other.captureState()).toThrow(/retired history/)
        } finally {
            !other.isDestroyed && other.destroy()
        }
    });

    test('append after undo drops the redo tail, and only the tail', () => {
        const a = history.append({kind: 'a'}),
              b = history.append({kind: 'b'}),
              c = history.append({kind: 'c'});

        expect(history.undo()).toBe(c);
        expect(history.undo()).toBe(b);
        expect(history.cursor).toBe(0);
        expect(history.canRedo).toBe(true);

        const d = history.append({kind: 'd'});

        expect(history.rows).toEqual([a, d]);
        expect(history.cursor).toBe(1);
        expect(history.canRedo).toBe(false);
        expect(history.redo(), 'the dropped tail cannot come back').toBeNull();
        expect(d.sequence, 'sequence counts admissions, not retained rows').toBe(4)
    });

    test('undo and redo walk the cursor deterministically and return the row to apply; peek shows it without moving', () => {
        const rows = ['a', 'b', 'c'].map(kind => history.append({kind}));

        expect(history.peek('redo'), 'nothing ahead of the newest row').toBeNull();
        expect(history.peek('undo')).toBe(rows[2]);
        expect(history.cursor, 'peek moved nothing').toBe(2);
        expect(history.redo()).toBeNull();
        expect(history.undo()).toBe(rows[2]);
        expect(history.undo()).toBe(rows[1]);
        expect(history.peek('undo')).toBe(rows[0]);
        expect(history.peek('redo')).toBe(rows[1]);
        expect(history.undo()).toBe(rows[0]);
        expect(history.cursor).toBe(-1);
        expect(history.current).toBeNull();
        expect(history.canUndo).toBe(false);
        expect(history.peek('undo')).toBeNull();
        expect(history.undo(), 'nothing behind the first row').toBeNull();
        expect(history.redo()).toBe(rows[0]);
        expect(history.redo()).toBe(rows[1]);
        expect(history.cursor).toBe(1);
        expect(history.current).toBe(rows[1]);
        expect(history.count, 'undo and redo retain every row').toBe(3);
        expect(() => history.peek('sideways')).toThrow(RangeError)
    });

    test('past the depth the oldest row is evicted and the cursor follows; a sequence is never reused', () => {
        const rows = ['a', 'b', 'c', 'd', 'e'].map(kind => history.append({kind}));

        expect(history.count).toBe(3);
        expect(history.rows).toEqual(rows.slice(2));
        expect(history.cursor).toBe(2);
        expect(history.current).toBe(rows[4]);
        expect(rows.map(row => row.sequence)).toEqual([1, 2, 3, 4, 5]);
        expect(history.undo()).toBe(rows[4]);
        expect(history.undo()).toBe(rows[3]);
        expect(history.undo()).toBe(rows[2]);
        expect(history.undo(), 'an evicted row is not undoable').toBeNull();
        expect(history.get(rows[0].id), 'evicted rows leave the authority').toBeNull();
        expect(history.has(rows[0].id)).toBe(false)
    });

    test('an append behind the newest row drops the tail first, then evicts from the front; the cursor stays on its row', () => {
        const rows = ['a', 'b', 'c'].map(kind => history.append({kind}));

        history.undo();

        const d = history.append({kind: 'd'});

        expect(history.rows, 'c dropped, nothing evicted at depth 3').toEqual([rows[0], rows[1], d]);

        const e = history.append({kind: 'e'});

        expect(history.rows, 'a evicted').toEqual([rows[1], d, e]);
        expect(history.cursor).toBe(2);
        expect(history.current).toBe(e)
    });

    test('the bound is a finite positive integer: refused with a throw at construction, refused and logged on assignment; a valid bound evicts exactly', () => {
        for (const depth of [0, -1, 1.5, Infinity, NaN, '3', null]) {
            expect(() => Neo.create(History, {depth}), `depth ${String(depth)} refused`).toThrow(RangeError)
        }

        const logged   = [],
              logError = Neo.logError;

        Neo.logError = (...args) => logged.push(args.join(' '));

        try {
            for (const depth of [Infinity, NaN, 1.5, 0]) {
                history.depth = depth;
                expect(history.depth, `assignment of ${String(depth)} keeps the bound in force`).toBe(3)
            }
        } finally {
            Neo.logError = logError
        }

        expect(logged).toHaveLength(4);
        expect(logged[0]).toMatch(/depth must be a positive integer, got Infinity — keeping 3/);

        history.depth = 4;
        expect(history.depth, 'a valid bound is taken').toBe(4);

        const two = Neo.create(History, {depth: 2});

        ['a', 'b', 'c', 'd', 'e'].forEach(kind => two.append({kind}));

        expect(two.count).toBe(2);
        expect(two.rows.map(row => row.kind)).toEqual(['d', 'e']);
        two.destroy()
    });

    test('a descriptor that reads as plain data but cannot be copied is refused with the log untouched — rows, bytes, cursor, sequence and the redo tail', () => {
        const a = history.append({kind: 'a'}),
              b = history.append({kind: 'b'});

        history.undo();

        const before = {
            bytes   : JSON.stringify(history.rows),
            cursor  : history.cursor,
            sequence: history.sequence,
            canRedo : history.canRedo,
            ids     : history.rows.map(row => row.id)
        };

        expect(before).toMatchObject({cursor: 0, sequence: 2, canRedo: true, ids: [a.id, b.id]});

        // A Proxy over a plain object passes every structural read and fails only the structured copy.
        expect(() => history.append({kind: 'bad', nested: new Proxy({value: 1}, {})})).toThrow(TypeError);

        expect({
            bytes   : JSON.stringify(history.rows),
            cursor  : history.cursor,
            sequence: history.sequence,
            canRedo : history.canRedo,
            ids     : history.rows.map(row => row.id)
        }).toEqual(before);

        expect(history.redo(), 'the redo tail survived the refusal').toBe(b);
        expect(history.append({kind: 'c'}).sequence, 'the next admission continues the sequence unbroken').toBe(3)
    });

    test('toJSON carries the frozen rows in order, the count, the cursor, the bound and the sequence', () => {
        const a = history.append({id: 'first', kind: 'a'});

        history.append({id: 'second', kind: 'b'});
        history.undo();

        const json = JSON.parse(JSON.stringify(history));

        expect(json.className).toBe('Neo.manager.transaction.History');
        expect(json.count).toBe(2);
        expect(json.cursor).toBe(0);
        expect(json.depth).toBe(3);
        expect(json.sequence).toBe(2);
        expect(json.rows.map(row => row.id)).toEqual(['first', 'second']);
        expect(json.rows[0]).toEqual(JSON.parse(JSON.stringify(a)));
        expect(json.rows[1].kind).toBe('b')
    });

    test('destroy releases the rows; the surface answers empty instead of throwing', () => {
        history.append({kind: 'a'});
        history.destroy();

        expect(history.count).toBe(0);
        expect(history.rows).toEqual([]);
        expect(history.get('x')).toBeNull();
        expect(history.has('x')).toBe(false);

        history = Neo.create(History, {depth: 3})
    })
});
