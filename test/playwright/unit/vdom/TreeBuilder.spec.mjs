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
        className: 'Test.MockComponent',
        ntype: 'test-mock',
        _vdom: {tag: 'div'}
    }
}
MockComponent = Neo.setupClass(MockComponent);

test.describe('Neo.util.vdom.TreeBuilder', () => {

    test('Should set neoIgnore: true for mounted components at depth 1', () => {
        const child = Neo.create(MockComponent, {
            id: 'child-1',
            appName
        });
        
        // Simulate mounted state (has vnode)
        child.vnode = {id: 'child-1', vtype: 'vnode'};

        const vdom = {
            id: 'parent',
            cn: [{componentId: 'child-1'}]
        };

        const tree = TreeBuilder.getVdomTree(vdom, 1);

        expect(tree.cn[0].componentId).toBe('child-1');
        expect(tree.cn[0].neoIgnore).toBe(true);
    });

    test('Should NOT set neoIgnore for unmounted components (no vnode) at depth 1', () => {
        const child = Neo.create(MockComponent, {
            id: 'child-2',
            appName
        });
        
        // Simulate unmounted state (no vnode)
        child.vnode = null;

        const vdom = {
            id: 'parent',
            cn: [{componentId: 'child-2'}]
        };

        const tree = TreeBuilder.getVdomTree(vdom, 1);

        // When expanded, the reference is replaced by the component's VDOM root (which is a div)
        // It does NOT have componentId on it unless the component vdom has it.
        expect(tree.cn[0].tag).toBe('div');
        expect(tree.cn[0].componentId).toBeUndefined();
        expect(tree.cn[0].neoIgnore).toBeUndefined();
    });
});
