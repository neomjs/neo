import {setup} from '../../setup.mjs';

const appName = 'TreeBuilderTest';

setup({
    neoConfig: {
        useDomApiRenderer: true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import TreeBuilder    from '../../../../src/util/vdom/TreeBuilder.mjs';

class MockComponent extends Component {
    static config = {
        className: 'Test.Unit.Vdom.TreeBuilder.MockComponent',
        ntype: 'test-unit-vdom-treebuilder-mock',
        _vdom: {tag: 'div'}
    }
}
MockComponent = Neo.setupClass(MockComponent);

/**
 * @summary Validates the logic of `Neo.util.vdom.TreeBuilder`.
 *
 * Ensures that the VDOM tree is constructed correctly with respect to:
 * 1. Optimization: Pruning mounted subtrees (`neoIgnore`) at depth boundaries.
 * 2. Correctness: Expanding unmounted subtrees (Wake Up) even at depth boundaries.
 * 3. Missing children: a hole, `null` or `undefined` in a child array is dropped.
 */
test.describe('Neo.util.vdom.TreeBuilder', () => {
    let testIdCounter = 0;
    const getUniqueId = (prefix) => `${prefix}-${Date.now()}-${testIdCounter++}`;

    /**
     * Verifies the standard optimization: If a child component is already mounted (has vnode),
     * and we are at the update depth limit (1), we should send a placeholder reference
     * with `neoIgnore: true`. This tells `VdomHelper` to skip diffing this subtree.
     */
    test('Should set neoIgnore: true for mounted components at depth 1', () => {
        const childId = getUniqueId('child-1');
        const child = Neo.create(MockComponent, {
            id: childId,
            appName
        });

        // Simulate mounted state (has vnode)
        child.vnode = {id: childId, vtype: 'vnode'};

        const vdom = {
            id: 'parent',
            cn: [{componentId: childId}]
        };

        const tree = TreeBuilder.getVdomTree(vdom, 1);

        expect(tree.cn[0].componentId).toBe(childId);
        expect(tree.cn[0].neoIgnore).toBe(true);
    });

    /**
     * Verifies the "Wake Up" logic: If a child component is unmounted (missing vnode),
     * we MUST expand it (send full VDOM) even if we are at the update depth limit.
     * Sending `neoIgnore` for a missing node would prevent `VdomHelper` from inserting it.
     */
    test('Should NOT set neoIgnore for unmounted components (no vnode) at depth 1', () => {
        const childId = getUniqueId('child-2');
        const child = Neo.create(MockComponent, {
            id: childId,
            appName
        });

        // Simulate unmounted state (no vnode)
        child.vnode = null;

        const vdom = {
            id: 'parent',
            cn: [{componentId: childId}]
        };

        const tree = TreeBuilder.getVdomTree(vdom, 1);

        // When expanded, the reference is replaced by the component's VDOM root (which is a div)
        // It does NOT have componentId on it unless the component vdom has it.
        expect(tree.cn[0].tag).toBe('div');
        expect(tree.cn[0].componentId).toBeUndefined();
        expect(tree.cn[0].neoIgnore).toBeUndefined();
    });

    /**
     * A missing child, a hole in a sparse array or an explicit `null` or `undefined`, renders nothing,
     * the way `vdom.Helper#createVnode` skips it. Both trees drop it and keep the present children in order.
     */
    test('Should drop a missing child (hole, null, undefined) from both trees at every depth', () => {
        const withMissingChildren = {
            hole     : (a, b) => {const cn = []; cn[1] = a; cn[3] = b; return cn},
            null     : (a, b) => [null, a, null, b],
            undefined: (a, b) => [undefined, a, undefined, b]
        };

        Object.entries(withMissingChildren).forEach(([kind, makeChildren]) => {
            [-1, 1].forEach(depth => {
                const
                    present = [`a-${kind}`, `b-${kind}`],
                    vdom    = {id: `vdom-${kind}`,  cn        : makeChildren({id: present[0], tag: 'b'}, {id: present[1], tag: 'i'})},
                    vnode   = {id: `vnode-${kind}`, childNodes: makeChildren({id: present[0]},           {id: present[1]})};

                expect(TreeBuilder.getVdomTree(vdom, depth).cn.map(node => node.id), `${kind} in cn, depth ${depth}`).toEqual(present);
                expect(TreeBuilder.getVnodeTree(vnode, depth).childNodes.map(node => node.id), `${kind} in childNodes, depth ${depth}`).toEqual(present)
            })
        })
    });
});