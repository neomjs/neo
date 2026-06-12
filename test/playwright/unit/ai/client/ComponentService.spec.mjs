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

test.describe.serial('Neo.ai.client.ComponentService.observeMotion', () => {
    const originalNow = Date.now;

    let originalGetComponent, originalMain, now, service;

    test.beforeEach(() => {
        originalGetComponent = Neo.getComponent;
        originalMain         = Neo.main;
        now                  = 1000;
        Date.now             = () => now;
        service              = Neo.create(ComponentService);
        service.timeout      = async ms => {
            now += ms
        };
    });

    test.afterEach(() => {
        Date.now         = originalNow;
        Neo.getComponent = originalGetComponent;
        Neo.main         = originalMain;
        service.destroy()
    });

    test('samples raw nodeIds through DomAccess with explicit window routing', async () => {
        const calls = [];

        Neo.getComponent = () => null;
        Neo.main = {
            DomAccess: {
                getBoundingClientRect: async data => {
                    calls.push(data);

                    return [
                        {left: 10, top: 20, width: 30, height: 40},
                        {}
                    ]
                }
            }
        };

        const result = await service.observeMotion({
            durationMs: 100,
            intervalMs: 100,
            nodeIds   : ['row-1__cell-0', 'missing-cell'],
            windowId  : 'win-1'
        });

        expect(calls).toEqual([{id: ['row-1__cell-0', 'missing-cell'], windowId: 'win-1'}]);
        expect(result.componentIds).toEqual([]);
        expect(result.nodeIds).toEqual(['row-1__cell-0', 'missing-cell']);
        expect(result.targetIds).toEqual(['row-1__cell-0', 'missing-cell']);
        expect(result.samples).toEqual([{
            t    : 0,
            rects: [
                {left: 10, top: 20, width: 30, height: 40},
                null
            ]
        }])
    });

    test('samples mixed componentIds and nodeIds in component-first order', async () => {
        const calls = [];

        Neo.getComponent = id => id === 'toolbar-1' ? {id, windowId: 'win-c'} : null;
        Neo.main = {
            DomAccess: {
                getBoundingClientRect: async data => {
                    calls.push(data);

                    return [
                        {left: 1, top: 2, width: 3, height: 4},
                        {left: 5, top: 6, width: 7, height: 8}
                    ]
                }
            }
        };

        const result = await service.observeMotion({
            componentIds: ['toolbar-1'],
            durationMs  : 100,
            intervalMs  : 100,
            nodeIds     : ['row-1__cell-0']
        });

        expect(calls).toEqual([{id: ['toolbar-1', 'row-1__cell-0'], windowId: 'win-c'}]);
        expect(result.componentIds).toEqual(['toolbar-1']);
        expect(result.nodeIds).toEqual(['row-1__cell-0']);
        expect(result.targetIds).toEqual(['toolbar-1', 'row-1__cell-0'])
    });

    test('preserves the component-only getDomRect path', async () => {
        const calls = [];

        Neo.getComponent = id => id === 'toolbar-1' ? {
            id,
            windowId   : 'win-c',
            getDomRect : async ids => {
                calls.push(ids);

                return {left: 1, top: 2, width: 3, height: 4}
            }
        } : null;
        Neo.main = {DomAccess: {}};

        const result = await service.observeMotion({
            componentIds: ['toolbar-1'],
            durationMs  : 100,
            intervalMs  : 100
        });

        expect(calls).toEqual([['toolbar-1']]);
        expect(result.nodeIds).toEqual([]);
        expect(result.targetIds).toEqual(['toolbar-1']);
        expect(result.samples[0].rects).toEqual([{left: 1, top: 2, width: 3, height: 4}])
    });

    test('expands cellsOf into raw node targets', async () => {
        Neo.getComponent = () => null;
        Neo.main = {
            DomAccess: {
                getBoundingClientRect: async () => [
                    {left: 1, top: 2, width: 3, height: 4},
                    {left: 5, top: 6, width: 7, height: 8}
                ],
                getChildNodeIds: async ({id, windowId}) => {
                    expect(id).toBe('row-1');
                    expect(windowId).toBe('win-1');

                    return ['row-1__cell-0', 'row-1__cell-1']
                }
            }
        };

        const result = await service.observeMotion({
            cellsOf   : {rowId: 'row-1'},
            durationMs: 100,
            intervalMs: 100,
            windowId  : 'win-1'
        });

        expect(result.nodeIds).toEqual(['row-1__cell-0', 'row-1__cell-1']);
        expect(result.targetIds).toEqual(['row-1__cell-0', 'row-1__cell-1'])
    });

    test('requires at least one target source', async () => {
        await expect(service.observeMotion({durationMs: 100, intervalMs: 100})).rejects.toThrow(
            'componentIds, nodeIds, or cellsOf must provide at least one target'
        )
    });
});
