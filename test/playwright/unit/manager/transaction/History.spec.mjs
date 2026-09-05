import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'ManagerTransactionHistoryTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
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

    test('a depth below one is refused before any row is admitted', () => {
        const zero = Neo.create(History, {depth: 0});

        expect(() => zero.append({kind: 'a'})).toThrow(RangeError);
        expect(zero.count).toBe(0);
        zero.destroy()
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
