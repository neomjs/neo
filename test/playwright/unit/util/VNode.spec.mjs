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
 * to nothing is a broken tree. A reference goes stale in a parent's stored vnode when its child
 * retires, and in a flight's returned vnode collected while the child was alive. Both places unlink
 * it, keeping the node the DOM still holds.
 */
test.describe('Neo.util.VNode', () => {
    test('unlinkRetiredReferences keeps a retired component\'s node unnamed, and every live reference as it is', () => {
        const live = Neo.create(Component, {id: 'vnode-util-live'}),
              gone = Neo.create(Component, {id: 'vnode-util-gone'});

        gone.destroy();

        expect(ComponentManager.get('vnode-util-gone'), 'the retired component is out of the registry').toBeFalsy();

        // What the retiring component last rendered, naming a child that retired before it
        const rendered = {id: 'vnode-util-gone', nodeName: 'div', childNodes: [{componentId: 'vnode-util-gone-child'}]},
              tree     = {
                  id        : 'vnode-util-root',
                  childNodes: [
                      {componentId: 'vnode-util-live'},
                      {componentId: 'vnode-util-gone'},
                      {
                          id        : 'vnode-util-wrapper',
                          childNodes: [{componentId: 'vnode-util-other', id: 'vnode-util-other-wrapper'}, {id: 'vnode-util-leaf', childNodes: []}]
                      }
                  ]
              };

        try {
            expect(VNode.unlinkRetiredReferences(tree, {'vnode-util-gone': rendered}), 'every stale reference is counted, nested ones included').toBe(3);

            // A live reference is kept as a reference — the walk never descends into another
            // component's stored vnode, which is that component's own to keep clean.
            expect(tree.childNodes[0]).toEqual({componentId: 'vnode-util-live'});

            expect(tree.childNodes[1], 'the retiring component\'s node stays as it rendered it').toEqual({
                id        : 'vnode-util-gone',
                nodeName  : 'div',
                childNodes: [{id: 'vnode-util-gone-child'}]
            });

            expect(tree.childNodes[2].childNodes[0], 'with no rendered vnode to hand, the node keeps its reference\'s DOM id').toEqual({id: 'vnode-util-other-wrapper'});

            // The strict walkers stay strict: the unlinked tree maps without touching the registry for
            // anything that is gone, and a stale reference left in place still throws.
            expect([...VNode.createMap(tree).keys()]).toEqual(expect.arrayContaining(['vnode-util-gone', 'vnode-util-gone-child', 'vnode-util-other-wrapper', 'vnode-util-leaf']));
            expect(() => VNode.getVnode({componentId: 'vnode-util-gone'})).toThrow('Component not found for id: vnode-util-gone')
        } finally {
            live.destroy()
        }
    });
});
