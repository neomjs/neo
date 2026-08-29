import {setup} from '../../setup.mjs';

const appName = 'TreeStorePathTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Instance       from '../../../../src/manager/Instance.mjs';
import TreeStore      from '../../../../src/data/TreeStore.mjs';
import TreeModel      from '../../../../src/data/TreeModel.mjs';

test.describe('Neo.data.TreeStore (Path Materialization)', () => {
    let store;

    class PathTestModel extends TreeModel {
        static config = {
            className: 'Test.Unit.Data.TreeStorePath.Model',
            fields   : [
                {name: 'id',      type: 'String'},
                {name: 'iconCls', type: 'String'},
                {name: 'name',    type: 'String'}
            ]
        }
    }

    const TestModel = Neo.setupClass(PathTestModel);

    test.beforeEach(() => {
        store = Neo.create(TreeStore, {model: TestModel, data: []})
    });

    test.afterEach(() => {
        store?.destroy();
        store = null
    });

    /**
     * Reads the Structural Layer through the public accessor, so a node hidden behind a collapsed
     * ancestor is still observed. The Projection Layer would report an empty tree here.
     */
    const childIds = (parentId='root') => store.getChildren(parentId).map(record => record.id);

    test.describe('AC-1: one call materializes the whole path', () => {
        test('creates every ancestor and the leaf, correctly parented', () => {
            const leaf = store.materializePath('A/B/C');

            expect(leaf.id).toBe('A/B/C');
            expect(childIds('root')).toEqual(['A']);
            expect(childIds('A')).toEqual(['A/B']);
            expect(childIds('A/B')).toEqual(['A/B/C']);

            expect(store.get('A').parentId).toBe('root');
            expect(store.get('A/B').parentId).toBe('A');
            expect(store.get('A/B/C').parentId).toBe('A/B')
        });

        test('the leaf carries its payload', () => {
            const leaf = store.materializePath('View/Inspect', {iconCls: 'fa fa-search'});

            expect(leaf.iconCls).toBe('fa fa-search');
            expect(leaf.name).toBe('Inspect');
            expect(store.get('View').name).toBe('View')
        })
    });

    test.describe('AC-2: convergence is order-independent', () => {
        test('two contributors under one prefix converge on a single group', () => {
            store.materializePath('Group/A');
            store.materializePath('Group/B');

            expect(childIds('root')).toEqual(['Group']);
            expect(childIds('Group')).toEqual(['Group/A', 'Group/B']);
            expect(store.get('Group').childCount).toBe(2)
        });

        test('the reverse order produces the identical store state', () => {
            const snapshot = tree => ['root', 'Group'].map(parentId =>
                tree.getChildren(parentId).map(record =>
                    `${record.id}|${record.parentId}|${record.depth}|${record.isLeaf}|${record.childCount}|${record.siblingIndex}/${record.siblingCount}`
                ).join(',')
            ).join(' :: ');

            store.materializePath('Group/A');
            store.materializePath('Group/B');
            const forward = snapshot(store);

            const reverse = Neo.create(TreeStore, {model: TestModel, data: []});
            reverse.materializePath('Group/B');
            reverse.materializePath('Group/A');

            // Same set, same parents, same derived invariants. Sibling ORDER follows declaration
            // order by design, which is why this compares per-parent membership rather than sequence.
            expect(reverse.getChildren('Group').map(r => r.id).sort()).toEqual(['Group/A', 'Group/B']);
            expect(reverse.getChildren('root').map(r => r.id)).toEqual(['Group']);
            expect(snapshot(reverse).split(' :: ')[0]).toBe(forward.split(' :: ')[0]);

            reverse.destroy()
        });

        test('a deep path first, then its own ancestor declared explicitly', () => {
            store.materializePath('A/B/C');
            const b = store.materializePath('A/B', {iconCls: 'declared-late'});

            expect(childIds('root')).toEqual(['A']);
            expect(childIds('A')).toEqual(['A/B']);
            expect(childIds('A/B')).toEqual(['A/B/C']);
            expect(b.id).toBe('A/B');

            // Documented policy: an existing node keeps the payload it was created with. The later
            // declaration resolves to the same node rather than duplicating or merging into it.
            expect(b.iconCls).toBeFalsy()
        })
    });

    test.describe('AC-3: re-materializing is a no-op', () => {
        test('repeating a path adds nothing and returns the same leaf', () => {
            const first = store.materializePath('A/B/C'),
                  count = store.getCount();

            const second = store.materializePath('A/B/C');

            expect(store.getCount()).toBe(count);
            expect(childIds('root')).toEqual(['A']);
            expect(childIds('A')).toEqual(['A/B']);
            expect(childIds('A/B')).toEqual(['A/B/C']);
            expect(second.id).toBe(first.id)
        });

        test('CONTROL: a raw add() of the same node DOES duplicate it', () => {
            // Without this control the test above proves nothing — it would pass against any
            // implementation, including one that simply never adds twice because nothing adds at all.
            // The Structural Layer dedupes children by object identity, so an equal-but-distinct
            // literal is appended a second time. materializePath() is what avoids that.
            store.materializePath('Group');
            store.add({id: 'Group', parentId: 'root', name: 'Group', isLeaf: false});

            expect(childIds('root')).toEqual(['Group', 'Group']);
            expect(store.get('Group').siblingCount).toBe(2)
        })
    });

    test.describe('AC-4: the Structural Layer owns the derived invariants', () => {
        test('depth, isLeaf and childCount are correct at every level', () => {
            store.materializePath('A/B/C');

            expect(store.get('A').depth).toBe(0);
            expect(store.get('A/B').depth).toBe(1);
            expect(store.get('A/B/C').depth).toBe(2);

            expect(store.get('A').isLeaf).toBe(false);
            expect(store.get('A/B').isLeaf).toBe(false);
            expect(store.get('A/B/C').isLeaf).toBe(true);

            expect(store.get('A').childCount).toBe(1);
            expect(store.get('A/B').childCount).toBe(1);
            expect(store.get('A/B/C').childCount).toBe(0)
        });

        test('CONTROL: the same records added child-first are silently re-parented to root', () => {
            // This is the failure materializePath() exists to make unreachable. splice() resolves
            // depth from the parent record and heals an unknown parent by moving the node to 'root',
            // without re-adopting it when the parent arrives later.
            const raw = Neo.create(TreeStore, {model: TestModel, data: []});

            raw.add([
                {id: 'A/B', parentId: 'A',    name: 'B'},
                {id: 'A',   parentId: 'root', name: 'A', isLeaf: false}
            ]);

            expect(raw.get('A/B').parentId).toBe('root');
            expect(raw.getChildren('A')).toEqual([]);
            expect(raw.get('A').childCount).toBe(0);

            raw.destroy()
        })
    });

    test.describe('AC-5: sibling fields survive mixed-order insertion', () => {
        test('interleaved contributions across two groups stay correctly numbered', () => {
            store.materializePath('X/1');
            store.materializePath('Y/1');
            store.materializePath('X/2');
            store.materializePath('Y/2');
            store.materializePath('X/3');

            const stats = id => {
                const record = store.get(id);
                return `${record.siblingIndex}/${record.siblingCount}`
            };

            expect(stats('X/1')).toBe('1/3');
            expect(stats('X/2')).toBe('2/3');
            expect(stats('X/3')).toBe('3/3');
            expect(stats('Y/1')).toBe('1/2');
            expect(stats('Y/2')).toBe('2/2');

            expect(stats('X')).toBe('1/2');
            expect(stats('Y')).toBe('2/2');

            expect(store.get('X').childCount).toBe(3);
            expect(store.get('Y').childCount).toBe(2)
        })
    });

    test.describe('an active sorter survives materialization into a collapsed branch', () => {
        const sorted = () => Neo.create(TreeStore, {
            model  : TestModel,
            data   : [],
            sorters: [{property: 'name', direction: 'ASC'}]
        });

        test('children of a collapsed parent come back in sort order, not arrival order', () => {
            const store = sorted();

            store.materializePath('Group/B', {name: 'B'});
            store.materializePath('Group/A', {name: 'A'});

            // Read while still collapsed: expanding would sort as a side effect and hide the defect.
            expect(store.get('Group').collapsed).toBe(true);
            expect(store.getChildren('Group').map(r => r.id)).toEqual(['Group/A', 'Group/B']);

            store.destroy()
        });

        test('the ARIA sibling indices describe the sorted order', () => {
            // The ordering constraint that makes this non-trivial: siblingIndex is assigned by array
            // position, so a sort applied after the stats pass would leave the indices describing the
            // pre-sort order — correct-looking children with wrong "n of m" for a screen reader.
            const store = sorted();

            store.materializePath('Group/B', {name: 'B'});
            store.materializePath('Group/A', {name: 'A'});

            expect(store.get('Group/A').siblingIndex).toBe(1);
            expect(store.get('Group/B').siblingIndex).toBe(2);

            store.destroy()
        });

        test('CONTROL: a plain sequential add() reaches the same path', () => {
            // This is why the repair lives in `splice` rather than in materializePath: the divergence
            // predates this API and is reachable with no path materialization at all. A hidden
            // mutation never reaches `super.splice()`, which is what re-sorts the structural levels.
            const store = sorted();

            store.add({id: 'Group',   parentId: 'root',  name: 'Group', isLeaf: false});
            store.add({id: 'Group/B', parentId: 'Group', name: 'B'});
            store.add({id: 'Group/A', parentId: 'Group', name: 'A'});

            expect(store.getChildren('Group').map(r => r.id)).toEqual(['Group/A', 'Group/B']);

            store.destroy()
        });

        test('CONTROL: autoSort:false keeps declaration order even WITH sorters', () => {
            // The predicate is `autoSort && sorters.length`, matching every sort trigger in
            // `Collection.Base`. Gating on `sorters.length` alone imposed an order the consumer had
            // explicitly opted out of — and only on the hidden path, which is a fresh divergence
            // between hidden and visible in the opposite direction from the one being closed here.
            const store = Neo.create(TreeStore, {
                model   : TestModel,
                data    : [],
                autoSort: false,
                sorters : [{property: 'name', direction: 'ASC'}]
            });

            store.materializePath('Group/B', {name: 'B'});
            store.materializePath('Group/A', {name: 'A'});

            expect(store.getChildren('Group').map(r => r.id)).toEqual(['Group/B', 'Group/A']);

            store.destroy()
        });

        test('CONTROL: autoSort:false behaves identically on the VISIBLE path', () => {
            // The pairing is the point: hidden and visible must agree. This arm is what proves the
            // gate restores parity rather than inventing a second policy for collapsed branches.
            const store = Neo.create(TreeStore, {
                model   : TestModel,
                data    : [],
                autoSort: false,
                sorters : [{property: 'name', direction: 'ASC'}]
            });

            store.add({id: 'B', parentId: 'root', name: 'B'});
            store.add({id: 'A', parentId: 'root', name: 'A'});

            expect(store.getChildren('root').map(r => r.id)).toEqual(['B', 'A']);

            store.destroy()
        });

        test('CONTROL: an unsorted store keeps declaration order', () => {
            // The guard is conditioned on active sorters, so the default store must be untouched —
            // otherwise this "fix" would silently impose an ordering policy on every consumer.
            store.materializePath('Group/B', {name: 'B'});
            store.materializePath('Group/A', {name: 'A'});

            expect(store.getChildren('Group').map(r => r.id)).toEqual(['Group/B', 'Group/A'])
        })
    });

    test.describe('AC-6: an escaped separator is one segment', () => {
        test('a segment containing the separator does not become two levels', () => {
            const leaf = store.materializePath('a\\/b/c');

            expect(childIds('root')).toEqual(['a\\/b']);
            expect(store.get('a\\/b').name).toBe('a/b');
            expect(store.get('a\\/b').depth).toBe(0);
            expect(leaf.parentId).toBe('a\\/b');
            expect(leaf.depth).toBe(1)
        });

        test('it stays a distinct node from the two-level path it resembles', () => {
            store.materializePath('a\\/b/c');
            store.materializePath('a/b/c');

            expect(childIds('root').sort()).toEqual(['a', 'a\\/b']);
            expect(store.get('a').childCount).toBe(1)
        });

        test('a store-level separator override is honoured', () => {
            const dotted = Neo.create(TreeStore, {
                model         : TestModel,
                data          : [],
                pathNormalizer: {separator: '.'}
            });

            dotted.materializePath('a.b');

            expect(dotted.getChildren('root').map(r => r.id)).toEqual(['a']);
            expect(dotted.get('a.b').parentId).toBe('a');

            dotted.destroy()
        })
    });

    test.describe('AC-7: incremental materialization is a normal store mutation', () => {
        test('fires mutate with the new records, without rebuilding the store', () => {
            store.materializePath('Group/A');

            const events = [];
            store.on('mutate', data => events.push(data));

            store.materializePath('Group/B');

            expect(events.length).toBe(1);
            expect(events[0].addedItems.map(record => record.id)).toEqual(['Group/B']);
            expect(events[0].removedItems).toEqual([])
        });

        test('an already-present path fires nothing at all', () => {
            store.materializePath('Group/A');

            const events = [];
            store.on('mutate', data => events.push(data));

            store.materializePath('Group/A');

            expect(events.length).toBe(0)
        });

        test('a node materialized under an expanded parent reaches the Projection Layer', () => {
            store.materializePath('Group/A');
            store.expand('Group');

            expect(store.items.map(record => record.id)).toEqual(['Group', 'Group/A']);

            store.materializePath('Group/B');

            expect(store.items.map(record => record.id)).toEqual(['Group', 'Group/A', 'Group/B'])
        })
    });

    test.describe('lifecycle', () => {
        test('a store that never materializes a path never builds a normalizer', () => {
            expect(store.pathNormalizer).toBeNull();

            store.materializePath('A');

            expect(store.pathNormalizer.ntype).toBe('normalizer-path')
        });

        test('destroying the store releases the normalizer', () => {
            store.materializePath('A');

            const normalizer = store.pathNormalizer;

            // The pre-check is what makes the assertion below able to fail: `isDestroyed` is only
            // ever written by `core.Base#destroy`, so it is falsy on a live instance.
            // `Neo.get(id)` is NOT a witness here — it keeps resolving a destroyed instance.
            expect(normalizer.isDestroyed).toBeFalsy();

            store.destroy();
            store = null;

            expect(normalizer.isDestroyed).toBe(true)
        })
    })
});
