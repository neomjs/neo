import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import ComponentService from '../../../../../src/ai/client/ComponentService.mjs';

/**
 * @summary Tests for the pure child-surface differ behind verify_component_consistency
 */
test.describe.serial('Neo.ai.client.ComponentService.diffChildSurfaces', () => {
    test('Consistent surfaces produce no mismatches', () => {
        const result = ComponentService.diffChildSurfaces({
            componentId: 'container-1',
            domIds     : ['a', 'b', 'c'],
            itemIds    : ['a', 'b', 'c'],
            vdomIds    : ['a', 'b', 'c']
        });

        expect(result.consistent).toBe(true);
        expect(result.mismatches).toEqual([]);
        expect(result.counts).toEqual({dom: 3, items: 3, vdom: 3})
    });

    test('Duplicate DOM children are detected (the drop-duplication class)', () => {
        const result = ComponentService.diffChildSurfaces({
            componentId: 'container-1',
            domIds     : ['a', 'b', 'a', 'c'],
            itemIds    : ['a', 'b', 'c'],
            vdomIds    : ['a', 'b', 'c']
        });

        expect(result.consistent).toBe(false);
        expect(result.mismatches.some(m => m.type === 'duplicates' && m.surface === 'dom' && m.ids.includes('a'))).toBe(true);
        expect(result.mismatches.some(m => m.type === 'order-or-membership' && m.surfaces.join() === 'vdom,dom')).toBe(true)
    });

    test('Order divergence between items and vdom is reported', () => {
        const result = ComponentService.diffChildSurfaces({
            componentId: 'container-1',
            domIds     : ['a', 'c', 'b'],
            itemIds    : ['a', 'b', 'c'],
            vdomIds    : ['a', 'c', 'b']
        });

        expect(result.consistent).toBe(false);
        expect(result.mismatches).toHaveLength(1);
        expect(result.mismatches[0].surfaces.join()).toBe('items,vdom')
    });

    test('Missing DOM root is its own mismatch and skips DOM comparisons', () => {
        const result = ComponentService.diffChildSurfaces({
            componentId: 'container-1',
            domIds     : null,
            itemIds    : ['a'],
            vdomIds    : ['a']
        });

        expect(result.consistent).toBe(false);
        expect(result.mismatches).toEqual([{type: 'dom-root-missing'}]);
        expect(result.counts.dom).toBe(null)
    });
});
