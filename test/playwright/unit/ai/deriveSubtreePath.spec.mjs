import {test, expect}      from '@playwright/test';
import {deriveSubtreePath} from '../../../../src/ai/deriveSubtreePath.mjs';

// Pure function — imported directly; no Neo globals, no setup, no host side-effects.
test.describe('deriveSubtreePath (absolute root→node id path for NL lock enforcement)', () => {
    // {childId: parentId} map → an injectable parentOf(id) lookup
    const treeLookup = tree => id => tree[id];

    test('derives the absolute root→node path from a linear chain', () => {
        const parentOf = treeLookup({button: 'panel', panel: 'viewport', viewport: null});

        expect(deriveSubtreePath('button', parentOf)).toEqual(['viewport', 'panel', 'button']);
    });

    test('a root component (no parent) is its own single-element path', () => {
        expect(deriveSubtreePath('viewport', treeLookup({viewport: null}))).toEqual(['viewport']);
    });

    test("stops at Neo's top-level 'document.body' sentinel (the body is not a component)", () => {
        const parentOf = treeLookup({panel: 'viewport', viewport: 'document.body'});

        expect(deriveSubtreePath('panel', parentOf)).toEqual(['viewport', 'panel']);
    });

    test('fails closed to null on a cyclic chain rather than looping', () => {
        const parentOf = treeLookup({a: 'b', b: 'c', c: 'a'});

        expect(deriveSubtreePath('a', parentOf)).toBeNull();
    });

    test('fails closed to null for a malformed component id', () => {
        const parentOf = treeLookup({});

        expect(deriveSubtreePath('',              parentOf)).toBeNull();
        expect(deriveSubtreePath(null,            parentOf)).toBeNull();
        expect(deriveSubtreePath('document.body', parentOf)).toBeNull();
    });

    test('stops at a falsy (absent) parent — best-effort for a caller-held tree', () => {
        // parentOf('missingParent') has no entry → undefined → the walk ends there
        const parentOf = treeLookup({child: 'missingParent'});

        expect(deriveSubtreePath('child', parentOf)).toEqual(['missingParent', 'child']);
    });
});
