import {setup} from '../../../setup.mjs';

const appName = 'PathNormalizerTest';

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
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import PathNormalizer from '../../../../../src/data/normalizer/Path.mjs';

test.describe('Neo.data.normalizer.Path', () => {
    let normalizer;

    test.beforeEach(() => {
        normalizer = Neo.create(PathNormalizer)
    });

    test.afterEach(() => {
        normalizer?.destroy()
    });

    test.describe('splitPath()', () => {
        test('derives every ancestor id from its own path prefix', () => {
            expect(normalizer.splitPath('A/B/C')).toEqual([
                {id: 'A',     name: 'A'},
                {id: 'A/B',   name: 'B'},
                {id: 'A/B/C', name: 'C'}
            ])
        });

        test('a single segment is a root-level leaf', () => {
            expect(normalizer.splitPath('Group')).toEqual([{id: 'Group', name: 'Group'}])
        });

        test('an escaped separator keeps the segment whole', () => {
            // 'a\/b/c' is the two-level path  a/b  ->  c
            expect(normalizer.splitPath('a\\/b/c')).toEqual([
                {id: 'a\\/b',   name: 'a/b'},
                {id: 'a\\/b/c', name: 'c'}
            ])
        });

        test('an escaped path stays distinct from the two-level path it resembles', () => {
            // The discriminator: both read as "a", "b", "c" once unescaped, so if the id dropped the
            // escape char the two would collide on the same node.
            const escaped = normalizer.splitPath('a\\/b/c'),
                  plain   = normalizer.splitPath('a/b/c');

            expect(escaped.length).toBe(2);
            expect(plain.length).toBe(3);
            expect(escaped.at(-1).id).not.toBe(plain.at(-1).id)
        });

        test('a custom separator is honoured', () => {
            const dotted = Neo.create(PathNormalizer, {separator: '.'});

            expect(dotted.splitPath('a.b')).toEqual([
                {id: 'a',   name: 'a'},
                {id: 'a.b', name: 'b'}
            ]);

            // and '/' is then an ordinary character
            expect(dotted.splitPath('a/b')).toEqual([{id: 'a/b', name: 'a/b'}]);

            dotted.destroy()
        });

        test('an ambiguous path throws rather than resolving to a guess', () => {
            expect(() => normalizer.splitPath('/A')).toThrow(/empty segment/);
            expect(() => normalizer.splitPath('A/')).toThrow(/empty segment/);
            expect(() => normalizer.splitPath('A//B')).toThrow(/empty segment/);
            expect(() => normalizer.splitPath('')).toThrow(/non-empty string/);
            expect(() => normalizer.splitPath(null)).toThrow(/non-empty string/)
        })
    });

    test.describe('materialize()', () => {
        test('emits ancestors before the leaf, correctly parented', () => {
            expect(normalizer.materialize('A/B/C')).toEqual([
                {id: 'A',     name: 'A', isLeaf: false, parentId: 'root'},
                {id: 'A/B',   name: 'B', isLeaf: false, parentId: 'A'},
                {id: 'A/B/C', name: 'C', isLeaf: true,  parentId: 'A/B'}
            ])
        });

        test('ordering is load-bearing: no child ever precedes its parent', () => {
            const records = normalizer.materialize('A/B/C/D/E'),
                  emitted = new Set(['root']);

            for (const record of records) {
                expect(emitted.has(record.parentId)).toBe(true);
                emitted.add(record.id)
            }
        });

        test('merges the leaf payload without letting it override identity', () => {
            const leaf = normalizer.materialize('Group', {
                id      : 'ignored',
                parentId: 'ignored',
                iconCls : 'fa fa-home'
            }).at(-1);

            expect(leaf.id).toBe('Group');
            expect(leaf.parentId).toBe('root');
            expect(leaf.iconCls).toBe('fa fa-home')
        });

        test('a payload may name the leaf and declare it a non-leaf', () => {
            const records = normalizer.materialize('A/b-id', {name: 'Pretty', isLeaf: false}),
                  leaf    = records.at(-1);

            expect(leaf.name).toBe('Pretty');
            expect(leaf.isLeaf).toBe(false);

            // the synthesized ancestor keeps its own segment name — the payload is the leaf's alone
            expect(records[0]).toEqual({id: 'A', name: 'A', isLeaf: false, parentId: 'root'})
        });

        test('does not mutate the payload, and drops the path property from the record', () => {
            const payload = {path: 'A/B', iconCls: 'x'},
                  records = normalizer.materialize('A/B', payload);

            expect(payload).toEqual({path: 'A/B', iconCls: 'x'});
            expect(Object.hasOwn(records.at(-1), 'path')).toBe(false)
        });

        test('omits everything the exists predicate already accounts for', () => {
            const existing = new Set(['A', 'A/B']);

            expect(normalizer.materialize('A/B/C', {}, id => existing.has(id))).toEqual([
                {id: 'A/B/C', name: 'C', isLeaf: true, parentId: 'A/B'}
            ]);

            existing.add('A/B/C');
            expect(normalizer.materialize('A/B/C', {}, id => existing.has(id))).toEqual([])
        });

        test('writes no invariant the Structural Layer owns', () => {
            // depth / childCount / siblingIndex / siblingCount are derived on ingestion. Emitting them
            // here would produce a store that renders correctly and reports ARIA incorrectly.
            for (const record of normalizer.materialize('A/B/C')) {
                for (const field of ['depth', 'childCount', 'siblingIndex', 'siblingCount']) {
                    expect(Object.hasOwn(record, field)).toBe(false)
                }
            }
        })
    });

    test.describe('normalize()', () => {
        test('shares ancestors across entries and reports the real total', () => {
            const {data, totalCount} = normalizer.normalize([
                {path: 'Group/A'},
                {path: 'Group/B'}
            ]);

            expect(data.map(record => record.id)).toEqual(['Group', 'Group/A', 'Group/B']);
            expect(totalCount).toBe(3)
        });

        test('is order-independent across entries', () => {
            const forward = normalizer.normalize([{path: 'Group/A'}, {path: 'Group/B'}]).data,
                  reverse = normalizer.normalize([{path: 'Group/B'}, {path: 'Group/A'}]).data;

            const byId = records => Object.fromEntries(records.map(r => [r.id, r.parentId]));

            expect(byId(forward)).toEqual(byId(reverse));
            expect(forward.length).toBe(reverse.length)
        });

        test('a repeated path within one batch is emitted once', () => {
            const {data} = normalizer.normalize([
                {path: 'Group/A'},
                {path: 'Group/A'},
                {path: 'Group'}
            ]);

            expect(data.map(record => record.id)).toEqual(['Group', 'Group/A'])
        });

        test('accepts a single entry', () => {
            expect(normalizer.normalize({path: 'A'}).data.map(r => r.id)).toEqual(['A']);
            expect(normalizer.normalize(null).data).toEqual([])
        })
    })
});
