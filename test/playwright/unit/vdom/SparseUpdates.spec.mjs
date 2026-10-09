
import {setup} from '../../setup.mjs';

const appName = 'SparseUpdatesTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Container      from '../../../../src/container/Base.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

// Mock applyDeltas to prevent errors during mount
const realApplyDeltas = Neo.applyDeltas; // patched at import; restored in afterAll below

Neo.applyDeltas = async () => {};

test.afterAll(() => {
    Neo.applyDeltas = realApplyDeltas;
});

class SparseMockComponent extends Component {
    static config = {
        className: 'Test.SparseMockComponent',
        ntype    : 'test-sparse-component',
        _vdom    : {tag: 'div', cls: ['child-component']}
    }
}
SparseMockComponent = Neo.setupClass(SparseMockComponent);

class SparseMockContainer extends Container {
    static config = {
        className: 'Test.SparseMockContainer',
        ntype    : 'test-sparse-container',
        _vdom    : {tag: 'div', cls: ['child-container']}
    }
}
SparseMockContainer = Neo.setupClass(SparseMockContainer);

test.describe('Sparse VDOM Updates', () => {
    let container, dirtyChild, cleanChild, testRun = 0;
    const uniquePrefix = Date.now() + Math.random();

    test.beforeEach(async () => {
        testRun++;
    });

    test.afterEach(() => {
        if (container) {
            container.destroy();
            container = null;
        }
    });

    for (const mode of ['sparse-excluded', 'sparse-included', 'dense', 'full']) {
        test(`Collision filtering preserves a dirty sibling: ${mode}`, async () => {
            container = Neo.create(SparseMockContainer, {
                appName,
                id   : `root-${uniquePrefix}-${testRun}`,
                items: [{
                    module: SparseMockContainer,
                    items : [
                        {module: SparseMockComponent, text: 'A old'},
                        {module: SparseMockComponent, text: 'B old'},
                        {module: SparseMockComponent, text: 'Clean'}
                    ]
                }]
            });

            await container.ready();
            await container.initVnode(true);
            container.mounted = true;

            const parent        = container.items[0],
                  [a, b, clean] = parent.items;

            // Settle initial full-depth work before requesting a finite sparse update.
            for (const component of [container, parent, a, b, clean]) {
                await component.promiseUpdate()
            }

            const updateBatch = VdomHelper.updateBatch,
                  batches     = [];

            VdomHelper.updateBatch = function(data) {
                batches.push({
                    roots      : Object.keys(data.updates),
                    prunedClean: data.updates[parent.id].vdom.cn.some(node =>
                        node.componentId === clean.id && node.neoIgnore === true)
                });
                return updateBatch.call(this, data)
            };

            try {
                container.setSilent({style: {color: 'green'}, updateDepth: 1});
                if (mode !== 'sparse-included') b.setSilent({text: 'B new'});
                parent.setSilent({style: {color: 'purple'}, updateDepth: mode === 'full' ? -1 : 2});
                if (mode === 'sparse-included') b.setSilent({text: 'B new'});
                a.setSilent({text: 'A new'});
                if (mode === 'dense') parent.denseUpdate = true;

                const result = await container.promiseUpdate();

                expect(result.deltas.filter(delta => delta.textContent === 'B new')).toHaveLength(1);
                expect(b.vnode.textContent).toBe('B new');
                expect(a.vnode.textContent).toBe('A new');
                expect(b.needsVdomUpdate).toBe(false);
                expect(batches).toHaveLength(1);
                expect(batches[0].roots.includes(b.id)).toBe(mode === 'sparse-excluded');
                expect(batches[0].prunedClean).toBe(mode.startsWith('sparse'));
            } finally {
                VdomHelper.updateBatch = updateBatch
            }
        });
    }

    test('TreeBuilder prunes clean siblings at finite depth', async () => {
        container = Neo.create(SparseMockContainer, {
            appName,
            id: `parent-tb-${uniquePrefix}-${testRun}`,
            items: [
                {module: SparseMockComponent, id: `dirty-tb-${uniquePrefix}-${testRun}`, text: 'Dirty'},
                {module: SparseMockComponent, id: `clean-tb-${uniquePrefix}-${testRun}`, text: 'Clean'}
            ]
        });

        await container.initVnode(true);
        dirtyChild = container.items[0];
        cleanChild = container.items[1];

        // Simulate the state inside VdomLifecycle.executeVdomUpdate
        const NeoTreeBuilder = Neo.util.vdom.TreeBuilder;
        const updateDepth = 2;

        // Mock the mergedChildIds set (simulating dirtyChild is merged)
        const mergedChildIds = new Set([dirtyChild.id]);

        // Run TreeBuilder
        const vdomTree = NeoTreeBuilder.getVdomTree(container.vdom, updateDepth, mergedChildIds);

        // Find the children in the generated tree
        // Note: Expanded nodes lose 'componentId' property, they are replaced by the component's vdom (which has 'id')
        const dirtyItem = vdomTree.cn.find(n => n.id === dirtyChild.id);
        // Clean item is pruned, so it retains 'componentId' and lacks 'id' (unless explicitly set on placeholder)
        const cleanItem = vdomTree.cn.find(n => n.componentId === cleanChild.id);

        // Verification
        // Dirty Item should be expanded
        expect(dirtyItem.tag).toBe('div');

        // Clean Item:
        // NEW BEHAVIOR (Sparse): It should be a placeholder { componentId: '...' } with NO tag
        // because it was pruned by the AllowList logic.
        expect(cleanItem.tag).toBeUndefined();
        expect(cleanItem.componentId).toBe(cleanChild.id);
    });
});
