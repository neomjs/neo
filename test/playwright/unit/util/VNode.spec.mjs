import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'VNodeUtilTest'
    }
});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import Component        from '../../../../src/component/Base.mjs';
import ComponentManager from '../../../../src/manager/Component.mjs';
import VNode            from '../../../../src/util/VNode.mjs';

/**
 * @summary A stored vnode names each child component by a `{componentId}` reference, and every
 * walker resolves such references through the component registry — strictly, because a reference
 * to nothing is a broken tree. The one tree allowed to carry a stale reference is a flight's
 * returned vnode: collected while the child was alive, landing after the child was retired. The
 * landing boundary prunes those before the strict walkers see them.
 */
test.describe('Neo.util.VNode', () => {
    test('pruneRetiredReferences drops a reference whose component left the registry and keeps the rest', () => {
        const live = Neo.create(Component, {id: 'vnode-util-live'}),
              gone = Neo.create(Component, {id: 'vnode-util-gone'});

        gone.destroy();

        expect(ComponentManager.get('vnode-util-gone'), 'the retired component is out of the registry').toBeFalsy();

        const tree = {
            id        : 'vnode-util-root',
            childNodes: [
                {componentId: 'vnode-util-live'},
                {componentId: 'vnode-util-gone'},
                {
                    id        : 'vnode-util-wrapper',
                    childNodes: [{componentId: 'vnode-util-gone'}, {id: 'vnode-util-leaf', childNodes: []}]
                }
            ]
        };

        try {
            expect(VNode.pruneRetiredReferences(tree), 'both stale references are counted').toBe(2);

            expect(tree.childNodes.map(node => node.componentId || node.id)).toEqual(['vnode-util-live', 'vnode-util-wrapper']);
            expect(tree.childNodes[1].childNodes.map(node => node.id)).toEqual(['vnode-util-leaf']);

            // A live reference is kept as a reference — the walk never descends into another
            // component's stored vnode, which is that component's own to keep clean.
            expect(tree.childNodes[0]).toEqual({componentId: 'vnode-util-live'});

            // The strict walkers stay strict: the pruned tree maps without touching the registry for
            // anything that is gone, and an unpruned stale reference still throws.
            expect([...VNode.createMap(tree).keys()]).toContain('vnode-util-leaf');
            expect(() => VNode.getVnode({componentId: 'vnode-util-gone'})).toThrow('Component not found for id: vnode-util-gone')
        } finally {
            live.destroy()
        }
    });
});
