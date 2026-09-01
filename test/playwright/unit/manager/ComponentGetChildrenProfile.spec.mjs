import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name             : 'GetChildrenProfileTest',
        isMounted        : () => true,
        vnodeInitialising: false
    },
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import ComponentManager   from '../../../../src/manager/Component.mjs';
import Component          from '../../../../src/component/Base.mjs';
import Container          from '../../../../src/container/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs'; // <--- RENDERER
import VdomHelper         from '../../../../src/vdom/Helper.mjs'; // <--- ENGINE

test.describe.serial('ComponentManager getChildren Profile', () => {

    test('Profile getChildren vs getChildComponents with high DOM ratio', async () => {
        // 1. Create a parent component
        const parent = Neo.create(Component, { id: 'parent-1', appName: 'GetChildrenProfileTest' });

        // 2. Create 50 child components
        const children = [];
        for (let i = 0; i < 50; i++) {
            const child = Neo.create(Component, { id: `child-${i}`, parentId: 'parent-1', appName: 'GetChildrenProfileTest' });
            children.push(child);
        }

        // 3. Build a massive VNode tree simulating what the VDomWorker returns
        // It must be fully expanded, meaning it contains the actual HTML nodes, NOT placeholders.
        // It must also contain the root nodes of the 50 child components, so getChildren() finds them.
        let deepVnodes = [];
        for (let i = 0; i < 10000; i++) {
            deepVnodes.push({nodeName: 'div', id: `div-${i}`});
        }
        
        // Add the child component roots to the tree
        for (let i = 0; i < 50; i++) {
            deepVnodes.push({nodeName: 'span', id: `child-${i}`});
        }

        // Assign the massive tree to the parent (bypassing initVnode to keep it expanded)
        parent._vnode = {
            nodeName: 'div',
            id: 'parent-1',
            childNodes: deepVnodes
        };

        // --- Benchmark 1: The current getChildren() (DOM Crawler) ---
        const start1 = performance.now();
        const childrenFromDom = ComponentManager.getChildren(parent);
        const duration1 = performance.now() - start1;

        // --- Benchmark 2: The proposed getChildComponents() (Logical Map) ---
        const start2 = performance.now();
        const childrenFromMap = ComponentManager.getChildComponents(parent);
        const duration2 = performance.now() - start2;

        // The logical map crawler should be significantly faster than the DOM crawler (at least 5x faster)
        expect(duration2 * 5).toBeLessThan(duration1);

        // Assert they find the same amount of components
        expect(childrenFromDom.length).toBe(childrenFromMap.length);
        expect(childrenFromDom.length).toBe(50);

        children.forEach(c => c.destroy());
        parent.destroy();
    });

    test('Profile ancestor reference refresh: canonical fast path and 10k raw-tail replacement', () => {
        const
            appName       = 'GetChildrenProfileTest',
            owner         = Neo.create(Component, {appName, id: 'reference-profile-owner'}),
            rawNodes      = Array.from({length: 10000}, (item, index) => ({
                childNodes: [],
                id        : `reference-profile-node-${index}`
            })),
            canonicalTree = {
                childNodes: [owner.createVdomReference(), ...rawNodes],
                id        : 'reference-profile-parent'
            },
            rawTailNodes  = [...rawNodes, {childNodes: [], id: owner.id}],
            rawTailTree   = {
                childNodes: rawTailNodes,
                id        : 'reference-profile-raw-parent'
            },
            fastIterations = 5000,
            scanIterations = 40;

        // Warm both shapes before measuring JIT-stable loops.
        ComponentManager.ensureVnodeComponentReference(canonicalTree, owner);
        rawTailTree.childNodes = rawTailNodes;
        ComponentManager.ensureVnodeComponentReference(rawTailTree, owner);

        let startedAt = performance.now();

        for (let index = 0; index < fastIterations; index++) {
            ComponentManager.ensureVnodeComponentReference(canonicalTree, owner)
        }

        const canonicalPerCall = (performance.now() - startedAt) / fastIterations;

        startedAt = performance.now();

        for (let index = 0; index < scanIterations; index++) {
            rawTailTree.childNodes = rawTailNodes;
            ComponentManager.ensureVnodeComponentReference(rawTailTree, owner)
        }

        const rawTailPerCall = (performance.now() - startedAt) / scanIterations;

        startedAt = performance.now();

        for (let index = 0; index < scanIterations; index++) {
            ComponentManager.addVnodeComponentReferences({
                childNodes: rawTailNodes,
                id        : 'reference-profile-full-parent'
            }, 'reference-profile-full-parent')
        }

        const fullCanonicalizePerCall = (performance.now() - startedAt) / scanIterations;

        console.log('ancestor reference profile (ms/call)', {
            canonicalPerCall,
            fullCanonicalizePerCall,
            rawTailPerCall
        });

        expect(rawTailTree.childNodes.at(-1)).toEqual(expect.objectContaining({
            componentId: owner.id
        }));
        expect(canonicalPerCall * 20).toBeLessThan(rawTailPerCall);
        expect(rawTailPerCall).toBeLessThan(fullCanonicalizePerCall);

        owner.destroy()
    });
});
